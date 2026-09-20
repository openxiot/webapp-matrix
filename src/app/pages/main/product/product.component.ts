import { Component, OnInit, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { NzColDirective, NzRowDirective } from 'ng-zorro-antd/grid';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { ProductService } from '@app/service/product.service';
import { ProductBasic } from '@openxiot/xiot-core-spec-ts';
import { MainI18nService } from '@app/service/i18n.service';

@Component({
  selector: 'main-product',
  standalone: true,
  templateUrl: './product.component.html',
  styleUrl: './product.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    BreadcrumbTranslateDirective,
    NzSpinModule,
    NzCardModule,
    NzAvatarModule,
    NzEmptyModule,
    RouterLink,
    TranslatePipe,
    NzColDirective,
    NzRowDirective,
  ],
})
export class ProductComponent implements OnInit {
  loading = signal(false);
  products = signal<ProductBasic[]>([]);

  constructor(
    private service: ProductService,
    private msg: NzMessageService,
    protected i18n: MainI18nService,
  ) {}

  ngOnInit() {
    this.loading.set(true);
    this.service.getPublicProducts().subscribe({
      next: (data) => {
        this.products.set(data);
        this.loading.set(false);
      },
      error: (error) => {
        this.msg.warning(error);
        this.loading.set(false);
      },
    });
  }

  /** 产品显示名：中文名 -> model -> id */
  productName(p: ProductBasic): string {
    return p.name?.value?.get('zh-CN') || p.model || p.id || this.i18n.translate.instant('未知产品');
  }
}
