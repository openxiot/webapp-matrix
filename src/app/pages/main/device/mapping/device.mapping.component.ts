import { Component, OnInit, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '../../../../service/account.service';
import { MatrixService } from '../../../../service/matrix.service';
import { ProductService } from '../../../../service/product.service';
import { ModbusService } from '../../../../service/modbus.service';
import { MainI18nService } from '../../../../service/i18n.service';
import { DeviceEntity } from '../../../../typedef/define/device/DeviceEntity';
import { ModbusDeviceConfig } from '../../../../typedef/define/modbus/Modbus';
import { Action, DeviceInstance, Service } from '@openxiot/xiot-core-spec-ts';

/**
 * Modbus 映射页：把一条 Modbus 点表配置映射成选中的 DTU 设备下的虚拟子设备。
 *
 * 用户指定三件事：父 DTU 设备的（Service → Action 挂载点）、要虚拟化的 Modbus 点表配置；
 * 保存调用 service-matrix ModbusVirtualDeviceResource.createOne（POST /matrix/v1/modbus/virtual/one，
 * X-Org-Id 携带组织、需该组织管理员），成功后返回设备列表页并重新拉取——列表应出现新虚拟子设备。
 */
@Component({
  selector: 'device-mapping',
  templateUrl: './device.mapping.component.html',
  styleUrls: ['./device.mapping.component.less'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzCardModule,
    NzFormModule,
    NzSelectModule,
    NzButtonModule,
    NzTagModule,
    NzAlertModule,
    BreadcrumbTranslateDirective,
    TranslatePipe,
  ],
})
export class DeviceMappingComponent implements OnInit {
  /** 父设备（DTU）did */
  did = signal('');

  loadingDevice = signal(true);
  device = signal<DeviceEntity | undefined>(undefined);

  loadingInstance = signal(true);
  instance = signal<DeviceInstance | undefined>(undefined);

  /** 父设备里有 Action 的服务（供选择挂载点） */
  readonly services = computed(() => {
    const inst = this.instance();
    if (!inst) return [] as Service[];
    return inst
      .getServices()
      .filter((s) => s.getActions().length > 0)
      .sort((a, b) => a.iid - b.iid);
  });

  selectedSiid = signal<number | null>(null);
  selectedAiid = signal<number | null>(null);

  /** 当前服务下的 Action 列表 */
  readonly actions = computed(() => {
    const siid = this.selectedSiid();
    if (siid === null) return [] as Action[];
    const s = this.services().find((x) => x.iid === siid);
    return s ? s.getActions().sort((a, b) => a.iid - b.iid) : ([] as Action[]);
  });

  loadingConfigs = signal(true);
  configs = signal<ModbusDeviceConfig[]>([]);
  selectedConfigId = signal<string | null>(null);

  saving = signal(false);

  constructor(
    protected i18n: MainI18nService,
    private route: ActivatedRoute,
    private router: Router,
    private msg: NzMessageService,
    private matrix: MatrixService,
    private product: ProductService,
    private modbus: ModbusService,
    public account: AccountService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.did.set(params['did']);
      this.loadParent(params['did']);
    });
    this.loadConfigs();
  }

  private loadParent(did: string): void {
    this.loadingDevice.set(true);
    this.loadingInstance.set(true);
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.loadingDevice.set(false);
      this.loadingInstance.set(false);
      this.msg.warning(this.i18nKey('请先在项目列表中选择一个项目'));
      return;
    }
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

  private loadInstance(type: string): void {
    this.loadingInstance.set(true);
    this.product.getProductInstance(type).subscribe({
      next: (inst) => {
        this.instance.set(inst);
        this.loadingInstance.set(false);
      },
      error: (e) => {
        this.instance.set(undefined);
        this.loadingInstance.set(false);
        this.msg.warning(e?.message ?? String(e));
      },
    });
  }

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

  protected onServiceChange(siid: number | null): void {
    this.selectedSiid.set(siid);
    this.selectedAiid.set(null);
  }

  protected onActionChange(aiid: number | null): void {
    this.selectedAiid.set(aiid);
  }

  protected onConfigChange(configId: string | null): void {
    this.selectedConfigId.set(configId);
  }

  protected canSave(): boolean {
    return this.selectedSiid() !== null && this.selectedAiid() !== null && !!this.selectedConfigId() && !this.saving();
  }

  protected save(): void {
    const siid = this.selectedSiid();
    const aiid = this.selectedAiid();
    const configId = this.selectedConfigId();
    if (siid === null || aiid === null || !configId) {
      this.msg.warning(this.i18nKey('请先选择服务、方法与 Modbus 点表配置'));
      return;
    }
    this.saving.set(true);
    this.modbus
      .createVirtual({ configId, did: this.did(), siid, aiid })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.msg.success(this.i18nKey('映射成功'));
          this.router.navigate(['/main/device']);
        },
        error: (e) => {
          this.saving.set(false);
          this.msg.error(e?.message ?? e);
        },
      });
  }

  /** 直接以中文做 key，便于翻译管线缺失时原样回退展示。 */
  private i18nKey(text: string): string {
    return text;
  }

  protected onBack(): void {
    this.router.navigate(['/main/device']);
  }

  // —— 展示文案辅助 ——

  /** 服务选项文案：#siid · 服务名（描述优先，缺失用类型名） */
  protected serviceLabel(s: Service): string {
    const d = s.description.get(this.i18n.getCurrentLang())?.trim();
    if (d) return `#${s.iid} · ${d}`;
    const name = s.type?.name?.trim();
    return name ? `#${s.iid} · ${name}` : `#${s.iid}`;
  }

  /** Action 选项文案：#aiid · 方法名（描述优先，缺失用类型名） */
  protected actionLabel(a: Action): string {
    const d = a.description.get(this.i18n.getCurrentLang())?.trim();
    if (d) return `#${a.iid} · ${d}`;
    const name = a.type?.name?.trim();
    return name ? `#${a.iid} · ${name}` : `#${a.iid}`;
  }

  /** Modbus 点表选项文案：厂家 型号 · (描述) ；缺失退化为 id */
  protected configLabel(cfg: ModbusDeviceConfig): string {
    const m = cfg.slave?.manufacturer?.trim() ?? '';
    const mo = cfg.slave?.model?.trim() ?? '';
    const base = `${m} ${mo}`.trim();
    if (base) return cfg.id ? `${base} (${cfg.id})` : base;
    return cfg.id ?? '';
  }
}
