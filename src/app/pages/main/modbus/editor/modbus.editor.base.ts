import { computed, effect, inject, signal, ViewContainerRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { TranslateService } from '@ngx-translate/core';
import { AccountService } from '../../../../service/account.service';
import { ModbusService } from '../../../../service/modbus.service';
import { ModbusCommand, ModbusDeviceConfig, ModbusDeviceInfo } from '../../../../typedef/define/modbus/Modbus';
import { CommandEditComponent } from '../command/command.edit.component';
import { ModbusDeviceInfoEditComponent } from '../device-info/modbus.device.info.edit.component';
import { coilStateText, fcLabelKey, logicalAddressOf } from '../command/point.options';

/**
 * 新建设备点表 / 编辑设备点表 两个页面共用的编辑器逻辑与视图状态。
 * 页面文案、路由行为等差异由子类以 {@link kind} 区分：
 * - ModbusAddComponent（新建）：空表单起步，submit 走 create；
 * - ModbusDetailComponent（编辑）：按路由 id 载入既有点表，submit 走 update。
 *
 * 保存有效性：修改了设备信息、或增删改功能码动作后，保存按钮才可点击（changed）。
 */
export abstract class ModbusEditorBase {
  /** add：新建设备点表；detail：编辑设备点表 */
  protected abstract get kind(): 'add' | 'detail';

  /** 功能码枚举 → 展示用 i18n key / 逻辑地址换算 / 线圈状态文案（模板经 translate 管道渲染） */
  protected readonly fcLabelKey = fcLabelKey;
  protected readonly logicalAddressOf = logicalAddressOf;
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

  /** 修改判定基准：进入页面 / 载入既有点表时的快照 */
  protected baseDeviceInfo: ModbusDeviceInfo = emptyDeviceInfo();
  protected baseCommands: ModbusCommand[] = [];

  protected location = inject(Location);
  protected account = inject(AccountService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private service = inject(ModbusService);
  private msg = inject(NzMessageService);
  private translate = inject(TranslateService);
  private modal = inject(NzModalService);
  private viewContainerRef = inject(ViewContainerRef);

  private routeId = '';
  private currentOrgId = '';
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
  }

  /** 仅在「编辑设备点表」且组织、路由 id 就绪时载入（防重复请求） */
  private maybeLoadDetail(): void {
    if (this.kind !== 'detail') {
      return;
    }
    if (!this.routeId || !this.currentOrgId) {
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
    this.deviceInfo.set({
      manufacturer: config.manufacturer ?? '',
      model: config.model ?? '',
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
      ModbusDeviceInfo,
      ModbusDeviceInfo
    >({
      nzTitle: this.translate.instant('编辑设备信息'),
      nzContent: ModbusDeviceInfoEditComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: this.deviceInfo(),
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
    const modal = this.modal.create<CommandEditComponent, ModbusCommand, ModbusCommand>({
      nzTitle: this.translate.instant('编辑功能码'),
      nzContent: CommandEditComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: command,
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

  protected removeCommand(index: number): void {
    this.commands.update((list) => list.filter((_, i) => i !== index));
  }

  protected moveCommand(index: number, delta: number): void {
    this.commands.update((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) {
        return list;
      }
      const copy = [...list];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
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
