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
  ModbusServiceFunction,
} from '../../../../../../typedef/define/modbus/ModbusService';
import { SpaceRef } from '../../../../../../typedef/define/space/SpaceRef';
import { buildServiceFunctions, describeFunctionResponse } from '../service.functions';

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
 * 方法列表**只读**：既不出编辑控件，也不允许手工增删（后端 functions 由本页一次性落库）。
 * 编辑页若源点表已删 / 跨组织取不到，退回服务里存的方法原样展示并提示，保存不改动它们。
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
   * 只读预览的方法列表：选中源点表就按它现场展开（一个功能码动作 = 一个方法）；
   * 点表缺失（编辑页里源点表已删 / 跨组织取不到）时退回服务里存的原样。
   */
  readonly functions = computed<ModbusServiceFunction[]>(() =>
    this.selectedConfig() ? this.built().functions : this.storedFunctions(),
  );

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
      this.msg.warning('请先在项目列表中选择一个项目');
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
    this.loadingService.set(true);
    this.modbus.getService(id).subscribe({
      next: (service) => {
        this.name.set(service.name ?? '');
        this.selectedConfigId.set(service.configId ?? null);
        this.selectedSiid.set(service.device?.siid ?? null);
        this.selectedAiid.set(service.device?.aiid ?? null);
        this.storedFunctions.set(service.functions ?? []);
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

  protected canSave(): boolean {
    return (
      this.name().trim().length > 0 &&
      this.selectedSiid() !== null &&
      this.selectedAiid() !== null &&
      !!this.selectedConfigId() &&
      this.functions().length > 0 &&
      !this.saving()
    );
  }

  /* ----------------------------------------------------------------------------------------------
   * 保存
   * ----------------------------------------------------------------------------------------------*/

  protected save(): void {
    const siid = this.selectedSiid();
    const aiid = this.selectedAiid();
    const configId = this.selectedConfigId();
    if (!this.name().trim() || siid === null || aiid === null || !configId) {
      this.msg.warning('请填写服务名称，并选择依赖设备的方法与源点表');
      return;
    }
    const functions = this.functions();
    if (functions.length === 0) {
      this.msg.warning('源点表里没有可用的功能码动作，生成不出方法');
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
    body.device.space = this.device()?.space ?? this.storedSpace ?? new SpaceRef();
    body.functions = functions;

    this.saving.set(true);
    const request$ =
      this.kind === 'edit'
        ? this.modbus.updateService(this.id(), body)
        : this.modbus.createService(body);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.msg.success(this.kind === 'edit' ? '保存成功' : '添加成功');
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
    return describeFunctionResponse(func);
  }
}
