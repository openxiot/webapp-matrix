import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ProductBasic, LifeCycle } from '@openxiot/xiot-core-spec-ts';
import { ProductService } from '../../service/product.service';

@Component({
  selector: 'app-product-detail',
  imports: [
    NzButtonModule,
    NzCardModule,
    NzDescriptionsModule,
    NzEmptyModule,
    NzIconModule,
    NzSpinModule,
    NzTagModule,
  ],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.less',
})
export class ProductDetail implements OnInit {
  productId: string = '';
  loading: boolean = false;
  product: ProductBasic | null = null;
  loadError: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private service: ProductService,
    private msg: NzMessageService,
  ) {}

  ngOnInit() {
    this.productId = this.route.snapshot.paramMap.get('productId') || '';
    this.load();
  }

  load() {
    this.loading = true;
    this.loadError = '';
    this.service.getProductDetail(this.productId).subscribe({
      next: (p) => {
        this.product = p;
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.loadError = e?.message ?? String(e);
      },
    });
  }

  displayName(): string {
    return this.product?.name?.value?.get('zh-CN') || this.product?.model || this.product?.id || '未知产品';
  }

  lifecycleLabel(): string {
    const l = this.product?.lifecycle;
    switch (l) {
      case LifeCycle.RELEASED:
        return '已发布';
      case LifeCycle.PREVIEW:
        return '预览版';
      case LifeCycle.DEVELOPMENT:
        return '开发中';
      default:
        return '未知';
    }
  }

  lifecycleColor(): string {
    switch (this.product?.lifecycle) {
      case LifeCycle.RELEASED:
        return 'blue';
      case LifeCycle.PREVIEW:
        return 'cyan';
      case LifeCycle.DEVELOPMENT:
        return 'red';
      default:
        return 'default';
    }
  }

  goJd() {
    window.open('https://www.jd.com', '_blank');
  }

  goTaobao() {
    window.open('https://www.taobao.com', '_blank');
  }

  routerBack() {
    this.router.navigate(['/product']);
  }
}
