import { Component, OnInit, ChangeDetectionStrategy, signal, ViewContainerRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { ModbusService as ModbusServiceDef } from '../../../../typedef/define/modbus/ModbusService';
import { DeviceEntity } from '../../../../typedef/define/device/DeviceEntity';
import { ModbusDeviceConfig } from '../../../../typedef/define/modbus/Modbus';

/**
 * 设备映射页：列出挂在这台设备（DTU）下的 Modbus 服务，并可新建 / 查看详情 / 删除。
 *
 * 服务＝把一条点表映射成一组可调用的方法（MODBUS2.md 的方案二，后端 ModbusServiceResource）。
 * 两件事都在服务端按 X-Org-Id 组织隔离：查询需组织成员，增删改需该组织管理员。
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
  /** 设备（DTU）did */
  did = signal('');

  loadingDevice = signal(true);
  device = signal<DeviceEntity | undefined>(undefined);

  loadingServices = signal(true);
  services = signal<ModbusServiceDef[]>([]);

  /** 可见点表（用于把服务的 configId 解析成「厂家 型号」） */
  configs = signal<ModbusDeviceConfig[]>([]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private msg: NzMessageService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
    private matrix: MatrixService,
    private modbus: ModbusService,
    public account: AccountService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.did.set(params['did']);
      this.loadDevice(params['did']);
      this.loadServices(params['did']);
    });
    this.loadConfigs();
  }

  private loadDevice(did: string): void {
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.loadingDevice.set(false);
      this.msg.warning('请先在项目列表中选择一个项目');
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
    this.loadingServices.set(true);
    this.modbus.listServicesByDevice(did).subscribe({
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

  /** 删除服务：需组织管理员，后端按 org 校验，失败按报错提示 */
  protected remove(service: ModbusServiceDef): void {
    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: '您真的要删除这个服务吗？',
      nzContent: ConfirmComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: service.name,
      nzFooter: [
        {
          label: '取消',
          onClick: (component) => component!.cancel(),
        },
        {
          label: '确认',
          danger: true,
          type: 'primary',
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (result && service.id) {
        this.modbus.removeService(service.id).subscribe({
          next: () => {
            this.msg.success('删除成功');
            this.loadServices(this.did());
          },
          error: (e) => this.msg.warning(e?.message ?? e),
        });
      }
    });
  }

  protected onBack(): void {
    this.router.navigate(['/main/device']);
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
    const label = `${config.slave?.manufacturer?.trim() ?? ''} ${config.slave?.model?.trim() ?? ''}`.trim();
    return label || configId;
  }

  /** 最后更新时间（后端人员记录里的毫秒时间戳） */
  protected updateTime(service: ModbusServiceDef): string | number | null {
    return service.updater?.timestamp ?? null;
  }
}
