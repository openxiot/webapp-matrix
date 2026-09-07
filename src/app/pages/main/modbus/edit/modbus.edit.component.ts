import { Component, effect, signal, ViewContainerRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AccountService } from '../../../../service/account.service';
import { ModbusService } from '../../../../service/modbus.service';
import {
  ModbusDeviceConfig,
  ModbusDeviceInfo,
  ModbusPoint,
} from '../../../../typedef/define/modbus/Modbus';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { NzBreadCrumbComponent } from 'ng-zorro-antd/breadcrumb';
import { PointAddComponent } from '../point/point.add.component';
import { PointEditComponent } from '../point/point.edit.component';
import { areaLabelKey, rwLabelKey } from '../point/point.options';
import { ModbusDeviceInfoEditComponent } from '../device-info/modbus.device.info.edit.component';
import { NzColDirective, NzRowDirective } from 'ng-zorro-antd/grid';

@Component({
  selector: 'main-modbus-edit',
  standalone: true,
  templateUrl: './modbus.edit.component.html',
  styleUrl: './modbus.edit.component.less',
  imports: [
    NzPageHeaderModule,
    NzSpinModule,
    NzCardModule,
    NzButtonModule,
    NzTableModule,
    NzDescriptionsModule,
    NzIconModule,
    NzDividerModule,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    NzBreadCrumbComponent,
    NzRowDirective,
    NzColDirective,
  ],
  providers: [NzModalService],
})
export class ModbusEditComponent {
  /** 点位枚举值 → 展示用 i18n key（模板经 translate 管道渲染） */
  protected readonly areaLabelKey = areaLabelKey;
  protected readonly rwLabelKey = rwLabelKey;

  loading = signal(false);
  submitting = signal(false);
  isEdit = signal(false);

  /** 设备信息：默认私有、空值，进入页后只读，经对话框编辑 */
  deviceInfo = signal<ModbusDeviceInfo>(emptyDeviceInfo());

  points = signal<ModbusPoint[]>([]);

  private routeId = '';
  private currentOrgId = '';

  constructor(
    protected location: Location,
    private router: Router,
    private route: ActivatedRoute,
    private account: AccountService,
    private service: ModbusService,
    private msg: NzMessageService,
    private translate: TranslateService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
  ) {
    effect(() => {
      const orgId = this.account.organization().id;
      if (orgId && orgId !== this.currentOrgId) {
        this.currentOrgId = orgId;
        this.reloadIfEdit();
      }
    });

    this.route.params.subscribe((params) => {
      const id = params['id'] || '';
      this.routeId = id;
      this.isEdit.set(id.length > 0);
      this.reloadIfEdit();
    });
  }

  private reloadIfEdit(): void {
    if (this.isEdit() && this.routeId && this.currentOrgId) {
      this.loadConfig();
    }
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
    this.points.set((config.points ?? []).map((p) => ({ ...p })));
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
   * 点位编辑器：通过对话框添加/编辑（对齐组织成员 MemberAdd/MemberEdit 模式）
   * ----------------------------------------------------------------------------------------------*/
  protected addPoint(): void {
    const modal = this.modal.create<PointAddComponent, void, ModbusPoint>({
      nzTitle: this.translate.instant('添加点位'),
      nzContent: PointAddComponent,
      nzViewContainerRef: this.viewContainerRef,
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
        this.points.update((list) => [...list, result]);
      }
    });
  }

  protected editPoint(index: number): void {
    const point = this.points()[index];
    if (!point) {
      return;
    }
    const modal = this.modal.create<PointEditComponent, ModbusPoint, ModbusPoint>({
      nzTitle: this.translate.instant('编辑点位'),
      nzContent: PointEditComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: point,
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
        this.points.update((list) => list.map((p, i) => (i === index ? result : p)));
      }
    });
  }

  protected removePoint(index: number): void {
    this.points.update((list) => list.filter((_, i) => i !== index));
  }

  protected movePoint(index: number, delta: number): void {
    this.points.update((list) => {
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
   * 提交
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

    const points: ModbusPoint[] = this.points()
      .filter((p) => p.name.trim().length > 0)
      .map((p) => ({ ...p }));

    const body: ModbusDeviceConfig = {
      orgId: this.currentOrgId,
      manufacturer: info.manufacturer.trim(),
      model: info.model.trim(),
      slaveId: info.slaveId,
      visibility: info.visibility ?? 'private',
      description: this.blankToUndefined(info.description),
      points,
    };

    this.submitting.set(true);
    const request = this.isEdit()
      ? this.service.update(this.routeId, body)
      : this.service.create(body);
    request.subscribe({
      next: () => {
        this.submitting.set(false);
        this.msg.success(this.translate.instant(this.isEdit() ? '保存成功' : '创建成功'));
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
