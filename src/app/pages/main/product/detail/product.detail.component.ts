import { Component, computed, OnInit, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ActivatedRoute } from '@angular/router';
import { DatePipe, Location } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { LocalizedName, LifeCycle, ProductBasic } from '@openxiot/xiot-core-spec-ts';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { ProductService } from '@app/service/product.service';
import { MainI18nService } from '@app/service/i18n.service';

/** 产品生命周期 -> 状态文案 i18n 键 + 标签颜色 */
const LIFECYCLE_STYLE: Record<string, { text: string; color: string }> = {
  [LifeCycle.DEVELOPMENT]: { text: '开发中', color: 'processing' },
  [LifeCycle.PREVIEW]: { text: '预览', color: 'warning' },
  [LifeCycle.RELEASED]: { text: '已发布', color: 'success' },
};

/** 生命周期对应的展示样式（未收录时按“未定义”处理） */
function lifecycleStyle(lifecycle: LifeCycle | undefined): { text: string; color: string } {
  return (lifecycle && LIFECYCLE_STYLE[lifecycle]) || { text: '未定义', color: 'default' };
}

/** 单个本地化名称（语言码 -> 文案）中的一行 */
interface LocalizedRow {
  lang: string;
  value: string;
}

/** 将本地化名称对象展开为「语言码 + 文案」行 */
function localizedRows(name: LocalizedName | undefined): LocalizedRow[] {
  if (!name) {
    return [];
  }
  return Array.from(name.value ?? new Map(), ([lang, value]) => ({ lang, value }));
}

@Component({
  selector: 'product-detail',
  standalone: true,
  templateUrl: './product.detail.component.html',
  styleUrl: './product.detail.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzCardModule,
    NzDescriptionsModule,
    NzTagModule,
    NzAvatarModule,
    NzEmptyModule,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    DatePipe,
  ],
})
export class ProductDetailComponent implements OnInit {
  /** 产品 id（来自路由） */
  id = signal('');
  product = signal<ProductBasic | undefined>(undefined);
  loading = signal(false);

  /** 标准名称的多语言行（产品名 name.value） */
  readonly standardNames = computed<LocalizedRow[]>(() => localizedRows(this.product()?.name));
  /** 别名多语言行（alias[] 里所有语言展开） */
  readonly aliasNames = computed<LocalizedRow[]>(() => {
    const alias = this.product()?.alias ?? [];
    const rows: LocalizedRow[] = [];
    for (const a of alias) {
      rows.push(...localizedRows(a));
    }
    return rows;
  });

  constructor(
    protected location: Location,
    private route: ActivatedRoute,
    private service: ProductService,
    public i18n: MainI18nService,
    private msg: NzMessageService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.id.set(params['id'] || '');
      this.load();
    });
  }

  /** 拉取产品详情 */
  private load(): void {
    if (!this.id()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.service.getProductDetail(this.id()).subscribe({
      next: (data) => {
        this.product.set(data);
        this.loading.set(false);
      },
      error: (error) => {
        this.msg.warning(error);
        this.loading.set(false);
      },
    });
  }

  /** 页头标题：当前语言产品名 -> 中文名 -> 型号 -> id */
  protected productTitle(p: ProductBasic): string {
    const value = p.name?.value;
    return (
      value?.get(this.i18n.getCurrentLang()) ||
      value?.get('zh-CN') ||
      p.model ||
      p.id ||
      this.i18n.translate.instant('未知产品')
    );
  }

  /** 生命周期展示样式（文案键 + 颜色） */
  protected lifecycle(p: ProductBasic): { text: string; color: string } {
    return lifecycleStyle(p.lifecycle);
  }

  /** 创建者/更新者显示名：name -> id -> '-' */
  protected actorName(actor: { name: string; id: string } | null | undefined): string {
    if (!actor) {
      return '-';
    }
    return actor.name || actor.id || '-';
  }
}
