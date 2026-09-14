import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  computed,
  signal,
  ViewContainerRef, inject,
} from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { ConfirmComponent } from '../../../../common/dialog/confirm/confirm.component';
import { AccountService } from '../../../../service/account.service';
import { MatrixService } from '../../../../service/matrix.service';
import { ModbusService } from '../../../../service/modbus.service';
import { MainI18nService } from '../../../../service/i18n.service';
import { ModbusService as ModbusServiceDef } from '../../../../typedef/define/modbus/ModbusService';
import { DeviceEntity } from '../../../../typedef/define/device/DeviceEntity';
import { ModbusConfig } from '../../../../typedef/define/modbus/Modbus';
import { SpaceEntity } from '../../../../typedef/define/space/SpaceEntity';
import { OrganizationMember } from '../../../../typedef/define/user/UserOrganization';

/**
 * 设备映射页：列出挂在这台设备（DTU）下的 Modbus 服务，并可新建 / 查看详情 / 删除。
 *
 * 服务＝把一条点表映射成一组可调用的方法（见 service-matrix 的 MODBUS.md，后端 ModbusServiceResource）。
 * 服务端按**空间**鉴权：查询需空间成员，增删改需空间管理员；空间 ID 在 Path 上，
 * 统一传当前项目根空间（account.space().id），与设备接口同口径。
 * 依赖设备的调用坐标（siid / aiid / 入参 piid）在新建页选，本页只做清单。
 */
@Component({
  selector: 'device-services',
  templateUrl: './device.services.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    DatePipe,
    RouterLink,
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzCardModule,
    NzTableModule,
    NzButtonModule,
    NzTagModule,
    NzDividerModule,
    NzEmptyModule,
    NzDescriptionsModule,
    NzIconModule,
    BreadcrumbTranslateDirective,
    TranslatePipe,
  ],
  providers: [NzModalService],
})
export class DeviceServicesComponent implements OnInit {

  protected readonly location = inject(Location);

  /** 设备（DTU）did */
  did = signal('');

  loadingDevice = signal(true);
  device = signal<DeviceEntity | undefined>(undefined);

  loadingServices = signal(true);
  services = signal<ModbusServiceDef[]>([]);

  /** 可见点表（用于把服务的 configId 解析成「厂家 型号」） */
  configs = signal<ModbusConfig[]>([]);

  /** 当前项目根空间与成员（user 访问条目），用于计算项目管理员（isAdmin）。 */
  rootSpace = signal<SpaceEntity | null>(null);
  members = signal<OrganizationMember[]>([]);

  /**
   * 当前账号是否为项目管理员（决定「添加 / 删除」是否可见 —— 服务增删改只要求空间管理员）：
   * 1. 自己在项目成员（user 访问条目）中 role=admin；
   * 2. 组织兜底：当前组织命中根空间的 organization 访问条目，且自己为该组织管理员。
   * 口径与 device.component / project.component 的 isAdmin 一致。
   */
  readonly isAdmin = computed(() => {
    const me = this.account.user();
    if (!me?.id) return false;

    const selfEntry = this.members().find((m) => m.userId === me.id);
    if (selfEntry?.role === 'admin') return true;

    const org = this.account.organization();
    const orgEntry = this.rootSpace()?.accesses?.find(
      (a) => a.type === 'organization' && a.id === org.id,
    );
    if (orgEntry) {
      const meInOrg = org.members.find((m) => m.userId === me.id);
      return meInOrg !== undefined && meInOrg.role === 'admin';
    }
    return false;
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private msg: NzMessageService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
    private matrix: MatrixService,
    private modbus: ModbusService,
    public account: AccountService,
    public i18n: MainI18nService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.did.set(params['did']);
      this.loadDevice(params['did']);
      this.loadServices(params['did']);
    });
    this.loadConfigs();
    this.loadAdminContext();
  }

  /** 加载项目根空间 + 成员，供 isAdmin 判定；非管理员无需展示按钮，失败静默即可。 */
  private loadAdminContext(): void {
    const rootId = this.account.space().id;
    if (!rootId) {
      return;
    }
    forkJoin({
      space: this.matrix.getSpace(rootId),
      members: this.matrix.listAccesses(rootId),
    }).subscribe({
      next: ({ space, members }) => {
        this.rootSpace.set(space);
        this.members.set(members);
      },
      error: () => {},
    });
  }

  private loadDevice(did: string): void {
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.loadingDevice.set(false);
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    this.loadingDevice.set(true);
    this.matrix.getDevice(spaceId, did).subscribe({
      next: (device) => {
        this.device.set(device);
        this.loadingDevice.set(false);
      },
      error: (e) => {
        this.loadingDevice.set(false);
        this.msg.error(e?.message ?? e);
      },
    });
  }

  private loadServices(did: string): void {
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.loadingServices.set(false);
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    this.loadingServices.set(true);
    this.modbus.listServicesByDevice(spaceId, did).subscribe({
      next: (services) => {
        this.services.set(services);
        this.loadingServices.set(false);
      },
      error: (e) => {
        this.services.set([]);
        this.loadingServices.set(false);
        this.msg.warning(e?.message ?? String(e));
      },
    });
  }

  /** 可见点表只用于解析服务所属点表的显示名，取不到就退回 id，失败静默 */
  private loadConfigs(): void {
    this.modbus.listVisible().subscribe({
      next: (configs) => this.configs.set(configs),
      error: () => {},
    });
  }

  protected add(): void {
    this.router.navigate(['/main/device/services', this.did(), 'service', 'create']);
  }

  /** 服务详情页路径 */
  protected detailLink(service: ModbusServiceDef): string[] {
    return ['/main/device/services', this.did(), 'service', 'detail', service.id ?? ''];
  }

  /** 服务历史数据页路径（表格 / 曲线图两种形式，见 device.service.history.component） */
  protected historyLink(service: ModbusServiceDef): string[] {
    return ['/main/device/services', this.did(), 'service', 'history', service.id ?? ''];
  }

  /** 删除服务：需当前项目空间的管理员，失败按报错提示 */
  protected remove(service: ModbusServiceDef): void {
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: this.i18n.translate.instant('您真的要删除这个服务吗？'),
      nzContent: ConfirmComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: service.name,
      nzFooter: [
        {
          label: this.i18n.translate.instant('取消'),
          onClick: (component) => component!.cancel(),
        },
        {
          label: this.i18n.translate.instant('确认'),
          danger: true,
          type: 'primary',
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (result && service.id) {
        this.modbus.removeService(spaceId, service.id).subscribe({
          next: () => {
            this.msg.success(this.i18n.translate.instant('删除成功'));
            this.loadServices(this.did());
          },
          error: (e) => this.msg.warning(e?.message ?? e),
        });
      }
    });
  }

  /** 源点表显示名：厂家 型号（点表取不到时退回 id） */
  protected configLabel(configId?: string): string {
    if (!configId) {
      return '-';
    }
    const config = this.configs().find((c) => c.id === configId);
    if (!config) {
      return configId;
    }
    const label =
      `${config.slave?.manufacturer?.trim() ?? ''} ${config.slave?.model?.trim() ?? ''}`.trim();
    return label || configId;
  }

  /** 最后更新时间（后端人员记录里的毫秒时间戳） */
  protected updateTime(service: ModbusServiceDef): string | number | null {
    return service.updater?.timestamp ?? null;
  }
}
