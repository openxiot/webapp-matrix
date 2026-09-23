import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { computed, effect, inject, signal, ViewContainerRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { TranslateService } from '@ngx-translate/core';
import { AccountService } from '@app/service/account.service';
import { ModbusService } from '@app/service/modbus.service';
import { UserOrganizationService } from '@app/service/user.organization.service';
import { ModbusCommand, ModbusConfig, ModbusDeviceInfo } from '@app/typedef/define/modbus/Modbus';
import { LifeCycle } from '@openxiot/xiot-core-spec-ts';
import { CommandEditComponent, type ModbusCommandDialogData } from '../command/command.edit.component';
import { RequestFrameDialogComponent, type RequestFrameDialogData } from './request/request.frame.dialog.component';
import { buildRequestFrame, buildResponseFrame } from './request/request.frame';
import { ModbusDeviceInfoEditComponent, type ModbusDeviceInfoEditData, } from '../device-info/modbus.device.info.edit.component';
import {
  READ_REG_FCS,
  coilStateText,
  fcLabelKey,
  frameQuantityOf,
  isWriteFc,
  logicalAddressOf,
} from '../command/point.options';
import { lifecycleModifiable, lifecycleStyle } from '../modbus.lifecycle';
import { ConfirmComponent } from '@app/common/dialog/confirm/confirm.component';

/**
 * 新建设备点表 / 编辑设备点表 两个页面共用的编辑器逻辑与视图状态。
 * 页面文案、路由行为等差异由子类以 {@link kind} 区分：
 * - ModbusAddComponent（新建）：空表单起步，submit 走 create（仍保留顶部「保存」按钮）；
 * - ModbusDetailComponent（编辑）：按路由 id 载入既有点表。**无整页「保存」**：设备信息 / 功能码
 *   的每次变更（对话框确认、删除确认、拖拽重排）都即时 PUT 落库；顶部「保存」位置换成
 *   按 {@link lifecycle} 状态区分的 预览 / 发布 / 下线（经专用 lifecycle 接口，普通更新不触碰）。
 *
 * 仅「开发」(development) 态可编辑内容（与后端同口径）；released / preview 内容只读，仅可 下线 / 发布。
 */
export abstract class ModbusEditor {
  /** add：新建设备点表；detail：编辑设备点表 */
  protected abstract get kind(): 'add' | 'detail';

  /** 功能码枚举 → 展示用 i18n key / 逻辑地址换算 / 读写区分 / 线圈状态文案（模板经 translate 管道渲染） */
  protected readonly fcLabelKey = fcLabelKey;
  protected readonly logicalAddressOf = logicalAddressOf;
  protected readonly isWriteFc = isWriteFc;
  protected readonly coilStateText = coilStateText;
  protected readonly readRegFcs = READ_REG_FCS;
  protected readonly frameQuantityOf = frameQuantityOf;
  protected readonly lifecycleStyle = lifecycleStyle;

  /** 生命周期枚举值（模板 @switch 按 lifecycle() 分支渲染 header 按钮组）。 */
  protected readonly LifeCycle = LifeCycle;

  loading = signal(false);
  submitting = signal(false);

  /** 设备信息：默认私有、空值，经对话框只读展示/编辑 */
  deviceInfo = signal<ModbusDeviceInfo>(emptyDeviceInfo());

  /** 配置生命周期（config 顶层，随 applyConfig 置位；新建缺省即开发态，由服务端落库）。 */
  lifecycle = signal('development');

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

  /** 是否已选择组织：未选组织时为只读浏览（隐藏 编辑/添加功能码/保存），详情仅能查看。 */
  protected readonly hasOrg = computed(() => this.account.organization().id.length > 0);

  /** 当前载入配置所属组织（applyConfig 时置；详情页据此判断能否管理）。 */
  private readonly configOrgId = signal('');
  /** 当前账号是否为「当前已选组织」的管理员（组织成员 role=admin，经组织列表接口判定）。 */
  private readonly selectedOrgAdmin = signal(false);

  /**
   * 是否可流转生命周期（决定 header 的 预览/发布/下线 按钮可见性）：
   * 归属当前已选组织 + 当前账号是该组织管理员；不依赖 lifecycle——
   * released / preview 内容虽只读，仍要能 下线 / 发布。
   */
  protected readonly canChangeLifecycle = computed(() => {
    if (this.kind !== 'detail') {
      return false;
    }
    return (
      this.hasOrg() &&
      this.configOrgId().length > 0 &&
      this.configOrgId() === this.account.organization().id &&
      this.selectedOrgAdmin()
    );
  });

  /**
   * 是否可编辑配置内容（决定 设备信息编辑/添加功能码/行操作 的可见性）：
   * - add（新建）：有已选组织即可；
   * - detail（详情/编辑）：需归属当前组织 + 当前账号是该组织管理员 + 仍处于开发态（后端同口径）；
   *   released / preview 内容只读，仅保留 header 的生命周期操作（见 {@link canChangeLifecycle}）。
   */
  protected readonly canManage = computed(() => {
    if (this.kind !== 'detail') {
      return this.hasOrg();
    }
    return this.canChangeLifecycle() && lifecycleModifiable(this.lifecycle());
  });

  /** 详情页即时保存进行中又产生新变更时置位，待本次落库完成后用最新状态再刷一笔（串行化防丢改）。 */
  private persistQueued = false;

  /** 修改判定基准：进入页面 / 载入既有点表时的快照 */
  protected baseDeviceInfo: ModbusDeviceInfo = emptyDeviceInfo();
  protected baseCommands: ModbusCommand[] = [];

  protected location = inject(Location);
  protected account = inject(AccountService);
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

  private applyConfig(config: ModbusConfig): void {
    this.configOrgId.set(config.owner?.id ?? '');
    this.lifecycle.set(config.lifecycle ?? 'development');
    const slave = config.slave ?? {};
    this.deviceInfo.set({
      manufacturer: slave.manufacturer ?? '',
      model: slave.model ?? '',
      slaveId: slave.slaveId,
      type: slave.type,
      visibility: config.visibility ?? 'private',
      description: slave.description,
    });
    // 兼容旧文档：后端启动迁移把 points[] 转成 commands[]，本地按空处理即可
    // 排序以 index 为准（服务端也可能按数组位置返回）：先按 index 升序，再整理为连续 1..N
    const loaded = (config.commands ?? []).map((c) => ({ ...c }));
    loaded.sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER));
    this.commands.set(this.renumber(loaded));
    // 载入完成后再拍基准：初始状态保存按钮应为禁用（深拷贝，后续重排不污染基准）
    this.baseDeviceInfo = this.deviceInfo();
    this.baseCommands = this.commands().map((c) => ({ ...c }));
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
      nzWidth: 640,
      nzViewContainerRef: this.viewContainerRef,
      nzData: { ...this.deviceInfo() },
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
        this.persistDetail(); // 详情页：确定即保存
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
        this.commands.update((list) => this.renumber([...list, result]));
        this.persistDetail(); // 详情页：确定即保存
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
        this.commands.update((list) =>
          this.renumber(list.map((c, i) => (i === index ? { ...result, index: i + 1 } : c))),
        );
        this.persistDetail(); // 详情页：确定即保存
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

  /** 就地整理行序号：保持「数组序 = index 序」，逐行写 index = 位置 + 1。
   *  不换对象引用，让 cdkDropList 仍能按命令对象身份 diff 移动表格行。 */
  private renumber(list: ModbusCommand[]): ModbusCommand[] {
    for (let i = 0; i < list.length; i++) {
      list[i].index = i + 1;
    }
    return list;
  }

  /**
   * 删除一条功能码。
   * - add（新建页）：还没落库，直接删本地行；
   * - detail（详情页）：先弹确认框，确认后删行并即时 PUT 保存。
   */
  protected removeCommand(index: number): void {
    const command = this.commands()[index];
    if (!command) {
      return;
    }
    if (this.kind !== 'detail') {
      this.commands.update((list) => this.renumber(list.filter((_, i) => i !== index)));
      return;
    }
    const label =
      (command.name ?? '').trim() || `${this.translate.instant('功能码')} ${command.fc ?? ''}`.trim();
    const modal = this.modal.create<ConfirmComponent, string, string>({
      nzTitle: this.translate.instant('确认删除功能码', { label }),
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
        this.commands.update((list) => this.renumber(list.filter((_, i) => i !== index)));
        this.persistDetail(); // 详情页：确认即删除并保存
      }
    });
  }

  /**
   * 行操作「命令」：按当前 从站地址 + 该功能码数据 生成完整 Modbus RTU 请求帧与应答帧
   * （含从站地址与 CRC16；0F/10 数据区按配置编码真实值），弹窗展示十六进制与帧结构解析。
   * 应答帧含 正常应答（读=数据区示例值、写=回显/确认）+ 异常应答（异常码与 CRC 待设备返回）。
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
    const reply = buildResponseFrame(command, slaveId);
    if (!reply.ok) {
      this.msg.warning(this.translate.instant(reply.messageKey));
      return;
    }
    this.modal.create<RequestFrameDialogComponent, RequestFrameDialogData, void>({
      nzTitle: this.translate.instant('命令'),
      nzContent: RequestFrameDialogComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: {
        command,
        frame: result.frame,
        response: reply.preview.frame,
        exception: reply.preview.exception,
      },
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
   * 表格行由 cdkDropList + cdkDrag 驱动，松开时把命令移到新位置；详情页随即即时保存。
   */
  protected onCommandDropped(event: CdkDragDrop<ModbusCommand[]>): void {
    this.commands.update((list) => {
      const copy = [...list];
      moveItemInArray(copy, event.previousIndex, event.currentIndex);
      return this.renumber(copy);
    });
    this.persistDetail(); // 详情页：拖拽即改即存
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
    if (!this.currentOrgId) {
      this.msg.warning(this.translate.instant('请先选择组织'));
      return;
    }

    const body = this.buildBody();

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
        // 返回箭头、保存后都是退回上一层：本页的两个入口（列表上的「创建」与每行的「详情」）
        // 都在 /main/modbus，走历史比写死路由更贴合来处
        this.location.back();
      },
      error: (error) => {
        this.submitting.set(false);
        this.msg.warning((error as { message?: string })?.message ?? error);
      },
    });
  }

  /**
   * 组装当前完整配置为提交体（设备信息 + 可见度 + 功能码动作，深拷贝避免污染行对象）。
   * 不含 lifecycle —— 生命周期只经 {@link changeLifecycle} 单独流转，普通更新永不触碰。
   */
  private buildBody(): ModbusConfig {
    const info = this.deviceInfo();
    const commands: ModbusCommand[] = this.commands()
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({
        ...c,
        coils: c.coils ? c.coils.map((x) => ({ ...x })) : undefined,
        registers: c.registers ? c.registers.map((x) => ({ ...x })) : undefined,
      }));
    return {
      // 新建/编辑仍以当前组织为归属（企业语义原有 orgId 就地成为 owner）：新建时后端据此校验
      // 组织成员并落库 owner 子文档；更新忽略 owner（归属后端在 update 里保留原值）。
      owner: {
        id: this.currentOrgId,
        type: 'organization',
        name: this.account.organization().name,
      },
      slave: {
        manufacturer: info.manufacturer.trim(),
        model: info.model.trim(),
        slaveId: info.slaveId,
        type: this.blankToUndefined(info.type),
        description: this.blankToUndefined(info.description),
      },
      visibility: info.visibility ?? 'private',
      commands,
    };
  }

  /**
   * 详情页即时保存：任一内容变更（对话框确认 / 删除确认 / 拖拽重排）即把当前整体 PUT 落库（不含 lifecycle）。
   * 并发保护：上一笔仍在落库时新产生的变更记入队列，等它完成后用最新状态再刷一笔，避免丢改。
   * 成功以「服务端已接受当前内容」为基准重置脏标记；失败回读服务端权威内容，撤销本地乐观改动。
   */
  private persistDetail(): void {
    if (this.kind !== 'detail' || !this.routeId) {
      return; // 新建页仍由顶部「保存」统一 create
    }
    if (this.submitting()) {
      this.persistQueued = true;
      return;
    }
    this.doPersist();
  }

  private doPersist(): void {
    this.submitting.set(true);
    this.service.update(this.routeId, this.buildBody()).subscribe({
      next: () => {
        this.submitting.set(false);
        const queued = this.persistQueued;
        this.persistQueued = false;
        // 与服务端一致：以当前本地内容为基准重置「相对初始值」快照（详情页不再有整页保存态）
        this.baseDeviceInfo = this.deviceInfo();
        this.baseCommands = this.commands().map((c) => ({ ...c }));
        this.msg.success(this.translate.instant('保存成功'));
        if (queued) {
          this.doPersist(); // 期间又有新变更：用最新状态再落一笔
        }
      },
      error: (error) => {
        this.persistQueued = false;
        this.submitting.set(false);
        this.msg.warning((error as { message?: string })?.message ?? error);
        this.loadConfig(); // 与后端不一致，回读服务端权威内容
      },
    });
  }

  /* ----------------------------------------------------------------------------------------------
   * 生命周期流转（详情页 header 的 预览 / 发布 / 下线）
   * ----------------------------------------------------------------------------------------------*/
  protected preview(): void {
    this.changeLifecycle(LifeCycle.PREVIEW);
  }

  protected release(): void {
    this.changeLifecycle(LifeCycle.RELEASED);
  }

  protected offline(): void {
    this.changeLifecycle(LifeCycle.DEVELOPMENT);
  }

  /** 调专用 lifecycle 接口并刷新：development→preview(预览)、preview→released(发布)、…→development(下线)。 */
  private changeLifecycle(next: string): void {
    if (this.kind !== 'detail' || !this.routeId || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.service.setLifecycle(this.routeId, next).subscribe({
      next: (updated) => {
        this.submitting.set(false);
        if (updated) {
          this.applyConfig(updated); // 以服务端回执刷新 lifecycle 标签 / 按钮态，并重置变更基准
        }
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
    normValue(info.slaveId),
    normValue(info.type),
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
    (command.fieldNames ?? []).map((x) => normValue(x)),
    (command.bitNames ?? []).map((x) => [normValue(x.offset), normValue(x.name)]),
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
