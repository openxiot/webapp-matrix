import { Injectable, inject, signal } from '@angular/core';
import { ProductBasic } from '@openxiot/xiot-core-spec-ts';
import { DeviceEntity } from '../typedef/define/device/DeviceEntity';
import { UrnUtils } from '../typedef/utils/UrnUtils';
import { AccountService } from './account.service';
import { MainI18nService } from './i18n.service';
import { ProductService } from './product.service';

/** 产品显示名：中文名 -> model -> id */
function productDisplayName(p: ProductBasic, unknown: string): string {
  return p.name?.value?.get('zh-CN') || p.model || p.id || unknown;
}

/**
 * 设备显示名解析。优先级与设备列表页一致：
 * 产品名称 → 设备实例描述 → DeviceType（URN）的 type 段 → did。
 *
 * 同样的链在 `project.component` 和 `device.component` 里各有一份，**那两处没有一起改** ——
 * 去重不值得拿两个正常工作的页面冒险，这里只是第三次出现时的落点。
 *
 * 名字是**异步到达**的：{@link resolve} 只负责发请求，结果晚一点才进信号。
 * 调用方只要让模板（或 computed）读 {@link name}，名字到了会自己重算 ——
 * 不需要在回调里手动刷新，但也**不能**把 `name()` 的结果存进普通字段。
 */
@Injectable({ providedIn: 'root' })
export class DeviceDisplayService {
  private readonly product = inject(ProductService);
  private readonly account = inject(AccountService);
  private readonly i18n = inject(MainI18nService);

  /** 产品 model → 显示名 */
  private readonly productNames = signal<Map<string, string>>(new Map());
  /** 产品 model → 图标 URL */
  private readonly icons = signal<Map<string, string>>(new Map());
  /** DeviceType → 实例描述（随语言变化失效重取） */
  private readonly descriptions = signal<Map<string, string>>(new Map());

  /** 已发过请求的 key。同一 model / type 只打一次接口 */
  private readonly askedProducts = new Set<string>();
  private readonly askedTypes = new Set<string>();
  /** 「组织可见产品」那一次全量请求是否已发过 */
  private askedVisible = false;

  /** 缓存是对着哪个组织 / 哪种语言取的，变了就整套作废 */
  private orgId = '';
  private descriptionLang = '';

  /**
   * 设备显示名。**同步返回当前已知的最好名字**，所以第一次调用可能只是 did ——
   * 先 {@link resolve} 再渲染，名字随后自行补上。
   */
  name(device: DeviceEntity): string {
    const name = this.productNames().get(this.model(device));
    if (name) {
      return name;
    }
    const description = this.descriptions().get(device.type);
    if (description) {
      return description;
    }
    return UrnUtils.extractTypeName(device.type) || device.did;
  }

  /** 设备的产品型号（DeviceType URN 的 model 段） */
  model(device: DeviceEntity): string {
    return UrnUtils.extractOrgModel(device.type).model;
  }

  /** 产品图标 URL，没有就空串 */
  icon(device: DeviceEntity): string {
    return this.icons().get(this.model(device)) ?? '';
  }

  /**
   * 为这批设备补齐显示名。幂等，重复调用不会重复打接口；失败静默
   * （叫不出名字不该让页面报错，回退链上还有 URN 和 did 兜着）。
   */
  resolve(devices: DeviceEntity[]): void {
    this.ensureScope();
    this.ensureVisibleProducts();
    this.ensureDescriptions(devices);

    // 逐型号精确解析：可见产品列表不一定包含全部型号
    const orgModels = new Set<string>();
    for (const device of devices) {
      const { org, model } = UrnUtils.extractOrgModel(device.type);
      if (model) {
        orgModels.add(`${org}:${model}`);
      }
    }
    for (const key of orgModels) {
      const sep = key.indexOf(':');
      const org = key.slice(0, sep);
      const model = key.slice(sep + 1);
      if (this.askedProducts.has(model)) {
        continue;
      }
      this.askedProducts.add(model);
      this.product.getProductByOrgModel(org, model).subscribe({
        next: (p) => {
          const name = productDisplayName(p, this.i18n.translate.instant('未知产品'));
          this.productNames.update((m) => new Map(m).set(model, name));
          this.icons.update((m) => new Map(m).set(model, p.icon ?? ''));
        },
        error: () => {},
      });
    }
  }

  /** 组织或界面语言变了 → 缓存整体作废，下一次 resolve 重新取 */
  private ensureScope(): void {
    const orgId = this.account.organization().id;
    const lang = this.i18n.getCurrentLang();
    if (orgId === this.orgId && lang === this.descriptionLang) {
      return;
    }
    this.orgId = orgId;
    this.descriptionLang = lang;
    this.productNames.set(new Map());
    this.descriptions.set(new Map());
    this.icons.set(new Map());
    this.askedProducts.clear();
    this.askedTypes.clear();
    this.askedVisible = false;
  }

  /** 组织可见的全部产品，一次性把 model → 名称/图标 铺满 */
  private ensureVisibleProducts(): void {
    const orgId = this.orgId;
    if (!orgId || this.askedVisible) {
      return;
    }
    this.askedVisible = true;
    this.product.getVisibleProducts(orgId).subscribe({
      next: (products) => {
        const names = new Map<string, string>();
        const icons = new Map<string, string>();
        for (const p of products) {
          names.set(p.model, productDisplayName(p, this.i18n.translate.instant('未知产品')));
          icons.set(p.model, p.icon ?? '');
        }
        this.productNames.update((m) => new Map([...names, ...m]));
        this.icons.update((m) => new Map([...icons, ...m]));
      },
      error: () => {},
    });
  }

  /** 实例描述：按 DeviceType 存，同类型只取一次，当前语言没文案时回退中文 */
  private ensureDescriptions(devices: DeviceEntity[]): void {
    const lang = this.descriptionLang;
    for (const device of devices) {
      const type = device.type;
      if (!type || this.askedTypes.has(type)) {
        continue;
      }
      this.askedTypes.add(type);
      this.product.getProductInstance(type).subscribe({
        next: (instance) => {
          const description =
            instance.description?.get(lang) || instance.description?.get('zh-CN') || '';
          if (!description) {
            return;
          }
          this.descriptions.update((m) => new Map(m).set(type, description));
        },
        error: () => {},
      });
    }
  }
}
