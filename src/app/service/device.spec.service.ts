import { Service, inject, signal } from '@angular/core';
import { MainI18nService } from './i18n.service';
import { ProductService } from './product.service';

/**
 * 一个属性在展示层需要的东西。
 *
 * `name` 是**产品规格里的文案**（`description`），随界面语言变 —— 它不是用户填的数据，
 * 而是产品定义的一部分，所以**该翻译**（与 Modbus 点表的 `field` / `unit` 不同：
 * 那些是用户敲进去的，一翻就对不上后端日志）。
 */
export class DeviceProperty {
  /** 服务序号（产品规格里的 `iid`），与 pid 中间那一段对应 */
  siid: number = 0;
  /** 属性序号（规格里的 `iid`），与 pid 最后一段对应 */
  piid: number = 0;
  /** 属性名。规格里没有当前语言时退回中文，都没有则空串（调用方退回 pid 原文） */
  name: string = '';
  /** 单位。**产品规格数据**，原样显示、不翻译；没有单位时空串 */
  unit: string = '';
}

/** 产品规格里的一个属性（内部形状：文案按语言存着，读的时候才落到一种语言上） */
export interface SpecProperty {
  siid: number;
  piid: number;
  unit: string;
  description: Map<string, string>;
}

/**
 * {@link specProperties} 认的那几处规格字段。
 *
 * 写成结构类型而不是 `DeviceInstance`：这个函数只读 `services` / `properties` / `iid` /
 * `unit` / `description`，而结构类型让 spec 用几个字面量对象就能钉住它 —— 要造一个真的
 * `DeviceInstance` 得先知道那个库的构造方式，而那与这里要验的东西（两级 iid 有没有搬对）
 * 毫无关系。真实调用点仍然传 `DeviceInstance`，形状对不上就是编译错误。
 */
export interface SpecSource {
  services?: ReadonlyMap<number, SpecSourceService> | null;
}

interface SpecSourceService {
  iid: number;
  properties?: ReadonlyMap<number, SpecSourceProperty> | null;
}

interface SpecSourceProperty {
  iid: number;
  unit?: string | null;
  description?: ReadonlyMap<string, string> | null;
}

/**
 * 把一份产品规格摊平成属性表（属性直接挂在服务下，`(siid, piid)` 两级定位 —— 与 pid
 * 中间与最后那两段一一对应，见 {@link splitPid}）。
 *
 * 规格里缺服务、缺属性、缺描述都给得出一张表（空的那部分跳过），**不抛**：
 * 调用方（卡片、编辑器）要的是「查得到就用、查不到就退回 pid 原文」，
 * 为此在上游多判一次空没有意义。
 */
export function specProperties(instance: SpecSource | undefined): SpecProperty[] {
  const properties: SpecProperty[] = [];
  for (const service of instance?.services?.values() ?? []) {
    for (const property of service?.properties?.values() ?? []) {
      properties.push({
        siid: service.iid,
        piid: property.iid,
        unit: property.unit ?? '',
        description: new Map(property.description ?? []),
      });
    }
  }
  return properties;
}

/**
 * 设备属性的名字与单位：从产品规格（`ProductService.getProductInstance(type)`）里查。
 *
 * **为什么在前端查**：设备卡的数据里只有 `pid` 与 `type`（`WidgetDataService.deviceData`），
 * 属性名与单位都在产品规格里，而规格是前端本来就在用的东西（设备页、调试器、服务编辑器都查它）。
 * 服务卡片那条路（服务端顺带下发 `unit`）在设备上走不通：matrix 手里只有 `DeviceEntity.type`，
 * 服务定义的扩展要另外调 product 服务，不如让前端查它自己那份。
 *
 * **一个型号只取一次**：N 张设备卡、开几次编辑框，都共用这一份（`asked`）。
 * 失败静默 —— 查不到规格时卡片退回显示 pid 原文，那是**诚实的降级**：
 * 编一个名字出来才是更糟的（一个不存在于任何地方的属性名，谁也排查不了）。
 */
@Service()
export class DeviceSpecService {
  private readonly product = inject(ProductService);
  private readonly i18n = inject(MainI18nService);

  /** 型号 → 该型号的属性表。到了就进信号，等在它上面的卡片自己会重算 */
  private readonly specs = signal<Map<string, SpecProperty[]>>(new Map());

  /** 已经发过请求的型号。**不做失败重试**：看板每次刷新都重算，失败的型号会一直失败 */
  private readonly asked = new Set<string>();

  /**
   * 取一个型号的规格（幂等）。由**调用方在数据到达时**触发（卡片用 `effect`，
   * 编辑器在选设备时），不放在 {@link propertyOf} 里：那会让一次纯读变成一次取数，
   * 而 `computed` 可能被重算任意多次。
   */
  load(type: string): void {
    if (!type || this.asked.has(type)) {
      return;
    }
    this.asked.add(type);
    this.product.getProductInstance(type).subscribe({
      next: (instance) =>
        this.specs.update((specs) => new Map(specs).set(type, specProperties(instance))),
      error: () => {},
    });
  }

  /** 这个型号的属性（**已到的部分**）。没取过、还没到、取失败都给空数组 */
  propertiesOf(type: string | undefined): DeviceProperty[] {
    if (!type) {
      return [];
    }
    const properties = this.specs().get(type) ?? [];
    return properties.map((property) => this.resolve(property));
  }

  /**
   * 按 `(siid, piid)` 找一个属性；规格里没有 → `undefined`。
   *
   * `did` 用来从 pid 里切出后两段（pid 是 `<did>.<siid>.<piid>`）：
   * **按 did 前缀切，不按 `.` 分段**：did 自己可能带点，从右边数第三段那种算法会切错。
   */
  propertyOf(type: string | undefined, did: string, pid: string): DeviceProperty | undefined {
    const id = splitPid(did, pid);
    if (!type || !id) {
      return undefined;
    }
    const properties = this.specs().get(type) ?? [];
    const found = properties.find((p) => p.siid === id.siid && p.piid === id.piid);
    return found ? this.resolve(found) : undefined;
  }

  /** 落到当前语言上。读 `currentLang()` 建立依赖 —— 切语言时用到它的 `computed` 会重算 */
  private resolve(property: SpecProperty): DeviceProperty {
    const lang = this.i18n.getCurrentLang();
    return {
      siid: property.siid,
      piid: property.piid,
      name: property.description.get(lang) || property.description.get('zh-CN') || '',
      unit: property.unit,
    };
  }
}

/**
 * 从一个完整 pid 里切出 `(siid, piid)`。
 *
 * **按 did 前缀切**：`pid` 是 `<did>.<siid>.<piid>`，而 did 自己可能带点 ——
 * 「按 `.` 分成三段取后两段」在那种 did 上会切错，切错的后果是显示成另一个属性的名字
 * （比显示不出来更糟）。前缀对不上就给 `undefined`（卡片退回 pid 原文）。
 */
export function splitPid(did: string, pid: string): { siid: number; piid: number } | undefined {
  const prefix = `${did}.`;
  if (!did || !pid.startsWith(prefix)) {
    return undefined;
  }
  const rest = pid.slice(prefix.length);
  const separator = rest.indexOf('.');
  if (separator <= 0) {
    return undefined;
  }
  const siid = toIid(rest.slice(0, separator));
  const piid = toIid(rest.slice(separator + 1));
  if (siid === undefined || piid === undefined) {
    return undefined;
  }
  return { siid, piid };
}

/**
 * pid 里的那一段序号 → 数字。**只认十进制整数串**。
 *
 * 不直接用 `Number()` 判整数，是因为它把三个不该收的东西也当数：
 * `''` → `0`（`did-1.1.` 会切出一个看着合法的 `piid: 0`）、空白 → 0、`0x10` → 16。
 * 前两个尤其糟：切出来的是**一个存在的属性**，卡片会显示它的名字与单位，看不出错。
 */
function toIid(text: string): number | undefined {
  return /^\d+$/.test(text) ? Number(text) : undefined;
}

/** 拼一个完整 pid（编辑器选中属性时用）。与 {@link splitPid} 是一对 */
export function joinPid(did: string, siid: number, piid: number): string {
  return `${did}.${siid}.${piid}`;
}
