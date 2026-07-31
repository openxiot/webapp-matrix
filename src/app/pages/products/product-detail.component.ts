import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApiService } from '../../services/api.service';
import { ProductEntity, productDisplayName } from '../../models/api.models';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [
    CommonModule, NzDescriptionsModule, NzIconModule, NzButtonModule,
    NzTagModule, NzCardModule, NzSpinModule, NzPageHeaderModule, NzBreadCrumbModule, NzEmptyModule,
  ],
  template: `
    <div class="page-container">
      <nz-page-header (nzBack)="router.navigate(['/products'])" nzBackIcon>
        <nz-breadcrumb nz-page-header-breadcrumb nzSeparator=">">
          <nz-breadcrumb-item><a (click)="router.navigate(['/products'])">产品列表</a></nz-breadcrumb-item>
          <nz-breadcrumb-item>{{ product() ? productDisplayName(product()!) : '产品详情' }}</nz-breadcrumb-item>
        </nz-breadcrumb>
      </nz-page-header>

      <nz-spin [nzSpinning]="loading()" class="content-spin">
        <nz-empty *ngIf="!product() && !loading()" nzNotFoundContent="产品未找到"></nz-empty>

        <div *ngIf="product() as p">
          <!-- Header card -->
          <nz-card class="header-card">
            <div class="product-header">
              <div class="product-icon">
                <span nz-icon nzType="appstore" nzTheme="fill"></span>
              </div>
              <div class="product-title">
                <h3>{{ productDisplayName(p) }}</h3>
                <nz-tag [nzColor]="lifecycleColor(p.lifecycle)">{{ lifecycleLabel(p.lifecycle) }}</nz-tag>
              </div>
            </div>
          </nz-card>

          <!-- Detail info -->
          <nz-card nzTitle="产品详情" class="info-card">
            <nz-descriptions [nzColumn]="1" nzBordered [nzSize]="'small'">
              <nz-descriptions-item nzTitle="产品 ID">{{ p.id || '-' }}</nz-descriptions-item>
              <nz-descriptions-item nzTitle="产品型号">{{ p.model || '-' }}</nz-descriptions-item>
              <nz-descriptions-item nzTitle="通信协议">{{ p.protocol || '-' }}</nz-descriptions-item>
              <nz-descriptions-item nzTitle="所属组织">{{ p.organization || '-' }}</nz-descriptions-item>
            </nz-descriptions>
          </nz-card>

          <!-- Purchase buttons -->
          <div class="purchase-actions">
            <button nz-button nzSize="large" class="btn-jd" (click)="openJd()">
              <span nz-icon nzType="shopping-cart"></span>
              去京东购买
            </button>
            <button nz-button nzSize="large" class="btn-taobao" (click)="openTaobao()">
              <span nz-icon nzType="shopping-cart"></span>
              去淘宝购买
            </button>
          </div>
        </div>
      </nz-spin>
    </div>
  `,
  styles: [`
    .page-container { padding: 0 24px 24px; max-width: 800px; margin: 0 auto; }
    .content-spin { min-height: 300px; }
    .header-card { margin-bottom: 16px; }
    .product-header { display: flex; align-items: center; gap: 16px; }
    .product-icon {
      width: 56px; height: 56px; border-radius: 12px; background: #fff7e6;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px; color: #fa8c16; flex-shrink: 0;
    }
    .product-title h3 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
    .info-card { margin-bottom: 16px; }
    .purchase-actions { display: flex; gap: 12px; }
    .purchase-actions button { flex: 1; height: 48px; border-radius: 8px; font-weight: 500; border: none !important; color: #fff !important; }
    .btn-jd { background: #e4393c !important; }
    .btn-jd:hover { background: #c9302c !important; }
    .btn-taobao { background: #ff6a00 !important; }
    .btn-taobao:hover { background: #e06000 !important; }
    :host-context(.dark-theme) .product-icon { background: #2a1f00; color: #d48806; }
  `]
})
export class ProductDetailComponent implements OnInit {
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private msg = inject(NzMessageService);

  product = signal<ProductEntity | undefined>(undefined);
  loading = signal(false);
  productDisplayName = productDisplayName;

  ngOnInit(): void {
    const productId = this.route.snapshot.paramMap.get('productId') || '';
    if (productId) this.loadProduct(productId);
  }

  private loadProduct(productId: string): void {
    this.loading.set(true);
    this.api.getProductDetail(productId).subscribe({
      next: (p) => { this.product.set(p); this.loading.set(false); },
      error: (err) => { this.msg.error(err.message); this.loading.set(false); }
    });
  }

  lifecycleColor(lifecycle?: string): string {
    switch (lifecycle) {
      case 'released': return 'green';
      case 'preview': return 'blue';
      case 'development': return 'red';
      default: return 'default';
    }
  }

  lifecycleLabel(lifecycle?: string): string {
    switch (lifecycle) {
      case 'released': return '已发布';
      case 'preview': return '预览版';
      case 'development': return '开发中';
      default: return lifecycle || '-';
    }
  }

  openJd(): void { window.open('https://www.jd.com', '_blank'); }
  openTaobao(): void { window.open('https://www.taobao.com', '_blank'); }
}
