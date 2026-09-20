import { Component, computed, effect, inject, input, linkedSignal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { MainI18nService } from '@app/service/i18n.service';
import { DeviceDisplayService } from '@app/service/device.display.service';
import { DeviceSpecService, joinPid } from '@app/service/device.spec.service';
import { DeviceEntity } from '@app/typedef/define/device/DeviceEntity';
import { WebDashboardCatalog, catalogDevices } from '@app/typedef/define/dashboard/WebDashboardCatalog';
import {
  DASHBOARD_DIMENSIONS,
  DASHBOARD_METRICS,
  WebDashboardWidget,
  WIDGET_SIZES,
  WidgetSize,
  dashboardDimensionLabel,
  dashboardMetricLabel,
  sizeChoices,
  widthChoices,
} from '@app/typedef/define/dashboard/WebDashboardLayout';
import { cardHeight } from '../dashboard.grid';
import { absoluteWindow } from '../dashboard.folding';
import { readBoolean, readNumber, readString, readStringArray, readWindow } from '../dashboard.config';
import { ServiceFieldRef, serviceFieldsOf } from '../../device/services/service/service.fields';

/** 时间窗口的三种形态（前两种对应 `WindowConfig`，`none` 是「这张卡不看窗口」） */
type WindowKind = 'none' | 'last' | 'range';

/** 切到「绝对区间」而原来没有窗口时给的跨度，也是切回「相对时间」时的缺省 */
const DEFAULT_WINDOW_HOURS = 24;

/**
 * 一张卡片的配置表单（对话框内容）。
 *
 * 三条：
 * - **它不认识「保存」**：点「确定」只是把改好的卡片 `emit` 出去，落库是看板页的事 ——
 *   编辑态是**本地草稿**（§7.4），改十次不该写十次库，也不该在这里知道版本号冲突怎么处理。
 * - **改的是自己那份副本，不是传进来的对象**：改到一半点「取消」，草稿里那张卡必须原封不动。
 *   于是看板页可以放心地用「取消 = 把新建的这张撤掉」来表达「我不想加这张卡了」。
 * - **不确定的键一律不写进 `config`**：`window` 选「无」是 `delete` 而不是写 `null`，
 *   否则请求体里会多出一个 `"window": null`，而服务端对 `null` 的处理与「没有这个键」不一定同义。
 *
 * 曲线卡的数据源是**二选一**：告警条数（`alarmCount`）或服务字段（`serviceField`）。选后者时
 * 下面接一套与服务卡同形的三级级联 —— 只是字段那一级是**单选**（一条曲线画一个字段），
 * 而服务卡那边是多选。
 *
 * **候选清单由看板页取好传进来**（{@link catalog}），这里不发请求：清单是进编辑态时取一次的，
 * 而这个对话框会开开关关很多次；每次开都拉一遍，等于把「进编辑态取一次」做成「开一次拉一次」。
 * 取不到时看板页把服务端那句话传进 {@link catalogError}，这里原样显示。
 */
@Component({
  selector: 'dashboard-widget-editor',
  templateUrl: './widget.editor.html',
  styleUrl: './widget.editor.less',
  imports: [
    FormsModule,
    TranslatePipe,
    NzButtonModule,
    NzDatePickerModule,
    NzFormModule,
    NzInputModule,
    NzInputNumberModule,
    NzRadioModule,
    NzSelectModule,
    NzSwitchModule,
  ],
})
export class WidgetEditorComponent {
  /** 要编辑的那张卡。看板页每次打开对话框都给一个**新对象**，`linkedSignal` 才会重新起底 */
  readonly widget = input.required<WebDashboardWidget>();

  /** 候选设备与服务（看板页进编辑态时取的那一份）。**还没到 / 取失败**时是 null，级联就是空的 */
  readonly catalog = input<WebDashboardCatalog | null>(null);

  /** 候选清单取失败的原因（服务端那句话）。**原样显示、不翻译**（与其他接口的 message 同口径） */
  readonly catalogError = input('');

  /** 点「确定」：改好的卡片 */
  readonly committed = output<WebDashboardWidget>();
  /** 点「删除」：把这张卡从布局里拿掉。**只动草稿**，落库仍由看板页的「保存布局」决定 */
  readonly removed = output<void>();
  /** 点「取消」 */
  readonly cancelled = output<void>();

  private readonly i18n = inject(MainI18nService);

  private readonly display = inject(DeviceDisplayService);

  private readonly specs = inject(DeviceSpecService);

  /** 本地副本。跟着 {@link widget} 重置：对话框关掉再打开（换了一张卡）时要重新起底 */
  private readonly draft = linkedSignal<WebDashboardWidget>(() => copy(this.widget()));

  /** 翻译一个词条。这里都在 `computed` 里用，故读一次 `currentLang` 建立依赖（同 `widget.host.ts`） */
  private readonly t = (key: string): string => {
    this.i18n.currentLang();
    return this.i18n.translate.instant(key);
  };

  // ===== 与类型无关的两项 =====

  readonly title = computed(() => this.draft().title ?? '');

  readonly size = computed(() => this.draft().size);

  // ===== 按类型分叉的配置 =====

  readonly type = computed(() => this.draft().type);

  /**
   * 尺寸拆成**两个下拉**：宽度（列）与高度（像素）。
   *
   * 拆开的理由：档位现在是把两个维度自由组合的，而一个下拉里塞十档（`W6H92` … `W24H416`）
   * 是让人在一张十行的菜单里找那两个数。拆成两个之后，宽度只有 2–3 个选项、
   * 高度只有 1–3 个，用户先定形状再定大小。
   *
   * **高度选项跟着宽度联动**（`sizeChoices` 按宽度过滤）：6 宽两档（200 / 308），
   * 12 宽与 24 宽各三档。不列「存在的全部组合再禁用掉几个」—— 那样用户得先撞墙才知道不行。
   *
   * 两个下拉的显示文字**都是纯数字**（宽度是列数、高度是像素），只有数字与乘号，
   * **不引入任何要翻译的文案** —— 这个对话框的字段名「尺寸」是既有词条，
   * 新加的文案一条都没有。高度那串数走 `cardHeight`，与卡片实际高度同一份算式。
   *
   * **当前档位选不出来时把它补进选项**（下面两处三元）：库里可能存着一张
   * 「统计卡占了 4 行」这种按现在的规则选不出来的卡片（旧规则下存下的）。渲染侧一律按存的
   * 档位渲染、不悄悄改用户的布局，那么这里至少要让下拉显示得出当前值 ——
   * 显示空白的下拉会让人以为卡片没有尺寸，用户一保存还会莫名其妙地被改小。
   * 静默改尺寸比留一个旧档位更坏：用户没动过的卡片自己变了大小，是查不出原因的。
   */
  readonly width = computed(() => WIDGET_SIZES[this.size()]?.w ?? WIDGET_SIZES.W6H200.w);

  /** 宽度下拉的选项。当前宽度不在（存量卡片）时补在末尾，排序不讲究 —— 补进去的那个本来就是异类 */
  readonly widths = computed(() => {
    const allowed = widthChoices(this.type());
    const current = this.width();
    return allowed.includes(current) ? allowed : [...allowed, current];
  });

  /** 高度下拉的选项：当前档位 + 这个宽度下能选的（按高度从矮到高）。label 是像素数 */
  readonly heights = computed(() => {
    const current = this.size();
    const allowed = sizeChoices(this.type(), this.width());
    const list = allowed.includes(current) ? allowed : [current, ...allowed];
    return list.map((size) => ({ size, label: String(cardHeight(WIDGET_SIZES[size].h)) }));
  });

  private readonly config = computed(() => this.draft().config ?? {});

  /** 指标下拉。**表里每一项的显示名同时是词典键**，故整份预翻好，切语言时会重算 */
  readonly metricOptions = computed(() =>
    Object.keys(DASHBOARD_METRICS).map((value) => ({
      value,
      label: dashboardMetricLabel(value, this.t),
    })),
  );

  readonly dimensionOptions = computed(() =>
    Object.keys(DASHBOARD_DIMENSIONS).map((value) => ({
      value,
      label: dashboardDimensionLabel(value, this.t),
    })),
  );

  readonly metric = computed(() => readString(this.config(), 'metric') ?? '');
  readonly dimension = computed(() => readString(this.config(), 'dimension') ?? '');
  readonly maxPoints = computed(() => readNumber(this.config(), 'maxPoints') ?? null);
  readonly limit = computed(() => readNumber(this.config(), 'limit') ?? null);

  // ===== 服务卡的配置（三级级联：服务 → 方法 → 字段） =====

  readonly serviceId = computed(() => readString(this.config(), 'serviceId') ?? '');
  /** 方法序号。**从 1 起**，`0` 是「没选」的空位（与 `ModbusServiceFunction.index` 一致） */
  readonly functionIndex = computed(() => readNumber(this.config(), 'functionIndex') ?? 0);
  readonly fields = computed(() => readStringArray(this.config(), 'fields') ?? []);
  readonly showUnit = computed(() => readBoolean(this.config(), 'showUnit', true));

  /**
   * 这张表单要不要候选清单。**服务卡、设备卡，以及选了「服务字段」的曲线卡**都要。
   *
   * 曲线卡要看数据源：只有服务字段那一支才有三级级联。用途只有一个 —— 清单取失败时，
   * 别在一张「只有指标下拉」的表单上显示一句设备服务的报错。
   */
  readonly needsCatalog = computed(() => {
    const type = this.type();
    return type === 'service' || type === 'device' || (type === 'line' && this.lineSource() === 'serviceField');
  });

  // ===== 曲线卡的配置（数据源 + 服务字段那一支的三级级联） =====

  /** 数据源。缺省是告警条数：老配置里没有这个键，而那时的曲线卡就是它（同 `line.widget.ts`） */
  readonly lineSource = computed(() => readString(this.config(), 'source') ?? 'alarmCount');

  /**
   * 选中的字段（**一条曲线只画一个**，故这里与服务卡的 `fields` 是两个键）。
   *
   * 三级级联本身与下面那套共用：`serviceId` / `functionIndex` 两个键两边同名，
   * 候选也来自同一份清单与同一份展开实现 —— 服务卡那边怎么列，这里就怎么列。
   */
  readonly curveField = computed(() => readString(this.config(), 'field') ?? '');

  /** 显示采集失败竖线。缺省显示（那张图上少有的「什么时候出过问题」的线索） */
  readonly showFailureShadow = computed(() => readBoolean(this.config(), 'showFailureShadow', true));

  /**
   * 选中的字段画不出曲线（非数值：取值表命中的描述串、`format: 'string'`）。
   *
   * **只给一句提示，不从下拉里剔除** —— 与历史页同一口径：「这一轮读到的是哪个状态」也是
   * 曲线卡该说的事（那种曲线是一串断点，但断点本身说明了「这段读到了东西」）。
   * 选了字段却找不到它的候选（清单没到、配置是旧的）时不提示：那时无从判断。
   */
  readonly fieldIsNotNumeric = computed(() => {
    const option = this.fieldOptions().find((candidate) => candidate.value === this.curveField());
    return option ? !option.numeric : false;
  });

  // ===== 设备卡的配置（级联：设备 → 属性） =====

  readonly did = computed(() => readString(this.config(), 'did') ?? '');
  /**
   * 选中的属性（**完整的 pid**）。与 {@link did} 一起读写：下拉的值就是存进 `config` 的那个
   * pid，所以模板读的是同一个 `computed`，不另起一个「给模板看」的副本。
   */
  readonly pid = computed(() => readString(this.config(), 'pid') ?? '');

  /** 候选清单里的设备（转成 `DeviceEntity`：查名字那条链认的是它） */
  private readonly devices = computed<DeviceEntity[]>(() => catalogDevices(this.catalog()));

  /**
   * 设备下拉。标签是**这台设备的显示名**，走 `DeviceDisplayService` 那条四级回退
   * （产品名 → 实例描述 → DeviceType 的 type 段 → did）—— 与设备列表页是同一套名字，
   * 不另起一套。
   *
   * 名字是**异步到达**的（清单里只有 did / type，见 `WebDashboardCatalog`）：所以名字在这里是
   * 同步读信号，到了之后这个 `computed` 自己会重算。请求由下面的 `effect` 触发。
   */
  readonly deviceOptions = computed(() =>
    this.devices().map((device) => ({ value: device.did, label: this.display.name(device) })),
  );

  /** 选中的设备型号：属性候选要靠它去查产品规格 */
  private readonly selectedDeviceType = computed(() => {
    const did = this.did();
    return this.devices().find((device) => device.did === did)?.type ?? '';
  });

  /**
   * 属性候选。名字与单位从**产品规格**来（`DeviceSpecService`），规格没到之前是空清单
   * —— 下拉里没有选项比列出一批错的好。
   *
   * 值是**完整的 pid**（`<did>.<siid>.<piid>`）：卡片要的就是它，且与影子元素、写属性的
   * 请求同一个形状（见 `DeviceConfig`）。
   */
  readonly propertyOptions = computed(() => {
    const did = this.did();
    const type = this.selectedDeviceType();
    if (!did || !type) {
      return [];
    }
    return this.specs.propertiesOf(type).map((property) => ({
      value: joinPid(did, property.siid, property.piid),
      // 单位缀在候选上：同一个型号里「温度(℃)」与「温度(℉)」是两件事，只看名字分不出来
      label: property.unit ? `${property.name} (${property.unit})` : property.name,
    }));
  });

  /**
   * 选中的服务定义。**第二、三级都从它展开**，所以「清单还没到（null）」与「没选服务」在这里
   * 是同一件事：都展开不出东西，级联的下两级就是空的。
   */
  readonly selectedService = computed(() => {
    const serviceId = this.serviceId();
    if (!serviceId) {
      return undefined;
    }
    return (this.catalog()?.services ?? []).find((service) => service.id === serviceId);
  });

  /**
   * 服务下拉。标签是**用户填的服务名**，原样显示、不翻译；没有名字时退回 id
   * （显示一个空白的选项比显示 id 更让人无从选择）。
   */
  readonly serviceOptions = computed(() =>
    (this.catalog()?.services ?? [])
      .filter((service) => !!service.id)
      .map((service) => ({ value: service.id as string, label: service.name || (service.id as string) })),
  );

  /** 方法下拉（级联第二级）。没选服务时为空 —— 那一格此时也是禁用的 */
  readonly functionOptions = computed(() =>
    (this.selectedService()?.functions ?? []).map((func) => ({
      value: func.index,
      label: func.name || String(func.index),
    })),
  );

  /**
   * 字段候选（级联第三级）：父字段 + 位区**逐位展开**，与历史页是同一份实现
   * （{@link serviceFieldsOf}）—— 两处各写一套的代价是「历史页列得出、编辑器选不到」。
   *
   * 没选方法时给空清单：`fields` 是**方法的**应答字段，不选方法就无从列出，
   * 而把全部方法的字段混在一起（`functionIndex` 传 0 的那种用法）会让用户选到一个
   * 属于别的方法的名字 —— 后端只会在取数时回一个空数组。
   */
  readonly fieldOptions = computed<EditorFieldOption[]>(() => {
    const index = this.functionIndex();
    if (!index) {
      return [];
    }
    return serviceFieldsOf(this.selectedService()?.functions, index).map((ref) => ({
      ...ref,
      value: ref.field,
      // 单位缀在候选上：同一个方法里「温度(℃)」与「温度(℉)」是两件事，只看字段名分不出来
      label: ref.unit ? `${ref.field} (${ref.unit})` : ref.field,
    }));
  });

  // ===== 必填项 =====

  /**
   * 必填项填齐了没有。**没填齐就禁用「确认」** —— 否则用户能存下一张永远取不到数的卡，
   * 而那次失败要到下一个刷新周期才以「取数失败」的形式出现（服务端的英文原话），
   * 那时人早就不在这个对话框里了，也无从知道是哪一项没填。
   */
  readonly canCommit = computed(() => {
    const config = this.config();
    switch (this.type()) {
      case 'stat':
        return readString(config, 'metric') !== undefined;
      case 'distribution':
        return readString(config, 'dimension') !== undefined;
      case 'service':
        // 方法序号从 1 起，0 是空位，故这里按「大于 0」判而不是「不等于 undefined」
        return this.serviceId() !== '' && this.functionIndex() > 0 && this.fields().length > 0;
      case 'device':
        return this.did() !== '' && this.pid() !== '';
      case 'line':
        // 窗口是**两个数据源都要**的（`validateLine` 第一步就查它），所以「无」在这一档不算填齐
        // —— P1 里漏了这一条，新建一张曲线卡不动窗口直接确认，会被服务端以
        // `config.window is required` 打回来
        if (this.windowKind() === 'none') {
          return false;
        }
        // 告警条数那一支到这儿就够了（`bucket` 固定）；服务字段那一支还有三样，与
        // `validateLine` 的后半段一一对应 —— 少填一样服务端回的是英文原话，
        // 那时用户已经不在这个对话框里了
        return (
          this.lineSource() !== 'serviceField' ||
          (this.serviceId() !== '' && this.functionIndex() > 0 && this.curveField() !== '')
        );
      default:
        // 不认识的类型那一档不拦：那张表单里没有任何可填的东西，拦下来只会让人连
        // 「确认」都点不了
        return true;
    }
  });

  // ===== 时间窗口 =====

  /**
   * 这张表单要不要「时间窗口」。
   *
   * **服务卡不要**：它显示的是那个方法此刻的值 + 采集时刻（`recordedAt`），与窗口无关 ——
   * 后端取数时压根不读这个键（`validateService` 也不校验它），填了不报错、但一点效果都没有。
   * 摆一个改了没反应的控件比不摆更糟：用户会以为「我设的是最近 24 小时」。
   */
  readonly hasWindow = computed(() => {
    const type = this.type();
    return type === 'stat' || type === 'line' || type === 'distribution';
  });

  private readonly window = computed(() => readWindow(this.draft().config));

  readonly windowKind = computed<WindowKind>(() => this.window()?.kind ?? 'none');

  readonly windowHours = computed(() => {
    const window = this.window();
    return window?.kind === 'last' ? window.hours : DEFAULT_WINDOW_HOURS;
  });

  readonly range = computed<Date[] | null>(() => {
    const window = this.window();
    return window?.kind === 'range' ? [new Date(window.from), new Date(window.to)] : null;
  });

  // ===== 改动 =====

  setTitle(title: string): void {
    // 空串按「没填」处理：卡头标题的取值顺序是 title → titleKey → 默认名（`titleOf`），
    // 存一个空的 title 会让前两档都落空、又占着 `title` 那一档，语义上不干净
    this.patch({ title: title.trim() || undefined });
  }

  /** 高度下拉的选中值。值仍是一个**档位名** —— 名字里同时带着列数，所以改高度也会写回宽度 */
  setSize(size: WidgetSize): void {
    this.patch({ size });
  }

  /**
   * 换宽度：在**新宽度下能选的档位**里挑一个高度最接近当前的。
   *
   * 「最接近」而不是「保持行数」：档位不是笛卡尔积（6 宽没有 308 那一档），拿行数去配会在
   * 6 宽上撞空。挑最近的则任何一次换宽度都落在合法档位上，高度又不跳变 ——
   * 从 12×308 换到 6 宽，得到 6×200（而不是掉到 6×92 或干脆没得选）。
   *
   * 新宽度下**一个合法档位都没有**（下拉里补进来的那个异类宽度，比如存量统计卡的 24 列）：
   * 退回这一宽度下**存在**的档位里挑最矮的 —— 总之不能让下拉选出一个不存在的组合。
   */
  setWidth(w: number): void {
    if (w === this.width()) {
      return;
    }
    const current = WIDGET_SIZES[this.size()] ?? WIDGET_SIZES.W6H200;
    const allowed = sizeChoices(this.type(), w);
    const pool = allowed.length
      ? allowed
      : (Object.keys(WIDGET_SIZES) as WidgetSize[]).filter((size) => WIDGET_SIZES[size].w === w);
    if (!pool.length) {
      return;
    }
    const nearest = pool.reduce((best, size) =>
      Math.abs(WIDGET_SIZES[size].h - current.h) < Math.abs(WIDGET_SIZES[best].h - current.h)
        ? size
        : best,
    );
    this.patch({ size: nearest });
  }

  setMetric(metric: string): void {
    this.setConfig('metric', metric);
  }

  setDimension(dimension: string): void {
    this.setConfig('dimension', dimension);
  }

  setMaxPoints(maxPoints: number | null): void {
    this.setConfig('maxPoints', maxPoints ?? undefined);
  }

  setLimit(limit: number | null): void {
    this.setConfig('limit', limit ?? undefined);
  }

  /**
   * 换服务。**方法与字段一并清掉**：它们都是上一个服务的（方法序号、字段名），
   * 留着会存下一张「字段名属于另一个服务」的卡 —— 那种卡不报错，只是永远显示 `-`。
   *
   * 两个字段键一起清（服务卡的多选 `fields` 与曲线卡的单选 `field`）：级联是**共用的**
   * （两个键同名、候选同一份），另起一套只清其中一个的 setter，迟早会有一边漏掉。
   * 清掉另一个分支不认识的那个键没有代价 —— 它本来就不该在那张卡上。
   */
  setServiceId(serviceId: string): void {
    this.patchConfig({
      serviceId: serviceId || undefined,
      functionIndex: undefined,
      fields: undefined,
      field: undefined,
    });
  }

  /** 换方法。**字段一并清掉**，同一个道理：字段名是方法的应答字段，换了方法它就不成立了 */
  setFunctionIndex(functionIndex: number | null): void {
    this.patchConfig({
      functionIndex: functionIndex ?? undefined,
      fields: undefined,
      field: undefined,
    });
  }

  /**
   * 换曲线卡的数据源。**三元组不清**：它只对「服务字段」那一支有意义，换到别处留着不会生效，
   * 换回来时还能接着上次的选择 —— 与级联那两处不同（那里换掉的是**上游**，下游的键随之失效）。
   */
  setLineSource(source: string): void {
    this.setConfig('source', source || undefined);
  }

  setCurveField(field: string): void {
    this.setConfig('field', field || undefined);
  }

  setShowFailureShadow(showFailureShadow: boolean): void {
    this.setConfig('showFailureShadow', showFailureShadow);
  }

  /**
   * 换设备。**属性一并清掉**：pid 里编着 did，换了设备它就指向别的设备的属性了
   * —— 那种卡不报错，只是永远显示 `-`（`did` 与 `pid` 必须一起写，见 `DeviceConfig`）。
   */
  setDid(did: string): void {
    this.patchConfig({ did: did || undefined, pid: undefined });
  }

  setPid(pid: string): void {
    this.setConfig('pid', pid || undefined);
  }

  setFields(fields: string[]): void {
    // 全取消勾选 = 没配（与 `readStringArray` 判空数组同一口径），而不是存一个空数组
    this.setConfig('fields', fields.length > 0 ? fields : undefined);
  }

  setShowUnit(showUnit: boolean): void {
    this.setConfig('showUnit', showUnit);
  }

  setWindowKind(kind: WindowKind): void {
    if (kind === 'none') {
      this.setConfig('window', undefined);
      return;
    }
    if (kind === 'range') {
      // 从「最近 N 小时」切过来时按那个 N 算初值，免得他面对两个空输入框（见 `absoluteWindow`）
      const { from, to } = absoluteWindow(this.window(), Date.now());
      this.setConfig('window', { kind: 'range', from, to });
      return;
    }
    this.setConfig('window', { kind: 'last', hours: this.windowHours() });
  }

  setWindowHours(hours: number | null): void {
    this.setConfig('window', { kind: 'last', hours: hours ?? DEFAULT_WINDOW_HOURS });
  }

  setRange(range: Date[] | null): void {
    // 清空区间时退回「相对时间」而不是留一个残缺的 range：`readWindow` 认不出它，
    // 卡片会安静地变成「没有窗口」—— 那不如把用户刚清掉的那一档显式地换掉
    if (!range || range.length < 2) {
      this.setConfig('window', { kind: 'last', hours: DEFAULT_WINDOW_HOURS });
      return;
    }
    this.setConfig('window', { kind: 'range', from: range[0].getTime(), to: range[1].getTime() });
  }

  commit(): void {
    this.committed.emit(this.draft());
  }

  /** 删除这张卡。**不先确认**：删的是草稿，「退出编辑」原样撤销（见 `removed` 的说明） */
  remove(): void {
    this.removed.emit();
  }

  cancel(): void {
    this.cancelled.emit();
  }

  private patch(changes: Partial<WebDashboardWidget>): void {
    this.draft.update((widget) => ({ ...widget, ...changes }));
  }

  /** 改 `config` 里的一个键；值是 `undefined` 时**删掉它**（见类注释） */
  private setConfig(key: string, value: unknown): void {
    this.patchConfig({ [key]: value });
  }

  /**
   * 一次改 `config` 里的几个键。
   *
   * 级联要的是**一次改完**：换服务时「方法序号 + 字段」必须与新服务同时落进草稿，
   * 分三次 `setConfig` 会经过两个中间态（新服务配旧方法），而 `computed` 只保证最终一致、
   * 不保证中间态不被读 —— 而且三个键本来就是一回事，合在一处也更好读。
   */
  private patchConfig(changes: Record<string, unknown>): void {
    this.draft.update((widget) => {
      const config = { ...widget.config };
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) {
          delete config[key];
        } else {
          config[key] = value;
        }
      }
      return { ...widget, config };
    });
  }

  constructor() {
    // 设备卡那两级要的两次取数，都在这里触发。**发请求这个副作用归 `effect`，不归
    // `computed`**：computed 可能被重算任意多次，而它不该发请求（同 `device.widget.ts`）。
    //
    // 两个取数都幂等（`DeviceSpecService.load` 靠 `asked`，`DeviceDisplayService.resolve`
    // 同理），所以这个 effect 重跑多少次都只发一次请求。重跑的触发源是清单与所选设备，
    // 与「重开一次编辑框」无关 —— 那张卡还在改，清单与规格没必要跟着重取。
    effect(() => {
      if (this.type() !== 'device') {
        return;
      }
      // 读一次当前语言：切语言时 `DeviceDisplayService` 会把缓存整套作废（它按语言存实例
      // 描述），那时要再 `resolve` 一次才能把名字补回来。不读这一下，效果就是「切完语言，
      // 设备下拉变成一串 URN」，要等下次重开对话框才自愈。
      // `DeviceSpecService` 不需要这一下：它把文案按语言存着、读的时候才落到一种语言上。
      this.i18n.getCurrentLang();
      const devices = this.devices();
      if (devices.length > 0) {
        // 设备下拉上的名字。清单里只有 did / type，名字要按型号去问产品（四级回退那条链）
        this.display.resolve(devices);
      }
      const type = this.selectedDeviceType();
      if (type) {
        // 属性下拉的名字与单位。**按型号取、不按设备取**：同型号的设备共用一份规格
        this.specs.load(type);
      }
    });
  }
}

/** 字段候选：展开出来的一行（{@link ServiceFieldRef}）外加下拉要的 `value` / `label` */
interface EditorFieldOption extends ServiceFieldRef {
  value: string;
  label: string;
}

/**
 * 一份浅副本 —— `config` 也各拷一层。
 *
 * `config` **必须**拷：它与草稿里那张卡共用引用的话，改到一半点「取消」草稿已经被改了
 * —— 而它恰恰是这张表单要改的东西。
 */
function copy(widget: WebDashboardWidget): WebDashboardWidget {
  return { ...widget, config: { ...widget.config } };
}
