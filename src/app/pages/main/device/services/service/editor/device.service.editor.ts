import { computed, Directive, inject, OnInit, signal, ViewContainerRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { Action, DeviceInstance, Service } from '@openxiot/xiot-core-spec-ts';
import { AccountService } from '../../../../../../service/account.service';
import { MainI18nService } from '../../../../../../service/i18n.service';
import { MatrixService } from '../../../../../../service/matrix.service';
import { ModbusService } from '../../../../../../service/modbus.service';
import { ProductService } from '../../../../../../service/product.service';
import { DeviceEntity } from '../../../../../../typedef/define/device/DeviceEntity';
import { ModbusConfig } from '../../../../../../typedef/define/modbus/Modbus';
import {
  ModbusService as ModbusServiceDef,
  ModbusServiceFieldAlarm,
  ModbusServiceFunction,
} from '../../../../../../typedef/define/modbus/ModbusService';
import { newAlarmId } from '../../../../../../typedef/define/modbus/ModbusAlarm';
import { SpaceRef } from '../../../../../../typedef/define/space/SpaceRef';
import {
  WRITE_METHOD_REPLY_KEY,
  alarmCount,
  alarmItems,
  alarmKey,
  alarmSignature,
  buildServiceFunctions,
  describeFunctionResponse,
  isReadFunction,
  pollSignature,
  serviceChanged,
  withAlarmsOf,
  type FunctionPoll,
  type ServiceAlarmItem,
  type ServiceBaseline,
} from '../service.functions';
import {
  DeviceServiceAlarmDialogComponent,
  type ServiceAlarmDialogData,
} from './alarms/device.service.alarm.dialog.component';
import { Location } from '@angular/common';

/**
 * 自动调用周期的上下限（秒）：与后端 ModbusServiceValidator 的 MIN/MAX_INTERVAL_SECONDS 同口径 ——
 * 下限 5 秒（RS485 是共享总线，周期太密会把总线吃满），上限 3600 秒（再长就该由人手动调用，
 * 而不是挂个几乎不跑的定时器）。两边改动要同步，否则前端放过去的值会被后端拒掉。
 */
const MIN_INTERVAL_SECONDS = 5;
const MAX_INTERVAL_SECONDS = 3600;

/**
 * 打开自动轮询时给的起步周期（秒）：后端要求「开了轮询就必须有周期」，
 * 总不能因为用户先拨开关、还没来得及填周期就卡住保存 —— 填个保守值，用户随即能改。
 */
const DEFAULT_INTERVAL_SECONDS = 60;

/**
 * 「添加 Modbus 服务」/「编辑 Modbus 服务」两个页面共用的编辑器逻辑与视图。
 *
 * 一份服务定义由三件事拼出来，用户在页面上的操作面很窄：
 * 1. **依赖设备坐标**：本页路由上的 DTU（did）→ 其产品实例里的 Service → Action（用户选），
 *    入参 piid 从选中 Action 的**唯一入参**自动取（DTU 承载数据的动作只有一个入参），
 *    取不到按 0 落库 —— 全程不填，只读展示；
 * 2. **源点表**（点表配置 ID，用户选）：方法列表由点表现场展开，
 *    一个功能码动作 = 一个方法（序号、名称沿用动作，请求帧由点表生成器出）；
 * 3. **服务名称**（用户填）。
 *
 * 方法列表由点表现场展开、不允许手工增删（后端 functions 由本页一次性落库）；名称/请求帧/应答字段
 * 都只读，可改的是**自动轮询**（预览表里的开关 + 调用周期）与**逐字段告警**（点「告警配置」那一列
 * 开对话框配，见 {@link openAlarmDialog}）—— 两者都不属于点表，
 * 是「这份服务怎么跑、越限算不算事」的事（见 {@link polls} 与 {@link alarms}）。
 * 编辑页若源点表已删 / 跨组织取不到，退回服务里存的方法原样展示并提示，
 * 保存不改动它们（这两样仍可改，它们是从服务里种进来的）。
 *
 * 本类不带模板：create / edit 两个页面组件各自把 templateUrl 指到同一份
 * device.service.editor.html，仅以 {@link kind} 区分标题与提交动作。
 */
@Directive()
export abstract class DeviceServiceEditor implements OnInit {
  /** create：新建服务；edit：编辑服务 */
  protected abstract get kind(): 'create' | 'edit';

  protected readonly location = inject(Location);
  protected readonly i18n = inject(MainI18nService);
  protected readonly account = inject(AccountService);
  private readonly route = inject(ActivatedRoute);
  private readonly msg = inject(NzMessageService);
  private readonly matrix = inject(MatrixService);
  private readonly product = inject(ProductService);
  private readonly modbus = inject(ModbusService);
  private readonly modal = inject(NzModalService);
  /** 告警对话框挂在编辑页的视图容器下：它随本页一起销毁（本页走了不该留个悬着的对话框） */
  private readonly viewContainerRef = inject(ViewContainerRef);

  /** 依赖设备（DTU）did（路由参数） */
  readonly did = signal('');
  /** 服务 id（编辑页路由参数） */
  readonly id = signal('');

  readonly loadingDevice = signal(true);
  readonly device = signal<DeviceEntity | undefined>(undefined);

  readonly loadingInstance = signal(true);
  readonly instance = signal<DeviceInstance | undefined>(undefined);

  readonly loadingConfigs = signal(true);
  readonly configs = signal<ModbusConfig[]>([]);

  readonly loadingService = signal(false);
  /** 编辑页：源点表取不到时，按服务里存的原样展示的方法 */
  readonly storedFunctions = signal<ModbusServiceFunction[]>([]);
  /** 编辑页：载入到的定义格式版本号，保存时原样带回（新建由后端填） */
  private version?: number;
  /** 编辑页：载入到的依赖设备空间（当前设备取不到时兜底，避免保存把源空间抹空） */
  private storedSpace?: SpaceRef;
  /** 上一次自动带出的服务名称（用户改过就不再覆盖） */
  private autoName = '';

  readonly name = signal('');
  readonly selectedSiid = signal<number | null>(null);
  readonly selectedAiid = signal<number | null>(null);
  readonly selectedConfigId = signal<string | null>(null);

  /**
   * 各方法的自动轮询配置（开关 + 周期），key = `点表ID#方法序号` —— 方法列表由点表现场重算，
   * 轮询却只存在这份服务里，得另存一份才能合进方法定义。
   *
   * key 带上点表 ID：换源点表时不会把 A 点表的轮询配置套到 B 点表序号相同的方法上，
   * 切回来时改过的值也还在（换点表即换一批方法，序号相同并不代表同一个方法）。
   */
  private readonly polls = signal<Map<string, FunctionPoll>>(new Map());

  /**
   * 各出值（应答字段，或位清单里的一位）的阈值告警**规则组**，key = `点表ID#方法序号#出值名`
   * （见 {@link alarmKey}）—— 存这一份的理由与 {@link polls} 完全相同：方法列表由点表现场重算，
   * 告警却只存在这份服务里。
   *
   * 一个 key 下是**一组**规则（温度：低于 20 告警 / 超过 26 提示 / 超过 28 警告 / 超过 30 严重），
   * 组内就是声明顺序 —— 它参与运行期同级并列的裁决，故增删与重排都是真改动。
   * 对应服务定义里的 `ModbusServiceField.alarms`（位上是 `ModbusServiceFieldBit.alarms`）。
   */
  private readonly alarms = signal<Map<string, ModbusServiceFieldAlarm[]>>(new Map());

  /** 周期的上下限（秒）：模板绑定控件用，口径见文件头常量 */
  protected readonly intervalMin = MIN_INTERVAL_SECONDS;
  protected readonly intervalMax = MAX_INTERVAL_SECONDS;
  /** 方法是不是读方法（写方法不能自动调用）：模板据此决定这一格出控件还是「—」 */
  protected readonly isReadFunction = isReadFunction;

  /** 载入完成时的基线（编辑页「有没有改过」的原值）：载入前为 null，保存按钮此时也是不可用 */
  private readonly baseline = signal<ServiceBaseline | null>(null);

  /** 当前表单按基线口径取值（与基线的字段一一对应） */
  private readonly form = computed<ServiceBaseline>(() => ({
    name: this.name().trim(),
    siid: this.selectedSiid(),
    aiid: this.selectedAiid(),
    configId: this.selectedConfigId(),
    polls: pollSignature(this.polls()),
    alarms: alarmSignature(this.alarms()),
  }));

  /**
   * 相对载入时是否真正改过（用户能改的六样：名称 / 依赖服务 / 依赖方法 / 源点表 / 各方法轮询配置 /
   * 各出值告警配置）。新增页没有原值可比，恒为 true —— 保存按钮只看「填得对不对」。
   */
  readonly changed = computed<boolean>(() => {
    if (this.kind !== 'edit') {
      return true;
    }
    const base = this.baseline();
    return base != null && serviceChanged(base, this.form());
  });

  readonly saving = signal(false);

  /** 依赖设备上带方法的服务（供选挂载点） */
  readonly services = computed<Service[]>(() => {
    const instance = this.instance();
    if (!instance) {
      return [];
    }
    return instance
      .getServices()
      .filter((s) => s.getActions().length > 0)
      .sort((a, b) => a.iid - b.iid);
  });

  /** 选中服务下的方法 */
  readonly actions = computed<Action[]>(() => {
    const siid = this.selectedSiid();
    if (siid === null) {
      return [];
    }
    const service = this.services().find((s) => s.iid === siid);
    return service ? [...service.getActions()].sort((a, b) => a.iid - b.iid) : [];
  });

  /** 选中的方法（入参 piid 的来源） */
  readonly selectedAction = computed<Action | undefined>(() =>
    this.actions().find((a) => a.iid === this.selectedAiid()),
  );

  /**
   * 依赖设备方法的入参 piid：DTU 承载数据的动作只有一个入参，取它；
   * 取不到（方法没有入参 / 实例取不到）按 0 落库 —— 用户不能填。
   */
  readonly argument = computed<number>(() => {
    const args = this.selectedAction()?.getArgumentsIn() ?? [];
    return args.length === 1 ? args[0].piid : 0;
  });

  /** 选中的源点表 */
  readonly selectedConfig = computed<ModbusConfig | undefined>(() =>
    this.configs().find((c) => c.id === this.selectedConfigId()),
  );

  /** 点表现场展开的结果（含被跳过的动作） */
  readonly built = computed(() => buildServiceFunctions(this.selectedConfig()));

  /**
   * 方法列表：选中源点表就按它现场展开（一个功能码动作 = 一个方法）；
   * 点表缺失（编辑页里源点表已删 / 跨组织取不到）时退回服务里存的原样。
   * 两者都把 {@link polls} 的轮询配置与 {@link alarms} 的告警配置合进来，
   * 故它也是提交时的最终方法定义。
   */
  readonly functions = computed<ModbusServiceFunction[]>(() => {
    const base = this.selectedConfig() ? this.built().functions : this.storedFunctions();
    return base.map((func) => this.withAlarms(this.withPoll(func)));
  });

  /** 生成不出请求帧 / 应答规则而被跳过的动作（只提示，不阻断保存） */
  readonly skipped = computed<string[]>(() => (this.selectedConfig() ? this.built().skipped : []));

  /** 编辑页取不到源点表：方法列表按原样展示，保存不会改动它们 */
  readonly configMissing = computed<boolean>(
    () => this.kind === 'edit' && !!this.selectedConfigId() && !this.selectedConfig(),
  );

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      this.did.set(params['did'] ?? '');
      this.id.set(params['id'] ?? '');
      this.loadDevice(this.did());
      if (this.kind === 'edit' && this.id()) {
        this.loadService(this.id());
      }
    });
    this.loadConfigs();
  }

  /* ----------------------------------------------------------------------------------------------
   * 载入
   * ----------------------------------------------------------------------------------------------*/

  private loadDevice(did: string): void {
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.loadingDevice.set(false);
      this.loadingInstance.set(false);
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    this.loadingDevice.set(true);
    this.loadingInstance.set(true);
    this.matrix.getDevice(spaceId, did).subscribe({
      next: (device) => {
        this.device.set(device);
        this.loadingDevice.set(false);
        if (device.type) {
          this.loadInstance(device.type);
        } else {
          this.loadingInstance.set(false);
        }
      },
      error: (e) => {
        this.loadingDevice.set(false);
        this.loadingInstance.set(false);
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /** 依赖设备的产品实例：Service → Action 是挂载点，实例取不到就选不了坐标 */
  private loadInstance(type: string): void {
    this.loadingInstance.set(true);
    this.product.getProductInstance(type).subscribe({
      next: (instance) => {
        this.instance.set(instance);
        this.loadingInstance.set(false);
      },
      error: (e) => {
        this.instance.set(undefined);
        this.loadingInstance.set(false);
        this.msg.warning(e?.message ?? String(e));
      },
    });
  }

  /** 可见点表（本组织私有 + 公开）：服务只能在自己看得见的点表里选 */
  private loadConfigs(): void {
    this.loadingConfigs.set(true);
    this.modbus.listVisible().subscribe({
      next: (configs) => {
        this.configs.set(configs);
        this.loadingConfigs.set(false);
      },
      error: (e) => {
        this.configs.set([]);
        this.loadingConfigs.set(false);
        this.msg.warning(e?.message ?? String(e));
      },
    });
  }

  private loadService(id: string): void {
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.loadingService.set(false);
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    this.loadingService.set(true);
    this.modbus.getService(spaceId, id).subscribe({
      next: (service) => {
        this.name.set(service.name ?? '');
        this.selectedConfigId.set(service.configId ?? null);
        this.selectedSiid.set(service.device?.siid ?? null);
        this.selectedAiid.set(service.device?.aiid ?? null);
        this.storedFunctions.set(service.functions ?? []);
        this.seedPolls(service.configId ?? null, service.functions ?? []);
        this.seedAlarms(service.configId ?? null, service.functions ?? []);
        // 基线要在名称/坐标/点表/轮询与告警配置都落定之后取：它就是「原样不动直接保存」的那一份
        this.baseline.set(this.form());
        this.version = service.version;
        this.storedSpace = service.device?.space;
        this.loadingService.set(false);
      },
      error: (e) => {
        this.loadingService.set(false);
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 表单交互
   * ----------------------------------------------------------------------------------------------*/

  protected onServiceChange(siid: number | null): void {
    this.selectedSiid.set(siid);
    this.selectedAiid.set(null);
  }

  protected onActionChange(aiid: number | null): void {
    this.selectedAiid.set(aiid);
  }

  protected onConfigChange(configId: string | null): void {
    this.selectedConfigId.set(configId);
    this.applyAutoName(configId);
  }

  /**
   * 改某个方法的调用周期（秒）：清空 = 没配周期（开关随之关掉，后端也不允许开了轮询却没周期）。
   * 越界的输入夹到上下限（控件本身也带 nzMin/nzMax，这里兜底）。
   */
  protected onIntervalChange(func: ModbusServiceFunction, value: number | null): void {
    if (!isReadFunction(func)) {
      return;
    }
    const key = this.pollKey(func);
    this.polls.update((map) => {
      const next = new Map(map);
      if (value == null || !Number.isFinite(value)) {
        next.delete(key);
        return next;
      }
      // 只换周期，开关原样留着（关着的时候也能改周期，改完再开）
      next.set(key, { ...next.get(key), interval: this.clampInterval(value) });
      return next;
    });
  }

  /**
   * 开关某个方法的自动轮询。
   *
   * 打开时若还没配周期，先给个起步值（后端要求「开了轮询就必须有周期」，否则保存会被拒）；
   * 关掉只改开关、周期留着 —— 这正是这个开关的用处：停一台设备的采集，不必把配好的周期删掉。
   */
  protected onPollingChange(func: ModbusServiceFunction, enabled: boolean): void {
    if (!isReadFunction(func)) {
      return;
    }
    const key = this.pollKey(func);
    this.polls.update((map) => {
      const next = new Map(map);
      const poll = next.get(key);
      if (!enabled) {
        if (poll != null) {
          next.set(key, { ...poll, polling: false });
        }
        return next;
      }
      next.set(key, { interval: poll?.interval ?? DEFAULT_INTERVAL_SECONDS, polling: true });
      return next;
    });
  }

  /** 周期夹到上下限（控件本身也带 nzMin/nzMax，这里兜底：载入的旧值也要过一遍） */
  private clampInterval(seconds: number): number {
    return Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, Math.round(seconds)));
  }

  /**
   * 编辑页：把服务里已存的轮询配置按 `点表ID#序号` 种进 {@link polls}。
   * 方法列表在编辑页是拿点表现场重算的（自带不了这些），不种这一下，
   * 用户不动开关/周期直接保存就会把已设的抹掉。
   */
  private seedPolls(configId: string | null, functions: ModbusServiceFunction[]): void {
    const seeded = new Map<string, FunctionPoll>();
    for (const func of functions) {
      const interval = func.interval;
      if (interval == null || !isReadFunction(func)) {
        continue;
      }
      // 老定义没有 polling 字段：按「有周期即启用」显示成开着（与后端 validatePolling 的缺省判定一致）
      seeded.set(`${configId ?? ''}#${func.index}`, { interval, polling: func.polling ?? true });
    }
    this.polls.set(seeded);
  }

  /** 轮询配置在 {@link polls} 里的 key */
  private pollKey(func: ModbusServiceFunction): string {
    return `${this.selectedConfigId() ?? ''}#${func.index}`;
  }

  /**
   * 把该方法的轮询配置合进方法定义：写方法恒不带（后端拒绝对写方法周期调用）。
   * 没配周期就两个字段都不发；配了就显式带上开关，不再依赖「缺省 = 有周期即启用」那套口径。
   */
  private withPoll(func: ModbusServiceFunction): ModbusServiceFunction {
    const poll = isReadFunction(func) ? this.polls().get(this.pollKey(func)) : undefined;
    if (poll?.interval == null) {
      return { ...func, interval: undefined, polling: undefined };
    }
    return { ...func, interval: poll.interval, polling: poll.polling ?? true };
  }

  /* ----------------------------------------------------------------------------------------------
   * 逐字段告警（对话框）
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 该方法配了多少条告警规则：方法预览表「告警配置」列上那个数字（见 {@link alarmCount}）。
   * 这一列只有读方法有数 —— 写方法没有应答字段，一个出值都没有。
   */
  protected alarmCount(func: ModbusServiceFunction): number {
    return alarmCount(func, this.selectedConfigId(), this.alarms());
  }

  /**
   * 打开逐出值编辑告警的对话框。
   *
   * 规则**抄一份副本**进去：对话框里改到一半取消（或直接关窗）时，页面上的侧表一个字都没动 ——
   * 这正是「编辑落在一个临时副本上」的用处。点「确认」才走 {@link applyAlarms} 合回来。
   *
   * 副本按**出值名**重排一份 key（不再带 `点表ID#方法序号` 前缀）：对话框只认这一批出值，
   * 前缀对它没有意义，摘掉后它那边「key = 出值名」更直接。
   */
  protected openAlarmDialog(func: ModbusServiceFunction): void {
    const items = alarmItems(func);
    const seeded = new Map<string, ModbusServiceFieldAlarm[]>();
    for (const item of items) {
      seeded.set(
        item.key,
        this.alarmRulesOf(func, item).map((rule) => ({ ...rule })),
      );
    }
    const modal = this.modal.create<
      DeviceServiceAlarmDialogComponent,
      ServiceAlarmDialogData,
      Map<string, ModbusServiceFieldAlarm[]>
    >({
      // 标题不缀方法名：对话框第一行就写着是哪个方法（说了两遍是白说）
      nzTitle: this.i18n.translate.instant('告警配置'),
      nzContent: DeviceServiceAlarmDialogComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: { name: func.name, request: func.request, items, alarms: seeded },
      // 六列固定宽度加起来 610px，再给「告警文本」留出余量
      nzWidth: 960,
      nzFooter: [
        {
          label: this.i18n.translate.instant('取消'),
          onClick: (component) => component!.cancel(),
        },
        {
          label: this.i18n.translate.instant('确认'),
          type: 'primary',
          onClick: (component) => component!.ok(),
        },
      ],
    });

    // 取消 / 关窗交回 undefined：一个字都不改（用户改到一半反悔，页面得原样）
    modal.afterClose.subscribe((result) => {
      if (result) {
        this.applyAlarms(func, result);
      }
    });
  }

  /**
   * 把对话框交回来的规则表合进侧表：有规则的写回去，**空组把 key 删掉**
   * （空数组会被 {@link withAlarms} 写进定义，而 codec 与后端都读作「没配」）。
   *
   * 只碰这个方法自己的出值：别的出值不在这份清单里，也就不会被误删。
   */
  private applyAlarms(
    func: ModbusServiceFunction,
    alarms: Map<string, ModbusServiceFieldAlarm[]>,
  ): void {
    this.alarms.update((map) => {
      const next = new Map(map);
      for (const item of alarmItems(func)) {
        const key = this.alarmKey(func, item);
        const rules = alarms.get(item.key) ?? [];
        if (rules.length > 0) {
          next.set(key, rules);
        } else {
          next.delete(key);
        }
      }
      return next;
    });
  }

  /** 该出值当前的规则组（没配过 = 空数组）：打开告警对话框时按它抄副本 */
  protected alarmRulesOf(
    func: ModbusServiceFunction,
    item: ServiceAlarmItem,
  ): ModbusServiceFieldAlarm[] {
    return this.alarms().get(this.alarmKey(func, item)) ?? [];
  }

  /** 告警配置在 {@link alarms} 里的 key */
  private alarmKey(func: ModbusServiceFunction, item: ServiceAlarmItem): string {
    return alarmKey(this.selectedConfigId(), func.index, item.key);
  }

  /**
   * 编辑页：把服务里已存的告警规则按 `点表ID#序号#出值名` 种进 {@link alarms}。
   * 与 {@link seedPolls} 同理：不种这一下，用户不动告警直接保存就会把已配的抹掉。
   *
   * **顺带补 `id`**：更早配下的（或在别处写进来的）规则可能没有身份，而没有身份的规则既没法
   * 与运行期「哪条规则正开着」比对，也没法在界面上定位（增删改都按它认人）。
   * 补缺必须**在取基线之前**完成（本方法正是载入流程里的那一步）—— 补晚一步，
   * {@link alarmSignature} 的快照就与基线不同，保存按钮从一进页面就亮着，用户会以为自己改过东西。
   */
  private seedAlarms(configId: string | null, functions: ModbusServiceFunction[]): void {
    const seeded = new Map<string, ModbusServiceFieldAlarm[]>();
    for (const func of functions) {
      for (const item of alarmItems(func)) {
        // 位行只看位自己那一组：父字段的告警是另一行的事，不能拿它冒充位上的配置
        const rules = (item.bit ? item.bit.alarms : item.field.alarms) ?? [];
        if (rules.length === 0) {
          continue;
        }
        seeded.set(
          alarmKey(configId, func.index, item.key),
          rules.map((alarm) => (alarm.id ? alarm : { ...alarm, id: newAlarmId() })),
        );
      }
    }
    this.alarms.set(seeded);
  }

  /**
   * 把该方法的告警**规则组**并进应答字段：本方法只管**取数** —— 按 `点表ID#序号#出值名`
   * 从侧表把规则取出来，合并本身交给 {@link withAlarmsOf}（详情页那份走的是同一个合并规则，
   * 只是取数来自服务定义而非侧表，两边各写一套的话「空组不出键」这种细节迟早会走岔）。
   */
  private withAlarms(func: ModbusServiceFunction): ModbusServiceFunction {
    const configId = this.selectedConfigId();
    const groups = new Map<string, ModbusServiceFieldAlarm[]>();
    for (const item of alarmItems(func)) {
      const rules = this.alarms().get(alarmKey(configId, func.index, item.key));
      if (rules != null && rules.length > 0) {
        groups.set(item.key, rules);
      }
    }
    return withAlarmsOf(func, groups);
  }

  /**
   * 服务名称默认取所选点表的描述（slave.description）：换点表即跟着换；
   * 用户手填过（或点表没写描述）就不再覆盖，免得把已经改好的名字冲掉。
   */
  private applyAutoName(configId: string | null): void {
    const suggested = (configId ? this.selectedConfig()?.slave?.description : '')?.trim() ?? '';
    if (!suggested) {
      return;
    }
    const current = this.name();
    if (current.trim().length === 0 || current === this.autoName) {
      this.name.set(suggested);
      this.autoName = suggested;
    }
  }

  /**
   * 保存按钮可用：填得对 **且** 相对载入时确实改过（编辑页）。
   * 「改过」只认用户能改的五样（见 {@link changed}），方法列表重新生成不算。
   */
  protected readonly canSave = computed<boolean>(
    () =>
      this.changed() &&
      this.name().trim().length > 0 &&
      this.selectedSiid() !== null &&
      this.selectedAiid() !== null &&
      !!this.selectedConfigId() &&
      this.functions().length > 0 &&
      !this.saving(),
  );

  /* ----------------------------------------------------------------------------------------------
   * 保存
   * ----------------------------------------------------------------------------------------------*/

  protected save(): void {
    const siid = this.selectedSiid();
    const aiid = this.selectedAiid();
    const configId = this.selectedConfigId();
    if (!this.name().trim() || siid === null || aiid === null || !configId) {
      this.msg.warning(this.i18n.translate.instant('请填写服务名称，并选择依赖设备的方法与源点表'));
      return;
    }
    const functions = this.functions();
    if (functions.length === 0) {
      this.msg.warning(this.i18n.translate.instant('源点表里没有可用的功能码动作，生成不出方法'));
      return;
    }
    // 增删改要空间管理员：空间 ID 取当前项目根空间（与查询同源），不是设备落点的那个空间
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }

    const body = new ModbusServiceDef();
    body.name = this.name().trim();
    // 定义格式版本号：新建固定 1，编辑沿用服务里原来的版本
    body.version = this.version ?? 1;
    body.configId = configId;
    body.device.did = this.did();
    body.device.siid = siid;
    body.device.aiid = aiid;
    body.device.argument = this.argument();
    // 注意：这里记的是**设备落点**的空间副本，不是路径上那个鉴权用的根空间 —— 空间图按这个字段反查服务
    body.device.space = this.device()?.space ?? this.storedSpace ?? new SpaceRef();
    body.functions = functions;

    this.saving.set(true);
    const request$ =
      this.kind === 'edit'
        ? this.modbus.updateService(spaceId, this.id(), body)
        : this.modbus.createService(spaceId, body);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.msg.success(
          this.i18n.translate.instant(this.kind === 'edit' ? '保存成功' : '添加成功'),
        );
        this.location.back();
      },
      error: (e) => {
        this.saving.set(false);
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 展示文案
   * ----------------------------------------------------------------------------------------------*/

  protected get isCreate(): boolean {
    return this.kind === 'create';
  }

  /** 服务选项文案：#siid · 服务名（描述优先，缺失用类型名） */
  protected serviceLabel(s: Service): string {
    const d = s.description.get(this.i18n.getCurrentLang())?.trim();
    if (d) {
      return `#${s.iid} · ${d}`;
    }
    const name = s.type?.name?.trim();
    return name ? `#${s.iid} · ${name}` : `#${s.iid}`;
  }

  /** 方法选项文案：#aiid · 方法名（描述优先，缺失用类型名） */
  protected actionLabel(a: Action): string {
    const d = a.description.get(this.i18n.getCurrentLang())?.trim();
    if (d) {
      return `#${a.iid} · ${d}`;
    }
    const name = a.type?.name?.trim();
    return name ? `#${a.iid} · ${name}` : `#${a.iid}`;
  }

  /** 源点表选项文案：厂家 型号 · (id) */
  protected configLabel(cfg: ModbusConfig): string {
    const base =
      `${cfg.slave?.manufacturer?.trim() ?? ''} ${cfg.slave?.model?.trim() ?? ''}`.trim();
    if (base) {
      return cfg.id ? `${base} (${cfg.id})` : base;
    }
    return cfg.id ?? '';
  }

  /** 一个方法的应答字段文案（模板用；写方法返回提示文案） */
  protected responseText(func: ModbusServiceFunction): string {
    return describeFunctionResponse(func) ?? this.i18n.translate.instant(WRITE_METHOD_REPLY_KEY);
  }
}
