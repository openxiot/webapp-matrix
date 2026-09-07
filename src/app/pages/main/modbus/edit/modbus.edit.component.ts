import { Component, effect, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Location } from '@angular/common';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AccountService } from '../../../../service/account.service';
import { ModbusService } from '../../../../service/modbus.service';
import { ModbusDeviceConfig, ModbusPoint } from '../../../../typedef/define/modbus/Modbus';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { NzBreadCrumbComponent } from 'ng-zorro-antd/breadcrumb';
import { NzSpaceModule } from 'ng-zorro-antd/space';

interface AreaOption { value: string; label: string; }
interface RwOption { value: string; label: string; }
interface DataTypeOption { value: string; label: string; }

/** label 为中文短语 key，模板中经 translate 管道渲染 */
const AREA_OPTIONS: AreaOption[] = [
  { value: 'input', label: '输入寄存器' },
  { value: 'holding', label: '保持寄存器' },
  { value: 'coil', label: '线圈' },
];

const RW_OPTIONS: RwOption[] = [
  { value: 'r', label: '只读(r)' },
  { value: 'w', label: '只写(w)' },
  { value: 'rw', label: '读写(rw)' },
];

const DATA_TYPE_OPTIONS: DataTypeOption[] = [
  { value: 'int16', label: 'int16' },
  { value: 'uint16', label: 'uint16' },
  { value: 'int32', label: 'int32' },
  { value: 'uint32', label: 'uint32' },
  { value: 'float32', label: 'float32' },
  { value: 'string', label: 'string' },
];

@Component({
  selector: 'main-modbus-edit',
  standalone: true,
  templateUrl: './modbus.edit.component.html',
  styleUrl: './modbus.edit.component.less',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    NzPageHeaderModule,
    NzSpinModule,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzInputNumberModule,
    NzSelectModule,
    NzRadioModule,
    NzButtonModule,
    NzTableModule,
    NzIconModule,
    NzGridModule,
    NzDividerModule,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    NzBreadCrumbComponent,
    NzSpaceModule,
  ],
})
export class ModbusEditComponent {
  protected readonly areaOptions = AREA_OPTIONS;
  protected readonly rwOptions = RW_OPTIONS;
  protected readonly dataTypeOptions = DATA_TYPE_OPTIONS;

  loading = signal(false);
  submitting = signal(false);
  isEdit = signal(false);

  form: FormGroup;

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
  ) {
    this.form = new FormGroup({
      manufacturer: new FormControl<string>('', [Validators.required]),
      model: new FormControl<string>('', [Validators.required]),
      slaveId: new FormControl<number | null>(null, [Validators.required]),
      visibility: new FormControl<'private' | 'public'>('private', [Validators.required]),
      description: new FormControl<string>(''),
    });

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
    this.form.patchValue({
      manufacturer: config.manufacturer ?? '',
      model: config.model ?? '',
      slaveId: config.slaveId ?? null,
      visibility: config.visibility ?? 'private',
      description: config.description ?? '',
    });
    this.points.set((config.points ?? []).map((p) => ({ ...p })));
  }

  /* ----------------------------------------------------------------------------------------------
   * 点位编辑器
   * ----------------------------------------------------------------------------------------------*/
  protected addPoint(): void {
    const point: ModbusPoint = {
      name: '',
      area: 'holding',
      dataType: 'int16',
      rw: 'rw',
    };
    this.points.update((list) => [...list, point]);
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

  /** 行内编辑后整体替换 signal，保证 zoneless 下表重新渲染 */
  private touchPoints(): void {
    this.points.set([...this.points()]);
  }

  protected onName(p: ModbusPoint, v: string): void {
    p.name = v;
    this.touchPoints();
  }

  protected onArea(p: ModbusPoint, v: string): void {
    p.area = v || undefined;
    this.touchPoints();
  }

  protected onAddress(p: ModbusPoint, v: number | null): void {
    p.address = v ?? undefined;
    this.touchPoints();
  }

  protected onLogicalAddress(p: ModbusPoint, v: number | null): void {
    p.logicalAddress = v ?? undefined;
    this.touchPoints();
  }

  protected onDataType(p: ModbusPoint, v: string): void {
    p.dataType = v;
    this.touchPoints();
  }

  protected onRw(p: ModbusPoint, v: string): void {
    p.rw = v || undefined;
    this.touchPoints();
  }

  protected onScale(p: ModbusPoint, v: number | null): void {
    p.scale = v ?? undefined;
    this.touchPoints();
  }

  protected onUnit(p: ModbusPoint, v: string): void {
    p.unit = v || undefined;
    this.touchPoints();
  }

  protected onDescription(p: ModbusPoint, v: string): void {
    p.description = v || undefined;
    this.touchPoints();
  }

  /* ----------------------------------------------------------------------------------------------
   * 提交
   * ----------------------------------------------------------------------------------------------*/
  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.msg.warning(this.translate.instant('请填写厂家与型号'));
      return;
    }
    if (!this.currentOrgId) {
      this.msg.warning(this.translate.instant('请先选择组织'));
      return;
    }

    const fv = this.form.getRawValue();

    const points: ModbusPoint[] = this.points()
      .filter((p) => p.name.trim().length > 0)
      .map((p) => ({ ...p }));

    const body: ModbusDeviceConfig = {
      orgId: this.currentOrgId,
      manufacturer: (fv.manufacturer ?? '').trim(),
      model: (fv.model ?? '').trim(),
      slaveId: fv.slaveId ?? undefined,
      visibility: fv.visibility ?? 'private',
      description: this.blankToUndefined(fv.description),
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
