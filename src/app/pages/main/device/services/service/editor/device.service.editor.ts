import { computed, Directive, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
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
  ModbusServiceField,
  ModbusServiceFieldAlarm,
  ModbusServiceFunction,
} from '../../../../../../typedef/define/modbus/ModbusService';
import {
  MODBUS_ALARM_LEVELS,
  modbusAlarmLevelLabel,
  modbusAlarmOperatorLabel,
} from '../../../../../../typedef/define/modbus/ModbusAlarm';
import { SpaceRef } from '../../../../../../typedef/define/space/SpaceRef';
import {
  WRITE_METHOD_REPLY_KEY,
  alarmKey,
  alarmItems,
  alarmOperatorsOf,
  alarmSignature,
  alarmUsesState,
  buildServiceFunctions,
  defaultAlarm,
  describeFieldType,
  describeFunctionResponse,
  isReadFunction,
  pollSignature,
  serviceChanged,
  type FunctionPoll,
  type ServiceAlarmItem,
  type ServiceBaseline,
} from '../service.functions';

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
 * 都只读，可改的是**自动轮询**（开关 + 调用周期）与**逐字段告警**（展开行里配）—— 两者都不属于点表，
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

  protected readonly i18n = inject(MainI18nService);
  protected readonly account = inject(AccountService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly msg = inject(NzMessageService);
  private readonly matrix = inject(MatrixService);
  private readonly product = inject(ProductService);
  private readonly modbus = inject(ModbusService);

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
   * 各出值（应答字段，或位清单里的一位）的阈值告警配置，key = `点表ID#方法序号#出值名`
   * （见 {@link alarmKey}）—— 存这一份的理由与 {@link polls} 完全相同：方法列表由点表现场重算，
   * 告警却只存在这份服务里。
   */
  private readonly alarms = signal<Map<string, ModbusServiceFieldAlarm>>(new Map());

  /** 展开了告警配置那一行的方法序号（方法预览表的第一列是展开手柄，只有读方法有） */
  private readonly expanded = signal<Set<number>>(new Set());

  /** 周期的上下限（秒）：模板绑定控件用，口径见文件头常量 */
  protected readonly intervalMin = MIN_INTERVAL_SECONDS;
  protected readonly intervalMax = MAX_INTERVAL_SECONDS;
  /** 方法是不是读方法（写方法不能自动调用）：模板据此决定这一格出控件还是「—」 */
  protected readonly isReadFunction = isReadFunction;
  /** 一个方法的全部出值（应答字段 + 各自的位）：展开行逐行列出 */
  protected readonly alarmItems = alarmItems;
  /**
   * 出值的类型摘要，**不带告警尾巴**：展开行的「类型」列用它 —— 右边紧挨着就是告警的几个控件，
   * 再缀一遍「→ 温度过高(>80)」是同一句话说两遍，而且会随用户敲字实时变。
   * 上面那张表的「应答字段」列走 {@link responseText}，那里要的是带尾巴的完整摘要。
   */
  protected readonly describeFieldType = describeFieldType;
  /** 该出值此刻比的是状态还是数值：模板据此把阈值那一格换成下拉还是数字框 */
  protected readonly alarmUsesState = alarmUsesState;

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
   * 逐字段告警（展开行）
   * ----------------------------------------------------------------------------------------------*/

  /** 展开 / 收起某个方法的告警配置行（只有读方法有手柄） */
  protected onAlarmExpand(func: ModbusServiceFunction, expanded: boolean): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (expanded) {
        next.add(func.index);
      } else {
        next.delete(func.index);
      }
      return next;
    });
  }

  /** 该方法此刻是否展开着 */
  protected isAlarmExpanded(func: ModbusServiceFunction): boolean {
    return this.expanded().has(func.index);
  }

  /**
   * 开关某个出值的告警。
   *
   * 打开时若还没配过，先给一份能过校验的起步配置（后端要求「开了告警就得填齐」）；
   * 关掉只改开关、**配置原样留着** —— 这正是这个开关的用处：先停掉一条吵闹的告警，
   * 不必把比较方式、阈值、文本都删掉（与轮询开关保留周期同口径）。
   */
  protected onAlarmEnabled(func: ModbusServiceFunction, item: ServiceAlarmItem, enabled: boolean): void {
    if (item.kind === 'none') {
      return;
    }
    const key = this.alarmKey(func, item);
    this.alarms.update((map) => {
      const next = new Map(map);
      const alarm = next.get(key);
      if (enabled) {
        next.set(key, { ...defaultAlarm(item.kind, item.key), ...alarm, enabled: true });
      } else if (alarm != null) {
        next.set(key, { ...alarm, enabled: false });
      }
      return next;
    });
  }

  /**
   * 改比较方式。比较方式决定「比的是状态还是数值」（见 {@link alarmUsesState}），
   * 后端把这两个目标字段做成互斥的，故这一步顺手把用不上的那个清掉 ——
   * 不清的话，从「= 制冷」切到「> 80」会同时带着 state，保存被后端拒。
   */
  protected onAlarmCompare(
    func: ModbusServiceFunction,
    item: ServiceAlarmItem,
    compare: string | null,
  ): void {
    const patch: Partial<ModbusServiceFieldAlarm> = { compare: compare ?? undefined };
    if (alarmUsesState(item.kind, compare ?? undefined)) {
      patch.threshold = undefined;
    } else {
      patch.state = undefined;
    }
    this.patchAlarm(func, item, patch);
  }

  protected onAlarmThreshold(
    func: ModbusServiceFunction,
    item: ServiceAlarmItem,
    value: number | null,
  ): void {
    // 清空 = 还没填（后端会拒），不是 0：0 是个正经阈值，不能拿「没填」冒充它
    this.patchAlarm(func, item, {
      threshold: value == null || !Number.isFinite(value) ? undefined : value,
    });
  }

  protected onAlarmState(func: ModbusServiceFunction, item: ServiceAlarmItem, state: string | null): void {
    this.patchAlarm(func, item, { state: state ?? undefined });
  }

  protected onAlarmLevel(func: ModbusServiceFunction, item: ServiceAlarmItem, level: string | null): void {
    this.patchAlarm(func, item, { level: level ?? undefined });
  }

  protected onAlarmText(func: ModbusServiceFunction, item: ServiceAlarmItem, text: string): void {
    this.patchAlarm(func, item, { text });
  }

  /** 改一个出值的告警配置（没配过就先建一条空白的，由 patch 填进去） */
  private patchAlarm(
    func: ModbusServiceFunction,
    item: ServiceAlarmItem,
    patch: Partial<ModbusServiceFieldAlarm>,
  ): void {
    const key = this.alarmKey(func, item);
    this.alarms.update((map) => {
      const next = new Map(map);
      next.set(key, { ...next.get(key), ...patch });
      return next;
    });
  }

  /** 该出值当前的告警配置（没配过 = undefined，模板按它决定控件显不显示值） */
  protected alarmOf(
    func: ModbusServiceFunction,
    item: ServiceAlarmItem,
  ): ModbusServiceFieldAlarm | undefined {
    return this.alarms().get(this.alarmKey(func, item));
  }

  /** 告警配置在 {@link alarms} 里的 key */
  private alarmKey(func: ModbusServiceFunction, item: ServiceAlarmItem): string {
    return alarmKey(this.selectedConfigId(), func.index, item.key);
  }

  /**
   * 编辑页：把服务里已存的告警配置按 `点表ID#序号#出值名` 种进 {@link alarms}。
   * 与 {@link seedPolls} 同理：不种这一下，用户不动告警直接保存就会把已配的抹掉。
   */
  private seedAlarms(configId: string | null, functions: ModbusServiceFunction[]): void {
    const seeded = new Map<string, ModbusServiceFieldAlarm>();
    for (const func of functions) {
      for (const item of alarmItems(func)) {
        // 位行只看位自己那份：父字段的告警是另一行的事，不能拿它冒充位上的配置
        const alarm = item.bit ? item.bit.alarm : item.field.alarm;
        if (alarm != null) {
          seeded.set(alarmKey(configId, func.index, item.key), alarm);
        }
      }
    }
    this.alarms.set(seeded);
  }

  /**
   * 把该方法的告警配置并进应答字段：字段自身一份、位清单里每一位各一份
   * （位是独立的结果键，见 {@link ServiceAlarmItem}）。
   *
   * 没配的出值**不出 `alarm` 键** —— 定义里绝大多数字段都没配告警，过一趟编辑页不该
   * 在每个字段上多出一个空对象。写方法没有 response，这个循环自然什么也不做。
   */
  private withAlarms(func: ModbusServiceFunction): ModbusServiceFunction {
    const response = (func.response ?? []).map((field: ModbusServiceField) => ({
      ...field,
      alarm: this.alarms().get(alarmKey(this.selectedConfigId(), func.index, field.field)),
      bitList: field.bitList?.map((bit) => ({
        ...bit,
        alarm: this.alarms().get(alarmKey(this.selectedConfigId(), func.index, bit.field)),
      })),
    }));
    return { ...func, response };
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
        this.msg.success(this.i18n.translate.instant(this.kind === 'edit' ? '保存成功' : '添加成功'));
        this.back();
      },
      error: (e) => {
        this.saving.set(false);
        this.msg.error(e?.message ?? e);
      },
    });
  }

  protected back(): void {
    this.router.navigate(['/main/device/services', this.did()]);
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
    const base = `${cfg.slave?.manufacturer?.trim() ?? ''} ${cfg.slave?.model?.trim() ?? ''}`.trim();
    if (base) {
      return cfg.id ? `${base} (${cfg.id})` : base;
    }
    return cfg.id ?? '';
  }

  /** 一个方法的应答字段文案（模板用；写方法返回提示文案） */
  protected responseText(func: ModbusServiceFunction): string {
    return describeFunctionResponse(func) ?? this.i18n.translate.instant(WRITE_METHOD_REPLY_KEY);
  }

  /**
   * 翻译 i18n 键。内部读取 currentLang 信号，使下面的下拉选项在语言切换时随视图重算
   * （`instant` 不是响应式的，口径同 dashboard.component 的 `t`）。
   */
  private readonly t = (key: string): string => {
    this.i18n.currentLang();
    return this.i18n.translate.instant(key);
  };

  /** 比较方式下拉：「文案 + 符号」两样都给 —— 词是给不看符号的人，符号与定义里存的值逐字对齐 */
  protected compareOptions(item: ServiceAlarmItem): { value: string; label: string }[] {
    return alarmOperatorsOf(item.kind).map((op) => ({
      value: op,
      label: `${modbusAlarmOperatorLabel(op, this.t)} ${op}`,
    }));
  }

  /** 级别下拉：顺序即「由轻到重」，与告警列表页的筛选同一个顺序 */
  protected get alarmLevelOptions(): { value: string; label: string }[] {
    return MODBUS_ALARM_LEVELS.map((level) => ({
      value: level,
      label: modbusAlarmLevelLabel(level, this.t),
    }));
  }

  /**
   * `=` 的比较目标：该字段取值表里的描述，**原样显示、不翻译** —— 它是点表里的数据，
   * 与后端逐字比对的就是这个串，翻了保存就会被拒（见 AGENTS.md 的 i18n 一节）。
   */
  protected alarmStateOptions(field: ModbusServiceField): { value: string; label: string }[] {
    return (field.valueList ?? []).map((v) => ({ value: v.description, label: v.description }));
  }
}
