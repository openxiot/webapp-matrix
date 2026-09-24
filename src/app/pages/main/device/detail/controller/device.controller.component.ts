import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Action,
  ActionOperation,
  ArgumentOperation,
  DataFormat,
  DeviceInstance,
  PropertyOperation,
  Service,
} from '@openxiot/xiot-core-spec-ts';
import { TranslatePipe } from '@ngx-translate/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NZ_MODAL_DATA, NzModalRef, NzModalService } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { AccountService } from '@app/service/account.service';
import { MatrixService } from '@app/service/matrix.service';
import { ProductService } from '@app/service/product.service';
import { MainI18nService } from '@app/service/i18n.service';

/**
 * 通用设备控制组件：用代码读产品功能定义（DeviceInstance）+ 实时读写设备属性/执行方法，
 * 渲染出与单机生成向导（device-control-page 模板）一致的卡片式控制界面——不再内嵌静态 HTML。
 *
 * 契约：@Input did + type（设备 URN）。组件自己调 product.getProductInstance 拿定义，
 * 自己按 guide §5.2 的控制映射规则把服务/属性/方法拍平成视图模型（ServiceVM / PropVM / ActionVM），
 * 再按 tablet 版卡片布局渲染：一个服务一张卡（属性行 + 方法行），瀑布式排列。
 *
 * 控制映射（仅可写属性给控件，不可写一律只读文本）：
 *   bool → 开关；枚举 >2 → 下拉；枚举 ≤2 → 分段按钮；区间 → −/+ 步进；number → 数字输入；
 *   string/hex → 文本输入。方法行整行可点（带波纹）＝执行，需参数时弹窗填参。
 *
 * 实时状态：进入读一次可读属性 + 手动「读取」全量刷新，不做自动轮询。
 * 文案口径：设备/服务/属性/方法/枚举标签皆为服务端数据，原样显示、不翻译（AGENTS.md）。
 */

/** 可写属性控件形态 */
type ControlKind = 'switch' | 'seg' | 'sel' | 'step' | 'number' | 'text' | 'hex';

interface EnumVM {
  value: any;
  label: string;
}

interface RangeVM {
  min: number;
  max: number;
  step: number;
}

interface PropVM {
  siid: number;
  iid: number;
  /** 状态键 `${siid}.${iid}` */
  key: string;
  name: string;
  format: DataFormat;
  writable: boolean;
  readable: boolean;
  /** 信息卡「点亮设备」属性 */
  identify: boolean;
  unit: string | null;
  list: EnumVM[] | null;
  range: RangeVM | null;
  /** 可写时控件形态；null = 只读展示 */
  kind: ControlKind | null;
}

interface ArgVM {
  piid: number;
  name: string;
  format: DataFormat;
  list: EnumVM[] | null;
}

interface ActionVM {
  siid: number;
  iid: number;
  /** 状态键 `${siid}.${iid}` */
  key: string;
  name: string;
  args: ArgVM[];
}

interface ServiceVM {
  iid: number;
  name: string;
  isInfo: boolean;
  /** 信息卡英文副标题（Device / Accessory Information） */
  en: string;
  props: PropVM[];
  actions: ActionVM[];
}

interface RippleState {
  key: string;
  x: number;
  y: number;
  size: number;
}

/** 方法参数弹窗数据。 */
interface ArgModalData {
  args: ArgVM[];
}

/** 方法参数弹窗：收集每个入参的取值，OK 时按 args 顺序返回归一化后的值数组。 */
interface ArgModalComponent {
  cancel(): void;
  ok(): void;
}

@Component({
  selector: 'device-controller',
  standalone: true,
  templateUrl: './device.controller.component.html',
  styleUrl: './device.controller.component.less',
  imports: [TranslatePipe],
  host: { class: 'device-controller' },
})
export class DeviceControllerComponent {
  /** 设备 did */
  readonly did = input('');
  /** 设备类型 URN（deviceType） */
  readonly type = input('');

  private readonly product = inject(ProductService);
  private readonly matrix = inject(MatrixService);
  private readonly account = inject(AccountService);
  private readonly i18n = inject(MainI18nService);
  private readonly msg = inject(NzMessageService);
  private readonly modal = inject(NzModalService);

  /** 功能定义（DeviceInstance） */
  readonly instance = signal<DeviceInstance | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');

  /** 实时属性值：key=`${siid}.${iid}` → value */
  readonly state = signal<Record<string, any>>({});
  /** 方法行波纹（单次） */
  readonly ripple = signal<RippleState | null>(null);
  readonly refreshing = signal(false);

  /** 拍平后的视图模型 */
  readonly services = signal<ServiceVM[]>([]);

  /** 设备名（实例描述，留有展示位） */
  readonly deviceName = computed(() => this.labelOf(this.instance()?.description));

  /** 本次已加载的 did|type，避免重复加载 */
  private loadedKey = '';

  constructor() {
    effect(() => {
      const did = this.did();
      const type = this.type();
      if (!did || !type) {
        return;
      }
      const key = did + '|' + type;
      if (key === this.loadedKey) {
        return;
      }
      this.loadedKey = key;
      this.load();
    });
  }

  // ===================== 加载与拍平 =====================

  private load(): void {
    const type = this.type();
    this.loading.set(true);
    this.loadError.set('');
    this.instance.set(null);
    this.state.set({});
    this.ripple.set(null);
    this.services.set([]);

    this.product.getProductInstance(type).subscribe({
      next: (inst) => {
        this.instance.set(inst);
        this.build(inst);
        this.loading.set(false);
        this.initialRead();
      },
      error: (e) => {
        this.loading.set(false);
        this.loadError.set(this.errText(e));
      },
    });
  }

  /** 把 DeviceInstance 拍平成可渲染的 ServiceVM 列表。 */
  private build(inst: DeviceInstance): void {
    const svcs: ServiceVM[] = [];
    for (const service of inst.services.values()) {
      svcs.push(this.buildService(service));
    }
    this.services.set(svcs);
  }

  private buildService(s: Service): ServiceVM {
    const name = this.labelOf(s.description) || '服务 ' + s.iid;
    const typeName = s.type?.name ?? '';
    const isInfo = /(accessory|device)-information/.test(typeName);
    const en = /(^|-)device-information$/.test(typeName)
      ? 'Device Information'
      : 'Accessory Information';

    const props: PropVM[] = [];
    for (const p of s.properties.values()) {
      const identify = p.type?.name === 'identify';
      const vm = this.buildProp(s.iid, p, identify);
      if (!vm) {
        continue; // 仅作方法入参的属性（不可读不可写不可通知）不占行
      }
      // 可写属性给默认值，让控件有可提交的初始状态（不自动写出）
      if (vm.writable && this.state()[vm.key] === undefined) {
        this.state()[vm.key] = this.defaultValue(vm);
      }
      props.push(vm);
    }

    const actions: ActionVM[] = [];
    for (const a of s.actions.values()) {
      actions.push(this.buildAction(s, a));
    }

    return { iid: s.iid, name, isInfo, en, props, actions };
  }

  private buildProp(
    siid: number,
    p: {
      iid: number;
      type: { name: string } | null;
      description: Map<string, string>;
      format: DataFormat;
      access: { isReadable: boolean; isWritable: boolean; isNotifiable: boolean };
      unit: string | null;
      valueList(): { values: { value: { rawValue(): unknown }; description: Map<string, string> }[] } | null;
      valueRange(): { minValue: { rawValue(): unknown } | null; maxValue: { rawValue(): unknown } | null; stepValue: { rawValue(): unknown } | null } | null;
      formatBoolean(): boolean;
    },
    identify: boolean,
  ): PropVM | null {
    const acc = p.access;
    const writable = acc.isWritable;
    const readable = acc.isReadable || acc.isNotifiable;
    if (!writable && !readable) {
      return null; // 参数专用属性
    }

    const list = p.valueList();
    const range = p.valueRange();
    const listArr = list?.values?.length
      ? list.values.map((d) => ({
          value: d.value.rawValue(),
          label: this.labelOf(d.description) || String(d.value.rawValue()),
        }))
      : null;
    const rangeVal = range
      ? {
          min: Number(range.minValue?.rawValue()),
          max: Number(range.maxValue?.rawValue()),
          step: range.stepValue ? Number(range.stepValue.rawValue()) : 1,
        }
      : null;

    let kind: ControlKind | null = null;
    if (writable) {
      if (p.formatBoolean()) {
        kind = 'switch';
      } else if (listArr?.length) {
        kind = listArr.length > 2 ? 'sel' : 'seg';
      } else if (rangeVal) {
        kind = 'step';
      } else if (p.format === DataFormat.HEX) {
        kind = 'hex';
      } else if (p.format === DataFormat.STRING) {
        kind = 'text';
      } else {
        kind = 'number';
      }
    }

    return {
      siid,
      iid: p.iid,
      key: siid + '.' + p.iid,
      name: this.labelOf(p.description) || '属性 ' + p.iid,
      format: p.format,
      writable,
      readable,
      identify,
      unit: p.unit,
      list: listArr,
      range: rangeVal,
      kind,
    };
  }

  private buildAction(s: Service, a: Action): ActionVM {
    const name = this.labelOf(a.description) || '方法 ' + a.iid;
    const args: ArgVM[] = [];
    for (const arg of a.in.values()) {
      const prop = s.properties.get(arg.piid);
      const list = prop?.valueList();
      args.push({
        piid: arg.piid,
        name: this.labelOf(prop?.description) || '参数 ' + arg.piid,
        format: prop?.format ?? DataFormat.STRING,
        list: list?.values?.length
          ? list.values.map((d) => ({
              value: d.value.rawValue(),
              label: this.labelOf(d.description) || String(d.value.rawValue()),
            }))
          : null,
      });
    }
    return { siid: s.iid, iid: a.iid, key: s.iid + '.' + a.iid, name, args };
  }

  // ===================== 状态与格式化 =====================

  private labelOf(d: Map<string, string> | undefined): string {
    if (!d) {
      return '';
    }
    const lang = this.i18n.getCurrentLang();
    return d.get(lang) || d.get('zh-CN') || d.get('en-US') || '';
  }

  private defaultValue(p: PropVM): any {
    if (p.format === DataFormat.BOOL) {
      return false;
    }
    if (p.list?.length) {
      return p.list[0].value;
    }
    if (p.range) {
      return p.range.min;
    }
    if (p.format === DataFormat.STRING || p.format === DataFormat.HEX) {
      return '';
    }
    return 0;
  }

  private current(p: PropVM): any {
    const v = this.state()[p.key];
    return v === undefined || v === null ? null : v;
  }

  /** 模板内不能用全局 String，提供等价等价字符串化。 */
  toStr(v: unknown): string {
    return String(v);
  }

  unitText(p: PropVM): string {
    const u = p.unit;
    if (!u) {
      return '';
    }
    if (u === 'celsius') {
      return ' °C';
    }
    if (u === 'kelvin') {
      return ' K';
    }
    if (u === 'percentage' || u === 'percent') {
      return '%';
    }
    return ' ' + u;
  }

  private fmt(v: any, p: PropVM): string {
    if (typeof v !== 'number') {
      return String(v);
    }
    const step = p.range?.step ?? 0;
    if (p.format === DataFormat.FLOAT && step > 0 && step < 1) {
      return String(Math.round(v * 10) / 10);
    }
    return String(v);
  }

  /** 只读展示值（bool→开/关，枚举→标签，数值→格式化+单位） */
  display(p: PropVM): string {
    const v = this.current(p);
    if (v === null) {
      return '—';
    }
    if (p.format === DataFormat.BOOL) {
      return v ? '开' : '关';
    }
    if (p.list?.length) {
      return this.listLabel(p);
    }
    return this.fmt(v, p) + this.unitText(p);
  }

  /** 枚举标签 */
  listLabel(p: PropVM): string {
    const v = this.current(p);
    if (v === null) {
      return '—';
    }
    const hit = p.list?.find((o) => String(o.value) === String(v));
    return hit ? hit.label : String(v);
  }

  patchState(key: string, value: any): void {
    this.state.update((s) => ({ ...s, [key]: value }));
  }

  // ===================== 读写与执行 =====================

  private newPropOp(p: PropVM): PropertyOperation {
    const op = new PropertyOperation();
    op.pid.did = this.did();
    op.pid.siid = p.siid;
    op.pid.iid = p.iid;
    return op;
  }

  /** 写一个属性（本地先改状态，服务端按 op.status 反馈）。 */
  write(p: PropVM, value: any): void {
    this.patchState(p.key, value);
    const op = this.newPropOp(p);
    op.value = value;
    this.matrix.setDeviceProperty(this.account.space().id, op).subscribe({
      next: (r) => this.feedback(r.status, p.name),
      error: (e) => this.msg.error(this.errText(e)),
    });
  }

  // ---- 模板事件处理器 ----

  /** 开关切换。 */
  onSwitch(p: PropVM, ev?: Event): void {
    ev?.stopPropagation();
    this.write(p, !this.state()[p.key]);
  }

  /** 分段按钮选择（枚举 ≤2）。 */
  onSeg(p: PropVM, value: any): void {
    this.write(p, value);
  }

  /** 下拉选择（枚举 >2）：按选项原类型回写。 */
  onSel(p: PropVM, ev: Event): void {
    const cur = (ev.target as HTMLSelectElement).value;
    const hit = p.list?.find((o) => String(o.value) === cur);
    if (hit) {
      this.write(p, hit.value);
      return;
    }
    if (cur === '') {
      return;
    }
    this.write(p, /^-?\d+(\.\d+)?$/.test(cur) ? Number(cur) : cur);
  }

  /** 区间步进 −/+。 */
  onStep(p: PropVM, delta: number): void {
    const range = p.range;
    if (!range) {
      return;
    }
    let n = this.state()[p.key] === undefined || this.state()[p.key] === null
      ? range.min
      : Number(this.state()[p.key]);
    n = Math.round((n + delta * range.step) * 1000) / 1000;
    n = Math.max(range.min, Math.min(range.max, n));
    this.write(p, n);
  }

  /** 数字输入失焦提交。 */
  onNumber(p: PropVM, ev: Event): void {
    const n = Number((ev.target as HTMLInputElement).value);
    if (!isNaN(n)) {
      this.write(p, n);
    }
  }

  /** 文本 / HEX 输入失焦提交。 */
  onText(p: PropVM, ev: Event): void {
    this.write(p, (ev.target as HTMLInputElement).value);
  }

  /** 单属性读取（读按钮）。 */
  read(p: PropVM): void {
    const op = this.newPropOp(p);
    this.matrix.getDeviceProperty(this.account.space().id, op).subscribe({
      next: (r) => {
        if (r.status === 0 && 'value' in r) {
          this.patchState(p.key, r.value);
          this.msg.success(p.name + ' 已读取');
        } else {
          this.feedback(r.status, p.name);
        }
      },
      error: (e) => this.msg.error(this.errText(e)),
    });
  }

  /** 全量刷新：所有可读属性一次读回（手动刷新按钮）。 */
  refresh(): void {
    if (this.refreshing()) {
      return;
    }
    this.refreshing.set(true);
    this.readAll();
  }

  /** 进入时的初次读取（不打 spinner）。 */
  private initialRead(): void {
    this.readAll();
  }

  /** 批量读回所有可读属性，按返回 pid 反解回状态键。 */
  private readAll(): void {
    const ops: PropertyOperation[] = [];
    for (const s of this.services()) {
      for (const p of s.props) {
        if (p.readable) {
          ops.push(this.newPropOp(p));
        }
      }
    }
    if (!ops.length) {
      this.refreshing.set(false);
      return;
    }
    this.matrix.getDeviceProperties(this.account.space().id, ops).subscribe({
      next: (results) => {
        for (const r of results) {
          if (r.status === 0 && 'value' in r) {
            this.patchState(r.pid.siid + '.' + r.pid.iid, r.value);
          }
        }
        this.refreshing.set(false);
      },
      error: (e) => {
        this.refreshing.set(false);
        this.msg.error(this.errText(e));
      },
    });
  }

  /** 方法整行点击（带波纹）＝执行。 */
  fire(ev: Event, el: HTMLElement, svc: ServiceVM, a: ActionVM): void {
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.2;
    const cx = ev instanceof MouseEvent ? ev.clientX : rect.left + rect.width / 2;
    const cy = ev instanceof MouseEvent ? ev.clientY : rect.top + rect.height / 2;
    this.ripple.set({
      key: a.key,
      x: cx - rect.left - size / 2,
      y: cy - rect.top - size / 2,
      size,
    });
    setTimeout(() => this.ripple.set(null), 560);
    this.argInvoke(svc, a);
  }

  private argInvoke(svc: ServiceVM, a: ActionVM): void {
    if (!a.args.length) {
      this.invoke(svc, a, []);
      return;
    }
    this.modal
      .create<DeviceControllerArgModalComponent, ArgModalData, any[]>({
        nzTitle: a.name,
        nzContent: DeviceControllerArgModalComponent,
        nzData: { args: a.args },
        nzFooter: [
          {
            label: this.i18n.translate.instant('取消'),
            onClick: (c) => c?.cancel(),
          },
          {
            label: this.i18n.translate.instant('确认'),
            type: 'primary' as const,
            onClick: (c) => c?.ok(),
          },
        ],
      })
      .afterClose.subscribe((values) => {
        if (values) {
          this.invoke(svc, a, values);
        }
      });
  }

  invoke(svc: ServiceVM, a: ActionVM, values: any[]): void {
    const action = new ActionOperation();
    action.aid.did = this.did();
    action.aid.siid = a.siid;
    action.aid.iid = a.iid;
    const inMap = new Map<number, ArgumentOperation>();
    a.args.forEach((arg, i) => {
      if (values[i] !== undefined) {
        inMap.set(arg.piid, new ArgumentOperation(arg.piid, [values[i]]));
      }
    });
    action.in = inMap;

    this.matrix.invokeDeviceAction(this.account.space().id, action).subscribe({
      next: (r) => {
        if (r.status === 0 || r.status === 1) {
          this.msg.success(a.name + (r.status === 1 ? ' 已执行（等待设备确认）' : ' 已执行'));
          this.applyOut(svc, r.out);
        } else {
          this.feedback(r.status, a.name);
        }
      },
      error: (e) => this.msg.error(this.errText(e)),
    });
  }

  /** 方法返回的 out 值回写到对应属性状态。 */
  private applyOut(svc: ServiceVM, out: Map<number, any> | undefined): void {
    if (!out) {
      return;
    }
    for (const [piid, argOp] of out) {
      const prop = svc.props.find((x) => x.iid === piid);
      const vals = argOp?.values;
      if (prop && vals && vals.length) {
        this.patchState(prop.key, vals[0]);
      }
    }
  }

  /** 信息卡「点亮设备」。 */
  identify(p: PropVM): void {
    this.write(p, true);
  }

  // ===================== 状态反馈 =====================

  private feedback(status: number | null | undefined, name: string): void {
    if (status === 0) {
      this.msg.success(name + ' 已更新');
      return;
    }
    if (status === 1) {
      this.msg.info(name + ' 已下发，等待设备确认');
      return;
    }
    const map: Record<string, string> = {
      '-1': '不可读', '-2': '不可写', '-3': '不存在', '-4': '内部错误',
      '-5': '取值不合法', '-6': '参数不合法', '-7': '验证失败',
    };
    this.msg.warning(name + '：' + (map[String(status)] || '状态码 ' + status));
  }

  private errText(e: any): string {
    return e?.message ?? String(e);
  }
}

/** 方法参数弹窗（内联模板、standalone，挂在本文件里保持 3 文件）。 */
@Component({
  selector: 'device-controller-arg-modal',
  standalone: true,
  template: `
    @for (arg of args(); track arg.piid) {
      <div class="arg-field">
        <label class="arg-name">{{ arg.name }}</label>
        @if (arg.list?.length) {
          <nz-select [(ngModel)]="values()[arg.piid]" nzShowArrow style="width:100%">
            @for (o of arg.list; track $index) {
              <nz-option [nzValue]="o.value" [nzLabel]="o.label"></nz-option>
            }
          </nz-select>
        } @else {
          <input
            nz-input
            [type]="arg.format === DataFormat.STRING || arg.format === DataFormat.HEX ? 'text' : 'number'"
            [value]="values()[arg.piid] ?? ''"
            (input)="onInput(arg.piid, $event)" />
        }
      </div>
    }
  `,
  styles: [
    `
      :host { display: block; padding: 4px 0; }
      .arg-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
      .arg-name { font-size: 13px; color: #6b7280; }
    `,
  ],
  imports: [FormsModule, NzInputModule, NzSelectModule],
})
class DeviceControllerArgModalComponent implements ArgModalComponent {
  private readonly modal = inject(NzModalRef);
  private readonly data: ArgModalData = inject(NZ_MODAL_DATA);

  readonly args = signal(this.data.args);
  readonly DataFormat = DataFormat;
  readonly values = signal<Record<number, any>>({});

  cancel(): void {
    this.modal.destroy(undefined);
  }

  ok(): void {
    this.modal.destroy(this.args().map((a) => this.normalize(a, this.values()[a.piid])));
  }

  protected onInput(piid: number, ev: Event): void {
    this.values.update((m) => ({ ...m, [piid]: (ev.target as HTMLInputElement).value }));
  }

  private normalize(a: ArgVM, raw: any): any {
    const v = raw ?? '';
    if (a.format === DataFormat.STRING || a.format === DataFormat.HEX) {
      return v;
    }
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }
}