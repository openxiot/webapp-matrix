import { Component, effect, signal, ViewContainerRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { DatePipe } from '@angular/common';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AccountService } from '@app/service/account.service';
import { ModbusService } from '@app/service/modbus.service';
import { UserOrganizationService } from '@app/service/user.organization.service';
import { ModbusConfig } from '../../../typedef/define/modbus/Modbus';
import { lifecycleModifiable, lifecycleStyle } from './modbus.lifecycle';
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
    NzTagModule,
    DatePipe,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    NzBreadCrumbComponent,
  ],
  providers: [NzModalService],
})
export class ModbusComponent {
  /** 生命周期存储串 → 状态文案 i18n 键 + nz-tag 颜色（模板经 translate 管道渲染） */
  protected readonly lifecycleStyle = lifecycleStyle;

  loading = signal(false);
  configs = signal<ModbusConfig[]>([]);

  /** 组织编码 → 组织名称（当前账号所加入的组织），用于「所属组织」列解析 */
  orgNames = signal<Map<string, string>>(new Map());

  /** 当前账号是否为「当前组织」的管理员（决定本组织点表是否显示删除） */
  isCurrentOrgAdmin = signal(false);

  /**
   * 当前是否处于「可用组织」上下文（已选择组织，且仍是其成员）。
   * 为 false 时页面进入只读浏览：仅展示各组织公开的点表，不提供新建/删除。
   * 「详情」对每行始终可用（公开点表可直接查看点表内容）。
   */
  orgActive = signal(false);

  private currentOrgId = '';

  constructor(
    public account: AccountService,
    private service: ModbusService,
    private orgService: UserOrganizationService,
    private msg: NzMessageService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
    private translate: TranslateService,
  ) {
    // 进入页面即按当前组织加载一次：已选择组织读「可见」，未选择则读「公开」。
    this.currentOrgId = this.account.organization().id;
    this.load();

    // 组织信号后续变化（切换组织 / 清空组织）时自动刷新列表
    effect(() => {
      const orgId = this.account.organization().id;
      if (orgId !== this.currentOrgId) {
        this.currentOrgId = orgId;
        this.load();
      }
    });
  }

  /**
   * 刷新列表：可用组织读「可见」（本组织全部 + 各组织公开）；
   * 无组织 / 组织已禁用或退出时，只读「公开」点表。
   */
  load(): void {
    const orgId = this.currentOrgId;
    this.loading.set(true);
    this.configs.set([]);

    this.orgService.getOrganizations().subscribe({
      next: (organizations) => {
        const list = organizations ?? [];
        const map = new Map<string, string>();
        let isMember = false; // 当前所选组织仍是当前账号的成员组织（未被禁用/退出）
        let admin = false;
        for (const org of list) {
          if (org.id) {
            map.set(org.id, org.name || org.id);
          }
          if (org.id && org.id === orgId) {
            isMember = true;
            const me = this.account.user().id;
            admin = (org.members ?? []).some((m) => m.userId === me && m.role === 'admin');
          }
        }
        // 当前组织名称以 account.organization() 为准（可能比 /many 更完整）
        const currentName = this.account.organization().name;
        if (orgId && currentName) {
          map.set(orgId, currentName);
        }
        this.orgNames.set(map);
        this.isCurrentOrgAdmin.set(admin);
        this.fetchList(isMember);
      },
      error: () => {
        // 组织信息接口不可用：有组织仍按可见尝试；后端若拒绝会自动回退公开
        this.orgNames.set(new Map());
        this.isCurrentOrgAdmin.set(false);
        const current = this.account.organization();
        if (current.id && current.name) {
          this.orgNames.set(new Map([[current.id, current.name]]));
        }
        this.fetchList(!!orgId);
      },
    });
  }

  /** 数据源分流：withOrg=true → /visible；false → /public（公开点表无需组织成员资格） */
  private fetchList(withOrg: boolean): void {
    this.orgActive.set(withOrg);
    if (withOrg) {
      this.service.listVisible().subscribe({
        next: (data) => {
          this.configs.set(data ?? []);
          this.loading.set(false);
        },
        error: () => this.fallbackToPublic(),
      });
    } else {
      this.loadPublic();
    }
  }

  /**
   * /visible 被后端拒绝（如所选组织已禁用 / 已退出，checkMember 不通过）时，
   * 回退为只读公开点表，保证组织不可用也能读到公开数据。
   */
  private fallbackToPublic(): void {
    this.orgActive.set(false);
    this.isCurrentOrgAdmin.set(false);
    this.configs.set([]);
    this.loadPublic();
  }

  private loadPublic(): void {
    this.service.listPublic().subscribe({
      next: (data) => {
        this.configs.set(data ?? []);
        this.loading.set(false);
      },
      error: (error) => {
        this.msg.warning((error as { message?: string })?.message ?? error);
        this.configs.set([]);
        this.loading.set(false);
      },
    });
  }

  /** 「所属组织」列：能解析出名称则显示名称，否则退回组织编码 */
  protected orgLabel(orgId?: string): string {
    if (!orgId) {
      return '-';
    }
    return this.orgNames().get(orgId) ?? orgId;
  }

  /** 点表是否归属当前组织且组织可用（归属他组织 / 浏览模式的公开点表均不可操作） */
  protected isOwn(config: ModbusConfig): boolean {
    return this.orgActive() && !!config.orgId && config.orgId === this.currentOrgId;
  }

  /** 是否显示删除：点表归属当前组织、当前账号是该组织管理员，且仍处于开发态（后端同口径拒绝 released/preview） */
  protected canDelete(config: ModbusConfig): boolean {
    return this.isOwn(config) && this.isCurrentOrgAdmin() && lifecycleModifiable(config.lifecycle);
  }

  protected remove(config: ModbusConfig) {
    const slave = config.slave ?? {};
    const label = `${slave.manufacturer || ''} ${slave.model || ''}`.trim() || config.id || '';
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

  private doRemove(config: ModbusConfig) {
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
