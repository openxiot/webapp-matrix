import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '../../../../../../service/account.service';
import { MatrixService } from '../../../../../../service/matrix.service';
import { ModbusService } from '../../../../../../service/modbus.service';
import { MainI18nService } from '../../../../../../service/i18n.service';
import { DeviceEntity } from '../../../../../../typedef/define/device/DeviceEntity';
import { ModbusConfig } from '../../../../../../typedef/define/modbus/Modbus';
import { SpaceEntity } from '../../../../../../typedef/define/space/SpaceEntity';
import { OrganizationMember } from '../../../../../../typedef/define/user/UserOrganization';
import {
  ModbusService as ModbusServiceDef,
  ModbusServiceFunction,
} from '../../../../../../typedef/define/modbus/ModbusService';
import { WRITE_METHOD_REPLY_KEY, describeFunctionResponse } from '../service.functions';

/** 一次调用的结果：调的是哪个方法、返回了什么 */
interface InvokeResult {
  func: ModbusServiceFunction;
  data: Record<string, unknown>;
}

/** 结果表格里的一行 */
interface ResultRow {
  field: string;
  value: string;
  unit: string;
}

/**
 * Modbus 服务详情：只读展示一份服务定义（依赖设备坐标 + 由点表展开出来的方法），
 * 并就地**调用**某个方法（POST /service/invoke，服务端把请求帧发给依赖设备、按应答规则解析）。
 *
 * 写方法（fc 05/06/0F/10）的应答是请求回显、没有返回字段，调用成功后返回空对象。
 */
@Component({
  selector: 'device-service-detail',
  templateUrl: './device.service.detail.component.html',
  styleUrls: ['./device.service.detail.component.less'],
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
    NzEmptyModule,
    NzAlertModule,
    NzDescriptionsModule,
    NzIconModule,
    BreadcrumbTranslateDirective,
    TranslatePipe,
  ],
})
export class DeviceServiceDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly msg = inject(NzMessageService);
  private readonly account = inject(AccountService);
  private readonly matrix = inject(MatrixService);
  private readonly modbus = inject(ModbusService);
  protected readonly i18n = inject(MainI18nService);

  /** 依赖设备（DTU）did */
  readonly did = signal('');
  /** 服务 id */
  readonly id = signal('');

  readonly loading = signal(true);
  readonly service = signal<ModbusServiceDef | undefined>(undefined);
  readonly device = signal<DeviceEntity | undefined>(undefined);

  /** 可见点表：把服务的 configId 解析成「厂家 型号」 */
  readonly configs = signal<ModbusConfig[]>([]);

  /** 正在调用的方法序号（按钮 loading） */
  readonly invoking = signal<number | null>(null);
  readonly result = signal<InvokeResult | null>(null);

  readonly functions = computed<ModbusServiceFunction[]>(() => this.service()?.functions ?? []);

  /* ----------------------------------------------------------------------------------------------
   * 权限：编辑入口只给空间管理员（与列表页、设备页同一口径）
   * ----------------------------------------------------------------------------------------------*/

  /** 项目根空间，权限判定用 */
  readonly rootSpace = signal<SpaceEntity | null>(null);
  /** 项目根空间的访问条目 */
  readonly members = signal<OrganizationMember[]>([]);

  /** 当前用户是不是这个项目的空间管理员：先看自己在根空间上的直接角色，再看所属组织的角色 */
  readonly isAdmin = computed(() => {
    const me = this.account.user();
    if (!me?.id) return false;
    const selfEntry = this.members().find((m) => m.userId === me.id);
    if (selfEntry?.role === 'admin') return true;
    const org = this.account.organization();
    const orgEntry = this.rootSpace()?.accesses?.find((a) => a.type === 'organization' && a.id === org.id);
    if (orgEntry) {
      const meInOrg = org.members.find((m) => m.userId === me.id);
      return meInOrg !== undefined && meInOrg.role === 'admin';
    }
    return false;
  });

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      this.did.set(params['did'] ?? '');
      this.id.set(params['id'] ?? '');
      this.loadDevice(this.did());
      this.loadService(this.id());
    });
    this.loadConfigs();
    this.loadAdminContext();
  }

  /** 加载项目根空间 + 成员，供 isAdmin 判定；非管理员无需展示按钮，失败静默即可。 */
  private loadAdminContext(): void {
    const rootId = this.account.space().id;
    if (!rootId) return;
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

  private loadService(id: string): void {
    if (!id) {
      return;
    }
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.loading.set(false);
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    this.loading.set(true);
    this.result.set(null);
    this.modbus.getService(spaceId, id).subscribe({
      next: (service) => {
        this.service.set(service);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /** 设备只用于展示摘要（在线态），取不到不影响服务本身的查看与调用 */
  private loadDevice(did: string): void {
    const spaceId = this.account.space().id;
    if (!spaceId) {
      return;
    }
    this.matrix.getDevice(spaceId, did).subscribe({
      next: (device) => this.device.set(device),
      error: () => {},
    });
  }

  private loadConfigs(): void {
    this.modbus.listVisible().subscribe({
      next: (configs) => this.configs.set(configs),
      error: () => {},
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 调用
   * ----------------------------------------------------------------------------------------------*/

  protected invoke(func: ModbusServiceFunction): void {
    const id = this.service()?.id;
    if (!id) {
      return;
    }
    // 调用要空间成员：空间 ID 取当前项目根空间，与查询同源
    const spaceId = this.account.space().id;
    if (!spaceId) {
      this.msg.warning(this.i18n.translate.instant('请先在项目列表中选择一个项目'));
      return;
    }
    this.invoking.set(func.index);
    this.modbus.invokeService(spaceId, id, func.index).subscribe({
      next: (data) => {
        this.invoking.set(null);
        this.result.set({ func, data });
        this.msg.success(this.i18n.translate.instant('调用成功'));
      },
      error: (e) => {
        this.invoking.set(null);
        this.msg.error(e?.message ?? e);
      },
    });
  }

  /** 调用结果按返回的键逐行展开，单位从该方法的应答字段定义里取 */
  protected resultRows(): ResultRow[] {
    const result = this.result();
    if (!result) {
      return [];
    }
    const fields = result.func.response ?? [];
    return Object.entries(result.data).map(([key, value]) => ({
      field: key,
      value: formatValue(value),
      unit: fields.find((f) => f.field === key)?.unit ?? '',
    }));
  }

  protected rawJson(): string {
    const result = this.result();
    return result ? JSON.stringify(result.data, null, 2) : '';
  }

  /* ----------------------------------------------------------------------------------------------
   * 展示文案
   * ----------------------------------------------------------------------------------------------*/

  protected editLink(): string[] {
    return ['/main/device/services', this.did(), 'service', 'edit', this.id()];
  }

  protected back(): void {
    this.router.navigate(['/main/device/services', this.did()]);
  }

  /** 源点表显示名：厂家 型号（点表取不到时退回 id） */
  protected configLabel(configId?: string): string {
    if (!configId) {
      return '-';
    }
    const cfg = this.configs().find((c) => c.id === configId);
    if (!cfg) {
      return configId;
    }
    const label = `${cfg.slave?.manufacturer?.trim() ?? ''} ${cfg.slave?.model?.trim() ?? ''}`.trim();
    return label || configId;
  }

  /** 调用坐标文案：#siid · #aiid（入参 piid） */
  protected coordinateLabel(service: ModbusServiceDef): string {
    const dev = service.device;
    if (!dev) {
      return '-';
    }
    return `#${dev.siid} · #${dev.aiid}（piid ${dev.argument}）`;
  }

  protected responseText(func: ModbusServiceFunction): string {
    return describeFunctionResponse(func) ?? this.i18n.translate.instant(WRITE_METHOD_REPLY_KEY);
  }

  protected updateTime(service: ModbusServiceDef): string | number | null {
    return service.updater?.timestamp ?? null;
  }
}

/** 调用返回值的展示文案：对象/数组退化成 JSON，null 显示为 - */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
