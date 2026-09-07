import { Component, effect, signal, ViewContainerRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { DatePipe } from '@angular/common';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AccountService } from '../../../service/account.service';
import { ModbusService } from '../../../service/modbus.service';
import { ModbusDeviceConfig } from '../../../typedef/define/modbus/Modbus';
import { ConfirmComponent } from '../../../common/dialog/confirm/confirm.component';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { NzBreadCrumbComponent } from 'ng-zorro-antd/breadcrumb';

@Component({
  selector: 'main-modbus',
  standalone: true,
  templateUrl: './modbus.component.html',
  styleUrl: './modbus.component.less',
  imports: [
    RouterLink,
    NzPageHeaderModule,
    NzSpinModule,
    NzTableModule,
    NzButtonModule,
    NzEmptyModule,
    NzDividerModule,
    NzIconModule,
    DatePipe,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    NzBreadCrumbComponent,
  ],
  providers: [NzModalService],
})
export class ModbusComponent {
  loading = signal(false);
  configs = signal<ModbusDeviceConfig[]>([]);

  private currentOrgId = '';

  constructor(
    public account: AccountService,
    private service: ModbusService,
    private msg: NzMessageService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
    private translate: TranslateService,
  ) {
    // 组织信号变化（异步加载 / 切换组织）时自动刷新列表
    effect(() => {
      const orgId = this.account.organization().id;
      if (orgId && orgId !== this.currentOrgId) {
        this.currentOrgId = orgId;
        this.load();
      }
    });
  }

  load(): void {
    if (!this.currentOrgId) {
      return;
    }
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.configs.set(data ?? []);
        this.loading.set(false);
      },
      error: (error) => {
        this.msg.warning((error as { message?: string })?.message ?? error);
        this.loading.set(false);
      },
    });
  }

  protected remove(config: ModbusDeviceConfig) {
    const label = `${config.manufacturer || ''} ${config.model || ''}`.trim() || config.id || '';
    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: this.translate.instant('确认删除设备点表', { label }),
      nzContent: ConfirmComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: label,
      nzFooter: [
        {
          label: this.translate.instant('取消'),
          onClick: (component) => component!.cancel(),
        },
        {
          label: this.translate.instant('确认'),
          danger: true,
          type: 'primary',
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (result) {
        this.doRemove(config);
      }
    });
  }

  private doRemove(config: ModbusDeviceConfig) {
    const id = config.id;
    if (!id) {
      return;
    }
    this.service.remove(id).subscribe({
      next: () => {
        this.msg.success(this.translate.instant('删除成功'));
        this.load();
      },
      error: (error) => {
        this.msg.warning((error as { message?: string })?.message ?? error);
      },
    });
  }
}
