import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  ViewContainerRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { NzModalService } from 'ng-zorro-antd/modal';
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
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '../../../../../../service/account.service';
import { MatrixService } from '../../../../../../service/matrix.service';
import { ModbusService } from '../../../../../../service/modbus.service';
import { MainI18nService } from '../../../../../../service/i18n.service';
import { DeviceEntity } from '../../../../../../typedef/define/device/DeviceEntity';
import { ModbusConfig, modbusConfigLabel } from '../../../../../../typedef/define/modbus/Modbus';
import { SpaceEntity } from '../../../../../../typedef/define/space/SpaceEntity';
import { OrganizationMember } from '../../../../../../typedef/define/user/UserOrganization';
import {
  ModbusService as ModbusServiceDef,
  ModbusServiceFieldAlarm,
  ModbusServiceFunction,
} from '../../../../../../typedef/define/modbus/ModbusService';
import { newAlarmId } from '../../../../../../typedef/define/modbus/ModbusAlarm';
import {
  WRITE_METHOD_REPLY_KEY,
  alarmItems,
  definedAlarmCount,
  describeFunctionResponse,
  isReadFunction,
  withAlarmsOf,
} from '../service.functions';
import {
  DeviceServiceAlarmDialogComponent,
  type ServiceAlarmDialogData,
} from '../editor/alarms/device.service.alarm.dialog.component';

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
 *
 * 唯一能改的东西是**告警配置**（方法列表里的「告警配置」列，见 {@link openAlarmDialog}），
 * 且只给空间管理员：其余人打开的是同一份配置的只读档。
 */
@Component({
  selector: 'device-service-detail',
  templateUrl: './device.service.detail.component.html',
  styleUrls: ['./device.service.detail.component.less'],
  changeDetection: ChangeDetectionStrategy.Eager,
  // 告警对话框由本页创建，服务得本页给（与编辑页同一条：谁开对话框谁提供）
  providers: [NzModalService],
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
    NzSpaceModule,
  ],
})
export class DeviceServiceDetailComponent implements OnInit {
  protected readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly msg = inject(NzMessageService);
  private readonly account = inject(AccountService);
  private readonly matrix = inject(MatrixService);
  private readonly modbus = inject(ModbusService);
  private readonly modal = inject(NzModalService);
  /** 告警对话框挂在本页的视图容器下：本页走了不该留一个悬着的对话框 */
  private readonly viewContainerRef = inject(ViewContainerRef);
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

  /** 正在落库告警配置：这期间「告警配置」列上的按钮先别按（免得拿旧定义再开一次对话框） */
  readonly saving = signal(false);

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
    const orgEntry = this.rootSpace()?.accesses?.find(
      (a) => a.type === 'organization' && a.id === org.id,
    );
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
   * 告警配置（对话框）
   * ----------------------------------------------------------------------------------------------*/

  /**
   * 该方法配了多少条告警规则：「告警配置」列上那个数字（见 {@link definedAlarmCount}）。
   * 数的是**定义本身**：本页手上只有从服务端读回来的那一份，没有编辑页那份侧表。
   */
  protected readonly alarmCount = definedAlarmCount;

  /** 模板拿得到 {@link isReadFunction}（模板里够不着模块内的函数，得挂在类上） */
  protected readonly isReadFunction = isReadFunction;

  /**
   * 打开告警配置对话框：**能不能改看 {@link isAdmin}** —— 空间管理员看到的是可编辑的那一档，
   * 其余人是同一份内容的只读档：控件禁着（但**不灰化**，值照常看得清）、没有「确认」。
   *
   * 规则**抄一份副本**进去（与编辑页同理）：改到一半取消 / 关窗，页面上的定义一个字都没动，
   * 点「确认」才走 {@link saveAlarms} 落库。
   *
   * 副本按**出值名**作 key（对话框只认这一批出值，`点表ID#序号` 前缀对它没有意义），
   * 并顺手补 `id`：行是按 `id` 认的，而更早配下的规则可能没有身份（见 {@link newAlarmId}）。
   */
  protected openAlarmDialog(func: ModbusServiceFunction): void {
    const items = alarmItems(func);
    const readOnly = !this.isAdmin();
    const seeded = new Map<string, ModbusServiceFieldAlarm[]>();
    for (const item of items) {
      // 位行只看位自己那一组：父字段的告警是另一个出值的事，不能拿它冒充位上的配置
      const rules = (item.bit ? item.bit.alarms : item.field.alarms) ?? [];
      seeded.set(
        item.key,
        rules.map((rule) => (rule.id ? { ...rule } : { ...rule, id: newAlarmId() })),
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
      nzData: { name: func.name, request: func.request, items, alarms: seeded, readOnly },
      nzWidth: 960,
      nzFooter: readOnly
        ? [
            {
              label: this.i18n.translate.instant('关闭'),
              onClick: (component) => component!.cancel(),
            },
          ]
        : [
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

    // 只读档与「取消」都交回 undefined：一个字都不改
    modal.afterClose.subscribe((result) => {
      if (result) {
        this.saveAlarms(func, result);
      }
    });
  }

  /**
   * 把对话框交回来的规则表落库：请求体是**整份定义**（服务端接口就是整份覆盖），
   * 只换这个方法的那几个出值，别的方法与字段原样带回去。
   *
   * 编辑页那边是先改页面上的侧表、再由用户点底部那个保存按钮；本页没有保存按钮（它是看的地方），
   * 于是管理员在对话框里点「确认」即落库 —— 少一个「改完还得记得去别处按一下」的坑。
   */
  private saveAlarms(
    func: ModbusServiceFunction,
    alarms: Map<string, ModbusServiceFieldAlarm[]>,
  ): void {
    const service = this.service();
    const spaceId = this.account.space().id;
    if (!service?.id || !spaceId) {
      return;
    }
    const body: ModbusServiceDef = {
      ...service,
      functions: (service.functions ?? []).map((f) =>
        f.index === func.index ? withAlarmsOf(f, alarms) : f,
      ),
    };
    this.saving.set(true);
    this.modbus.updateService(spaceId, service.id, body).subscribe({
      next: (saved) => {
        this.saving.set(false);
        // 用服务端回来的那一份：updater 与更新时间跟着刷新，页面上显示的才是库里现在的
        this.service.set(saved);
        this.msg.success(this.i18n.translate.instant('保存成功'));
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

  protected editLink(): string[] {
    return ['/main/device/services', this.did(), 'service', 'edit', this.id()];
  }

  /** 服务历史数据页路径（表格 / 曲线图两种形式，见 device.service.history.component） */
  protected historyLink(): string[] {
    return ['/main/device/services', this.did(), 'service', 'history', this.id()];
  }

  /** 源点表显示名：厂家 型号（点表取不到时退回 id；没配点表显示 -）。拼法与其他三处共用一份 */
  protected configLabel(configId?: string): string {
    return modbusConfigLabel(this.configs(), configId) || '-';
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

  /**
   * 方法的自动调用周期：没配周期（含全部写方法）= 只手动调用，显示 -；
   * 配了就是周期值，停用（开关关着）时也照常显示 —— 那是留着待用的配置。
   */
  protected intervalText(func: ModbusServiceFunction): string {
    if (func.interval == null) {
      return '-';
    }
    return `${func.interval} ${this.i18n.translate.instant('秒')}`;
  }

  /**
   * 自动轮询状态：启用 / 停用（周期保留）/ -（写方法或没配周期）。
   * 服务里没写 polling 的定义按「有周期即启用」算，与后端 validatePolling 的缺省判定一致。
   */
  protected pollingText(func: ModbusServiceFunction): string {
    if (!isReadFunction(func) || func.interval == null) {
      return '-';
    }
    return this.i18n.translate.instant(func.polling === false ? '停用' : '启用');
  }

  /** 自动轮询是否停着（模板给标签上色用：停用是灰的，启用是绿的） */
  protected pollingOff(func: ModbusServiceFunction): boolean {
    return isReadFunction(func) && func.interval != null && func.polling === false;
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
