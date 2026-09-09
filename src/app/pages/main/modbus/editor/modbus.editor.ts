import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { computed, effect, inject, signal, ViewContainerRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { TranslateService } from '@ngx-translate/core';
import { AccountService } from '../../../../service/account.service';
import { ModbusService } from '../../../../service/modbus.service';
import { UserOrganizationService } from '../../../../service/user.organization.service';
import { ModbusCommand, ModbusDeviceConfig, ModbusDeviceInfo } from '../../../../typedef/define/modbus/Modbus';
import { DeviceType } from '@openxiot/xiot-core-spec-ts';
import { CommandEditComponent, type ModbusCommandDialogData } from '../command/command.edit.component';
import {
  RequestFrameDialogComponent,
  type RequestFrameDialogData,
} from './request/request.frame.dialog.component';
import { buildRequestFrame } from './request/request.frame';
import {
  ModbusDeviceInfoEditComponent,
  type ModbusDeviceInfoEditData,
} from '../device-info/modbus.device.info.edit.component';
import { coilStateText, fcLabelKey, isWriteFc, logicalAddressOf } from '../command/point.options';

/**
 * 新建设备点表 / 编辑设备点表 两个页面共用的编辑器逻辑与视图状态。
 * 页面文案、路由行为等差异由子类以 {@link kind} 区分：
 * - ModbusAddComponent（新建）：空表单起步，submit 走 create；
 * - ModbusDetailComponent（编辑）：按路由 id 载入既有点表，submit 走 update。
 *
 * 保存有效性：修改了设备信息、或增删改功能码动作后，保存按钮才可点击（changed）。
 */
export abstract class ModbusEditor {
  /** add：新建设备点表；detail：编辑设备点表 */
  protected abstract get kind(): 'add' | 'detail';

  /** 功能码枚举 → 展示用 i18n key / 逻辑地址换算 / 读写区分 / 线圈状态文案（模板经 translate 管道渲染） */
  protected readonly fcLabelKey = fcLabelKey;
  protected readonly logicalAddressOf = logicalAddressOf;
  protected readonly isWriteFc = isWriteFc;
  protected readonly coilStateText = coilStateText;

  loading = signal(false);
  submitting = signal(false);

  /** 设备信息：默认私有、空值，经对话框只读展示/编辑 */
  deviceInfo = signal<ModbusDeviceInfo>(emptyDeviceInfo());

  commands = signal<ModbusCommand[]>([]);

  /** 相对初始值是否发生变化（设备信息或功能码动作），决定「保存」是否可用 */
  readonly changed = computed(
    () =>
      deviceInfoKey(this.deviceInfo()) !== deviceInfoKey(this.baseDeviceInfo) ||
      commandsKey(this.commands()) !== commandsKey(this.baseCommands),
  );

  /** 新建页标题用 */
  protected get isAdd(): boolean {
    return this.kind === 'add';
  }

  /** 设备类型只读展示：由完整 DeviceType 反解为「名字空间 · 设备名」。 */
  protected deviceTypeDisplay(type: string | undefined): string {
    if (!type) {
      return '-';
    }
    try {
      const t = DeviceType.parse(type);
      return t.ns && t.name ? `${t.ns} · ${t.name}` : type;
    } catch {
      return type;
    }
  }

  /** 是否已选择组织：未选组织时为只读浏览（隐藏 编辑/添加功能码/保存），详情仅能查看。 */
  protected readonly hasOrg = computed(() => this.account.organization().id.length > 0);

  /** 当前载入配置所属组织（applyConfig 时置；详情页据此判断能否管理）。 */
  private readonly configOrgId = signal('');
  /** 当前账号是否为「当前已选组织」的管理员（组织成员 role=admin，经组织列表接口判定）。 */
  private readonly selectedOrgAdmin = signal(false);

  /**
   * 是否可管理（决定 保存/设备信息编辑/添加功能码/行操作 的可见性）：
   * - add（新建）：有已选组织即可；
   * - detail（详情/编辑）：需已选组织 + 当前载入配置属该组织 + 当前账号是该组织管理员，
   *   否则页面退化为只读（行操作仅剩「详情」）。
   */
  protected readonly canManage = computed(() => {
    if (this.kind !== 'detail') {
      return this.hasOrg();
    }
    return (
      this.hasOrg() &&
      this.configOrgId().length > 0 &&
      this.configOrgId() === this.account.organization().id &&
      this.selectedOrgAdmin()
    );
  });

  /** 修改判定基准：进入页面 / 载入既有点表时的快照 */
  protected baseDeviceInfo: ModbusDeviceInfo = emptyDeviceInfo();
  protected baseCommands: ModbusCommand[] = [];

  protected location = inject(Location);
  protected account = inject(AccountService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private service = inject(ModbusService);
  private orgService = inject(UserOrganizationService);
  private msg = inject(NzMessageService);
  private translate = inject(TranslateService);
  private modal = inject(NzModalService);
  private viewContainerRef = inject(ViewContainerRef);

  private routeId = '';
  /** 初始即取当前已选组织（若已选）；这样带组织进入详情时不会先发一次无组织请求。 */
  private currentOrgId = this.account.organization().id;
  private loadedKey = '';

  constructor() {
    this.route.params.subscribe((params) => {
      const id = (params['id'] as string) || '';
      if (id !== this.routeId) {
        this.routeId = id;
        this.maybeLoadDetail();
      }
    });

    // 组织信号变化（异步加载 / 切换组织）时若处于编辑页则重新载入
    effect(() => {
      const orgId = this.account.organization().id;
      if (orgId !== this.currentOrgId) {
        this.currentOrgId = orgId;
        this.maybeLoadDetail();
      }
    });

    // 详情页：按「当前已选组织」刷新管理员身份（决定能否管理该组织的点表）；新建页用不到
    effect(() => {
      const orgId = this.account.organization().id;
      if (this.kind === 'detail') {
        this.refreshMembership(orgId);
      } else {
        this.selectedOrgAdmin.set(false);
      }
    });
  }

  /**
   * 判定当前账号是否为「组织 orgId」的管理员：经组织列表接口读成员角色（与列表页一致）。
   * 请求返回前若组织已切换则丢弃结果，避免旧组织身份覆盖新组织。
   */
  private refreshMembership(orgId: string): void {
    if (!orgId) {
      this.selectedOrgAdmin.set(false);
      return;
    }
    this.orgService.getOrganizations().subscribe({
      next: (organizations) => {
        if (this.account.organization().id !== orgId) {
          return; // 期间已切换组织，本次结果过期
        }
        const list = organizations ?? [];
        const me = this.account.user().id;
        let admin = false;
        for (const org of list) {
          if (org.id && org.id === orgId) {
            admin = (org.members ?? []).some((m) => m.userId === me && m.role === 'admin');
            break;
          }
        }
        this.selectedOrgAdmin.set(admin);
      },
      error: () => this.selectedOrgAdmin.set(false),
    });
  }

  /**
   * 「编辑设备点表」按路由 id 载入（防重复请求）。
   * 有组织时带组织头取「本组织或公开」配置；未选组织时同样发起请求（不带组织头），
   * 后端按公开配置返回，保证无组织浏览也能打开详情看内容。
   */
  private maybeLoadDetail(): void {
    if (this.kind !== 'detail') {
      return;
    }
    if (!this.routeId) {
      return;
    }
    const key = `${this.routeId}|${this.currentOrgId}`;
    if (key === this.loadedKey) {
      return;
    }
    this.loadedKey = key;
    this.loadConfig();
  }

  private loadConfig(): void {
    this.loading.set(true);
    this.service.get(this.routeId).subscribe({
      next: (config) => {
        this.applyConfig(config);
        this.loading.set(false);
      },
      error: (error) => {
        this.msg.warning((error as { message?: string })?.message ?? error);
        this.loading.set(false);
      },
    });
  }

  private applyConfig(config: ModbusDeviceConfig): void {
    this.configOrgId.set(config.orgId ?? '');
    this.deviceInfo.set({
      manufacturer: config.manufacturer ?? '',
      model: config.model ?? '',
      type: config.type,
      slaveId: config.slaveId,
      visibility: config.visibility ?? 'private',
      description: config.description,
    });
    // 兼容旧文档：后端启动迁移把 points[] 转成 commands[]，本地按空处理即可
    this.commands.set((config.commands ?? []).map((c) => ({ ...c })));
    // 载入完成后再拍基准：初始状态保存按钮应为禁用
    this.baseDeviceInfo = this.deviceInfo();
    this.baseCommands = this.commands();
  }

  /* ----------------------------------------------------------------------------------------------
   * 设备信息：只读展示，经对话框编辑（对齐组织成员 MemberEdit 模式）
   * ----------------------------------------------------------------------------------------------*/
  protected editDeviceInfo(): void {
    const modal = this.modal.create<
      ModbusDeviceInfoEditComponent,
      ModbusDeviceInfoEditData,
      ModbusDeviceInfo
    >({
      nzTitle: this.translate.instant('编辑设备信息'),
      nzContent: ModbusDeviceInfoEditComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: { ...this.deviceInfo(), isAdd: this.isAdd },
      nzFooter: [
        {
          label: this.translate.instant('取消'),
          onClick: (component) => component!.cancel(),
        },
        {
          label: this.translate.instant('确认'),
          type: 'primary',
          disabled: (component) => !(component!.valid() && component!.changed()),
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (result) {
        this.deviceInfo.set(result);
      }
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 功能码动作：添加/编辑共用一个动态表单对话框 CommandEditComponent
   * ----------------------------------------------------------------------------------------------*/
  protected addCommand(): void {
    const modal = this.modal.create<CommandEditComponent, void, ModbusCommand>({
      nzTitle: this.translate.instant('添加功能码'),
      nzContent: CommandEditComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzWidth: 1024,
      nzFooter: [
        {
          label: this.translate.instant('取消'),
          onClick: (component) => component!.cancel(),
        },
        {
          label: this.translate.instant('确认'),
          type: 'primary',
          disabled: (component) => !component!.valid(),
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (result) {
        this.commands.update((list) => [...list, result]);
      }
    });
  }

  protected editCommand(index: number): void {
    const command = this.commands()[index];
    if (!command) {
      return;
    }
    const modal = this.modal.create<CommandEditComponent, ModbusCommandDialogData, ModbusCommand>({
      nzTitle: this.translate.instant('编辑功能码'),
      nzContent: CommandEditComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: { command },
      nzWidth: 1024,
      nzFooter: [
        {
          label: this.translate.instant('取消'),
          onClick: (component) => component!.cancel(),
        },
        {
          label: this.translate.instant('确认'),
          type: 'primary',
          disabled: (component) => !(component!.valid() && component!.changed()),
          onClick: (component) => component!.ok(),
        },
      ],
    });

    modal.afterClose.subscribe((result) => {
      if (result) {
        this.commands.update((list) => list.map((c, i) => (i === index ? result : c)));
      }
    });
  }

  /**
   * 只读查看某条功能码（非管理态的行操作「详情」）：
   * 复用 CommandEditComponent，readOnly=true 全控件禁用、无增删，弹窗仅 关闭。
   */
  protected viewCommand(index: number): void {
    const command = this.commands()[index];
    if (!command) {
      return;
    }
    const modal = this.modal.create<CommandEditComponent, ModbusCommandDialogData, ModbusCommand>({
      nzTitle: this.translate.instant('详情'),
      nzContent: CommandEditComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: { command, readOnly: true },
      nzWidth: 1024,
      nzFooter: [
        {
          label: this.translate.instant('关闭'),
          onClick: (component) => component!.cancel(),
        },
      ],
    });
  }

  protected removeCommand(index: number): void {
    this.commands.update((list) => list.filter((_, i) => i !== index));
  }

  /**
   * 行操作「命令」：按当前 从站地址 + 该功能码数据 生成完整 Modbus RTU 请求帧
   * （含从站地址与 CRC16；0F/10 数据区按配置编码真实值），弹窗展示十六进制。
   * 从站地址未设置或命令数据不完整时提示，不弹窗。
   */
  protected showRequest(index: number): void {
    const command = this.commands()[index];
    if (!command) {
      return;
    }
    const slaveId = this.deviceInfo().slaveId;
    if (slaveId == null) {
      this.msg.warning(this.translate.instant('请先设置从站地址'));
      return;
    }
    const result = buildRequestFrame(command, slaveId);
    if (!result.ok) {
      this.msg.warning(this.translate.instant(result.messageKey));
      return;
    }
    this.modal.create<RequestFrameDialogComponent, RequestFrameDialogData, void>({
      nzTitle: this.translate.instant('请求命令'),
      nzContent: RequestFrameDialogComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: { command, frame: result.frame },
      nzWidth: 720,
      nzFooter: [
        {
          label: this.translate.instant('关闭'),
          onClick: (component) => component!.cancel(),
        },
      ],
    });
  }

  /**
   * 拖拽行重排功能码（取代原 上移/下移 行操作）。
   * 表格行由 cdkDropList + cdkDrag 驱动，松开时把命令移到新位置即可（changed 生效）。
   */
  protected onCommandDropped(event: CdkDragDrop<ModbusCommand[]>): void {
    this.commands.update((list) => {
      const copy = [...list];
      moveItemInArray(copy, event.previousIndex, event.currentIndex);
      return copy;
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 提交（新建 create / 编辑 update）
   * ----------------------------------------------------------------------------------------------*/
  protected submit(): void {
    const info = this.deviceInfo();
    if (
      !info.manufacturer ||
      info.manufacturer.trim().length === 0 ||
      !info.model ||
      info.model.trim().length === 0
    ) {
      this.msg.warning(this.translate.instant('请填写厂家与型号'));
      this.editDeviceInfo();
      return;
    }
    if (info.slaveId == null) {
      this.msg.warning(this.translate.instant('请输入从站地址（0-247）'));
      this.editDeviceInfo();
      return;
    }
    if (this.isAdd && !info.type) {
      // 新建必选设备类型（服务端 create 也强制 type）；编辑存量旧配置允许暂缺（后端保留原值）
      this.msg.warning(this.translate.instant('请选择设备类型'));
      this.editDeviceInfo();
      return;
    }
    if (!this.currentOrgId) {
      this.msg.warning(this.translate.instant('请先选择组织'));
      return;
    }

    const commands: ModbusCommand[] = this.commands()
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({
        ...c,
        coils: c.coils ? c.coils.map((x) => ({ ...x })) : undefined,
        registers: c.registers ? c.registers.map((x) => ({ ...x })) : undefined,
      }));

    const body: ModbusDeviceConfig = {
      orgId: this.currentOrgId,
      manufacturer: info.manufacturer.trim(),
      model: info.model.trim(),
      type: this.blankToUndefined(info.type),
      slaveId: info.slaveId,
      visibility: info.visibility ?? 'private',
      description: this.blankToUndefined(info.description),
      commands,
    };

    this.submitting.set(true);
    const request =
      this.kind === 'detail'
        ? this.service.update(this.routeId, body)
        : this.service.create(body);
    request.subscribe({
      next: () => {
        this.submitting.set(false);
        this.msg.success(
          this.translate.instant(this.kind === 'detail' ? '保存成功' : '创建成功'),
        );
        void this.router.navigate(['/main/modbus']);
      },
      error: (error) => {
        this.submitting.set(false);
        this.msg.warning((error as { message?: string })?.message ?? error);
      },
    });
  }

  private blankToUndefined(value: string | null | undefined): string | undefined {
    if (value == null) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}

function emptyDeviceInfo(): ModbusDeviceInfo {
  return { manufacturer: '', model: '', visibility: 'private' };
}

/** 空串/null/undefined 视作同一「空」，仅用于变更比对，不影响真实提交值 */
function normValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return value;
}

function deviceInfoKey(info: ModbusDeviceInfo): string {
  return JSON.stringify([
    normValue(info.manufacturer),
    normValue(info.model),
    normValue(info.type),
    normValue(info.slaveId),
    normValue(info.visibility),
    normValue(info.description),
  ]);
}

function commandKey(command: ModbusCommand): string {
  return JSON.stringify([
    normValue(command.name),
    normValue(command.fc),
    normValue(command.start),
    normValue(command.quantity),
    normValue(command.dataType),
    normValue(command.byteOrder),
    normValue(command.scale),
    normValue(command.unit),
    normValue(command.coilState),
    normValue(command.registerValue),
    (command.coils ?? []).map((x) => [normValue(x.offset), normValue(x.on)]),
    (command.registers ?? []).map((x) => [
      normValue(x.address),
      normValue(x.dataType),
      normValue(x.byteOrder),
      normValue(x.value),
    ]),
  ]);
}

function commandsKey(commands: ModbusCommand[]): string {
  return (commands ?? []).map((c) => commandKey(c)).join('\u0001');
}
