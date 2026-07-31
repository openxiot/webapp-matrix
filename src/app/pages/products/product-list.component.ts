import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ApiService } from '../../services/api.service';
import { ProductEntity, productDisplayName } from '../../models/api.models';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, NzListModule, NzIconModule, NzTagModule, NzSpinModule, NzEmptyModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h2>产品</h2>
        <span class="product-count" *ngIf="products().length > 0">{{ products().length }} 个产品</span>
      </div>

      <nz-spin [nzSpinning]="loading()" class="content-spin">
        <nz-empty *ngIf="!loading() && products().length === 0" nzNotFoundContent="暂无产品"></nz-empty>

        <div class="product-grid" *ngIf="products().length > 0">
          <div class="product-card" *ngFor="let p of products()" (click)="productDetail(p)">
            <div class="product-icon">
              <span nz-icon nzType="appstore" nzTheme="fill"></span>
            </div>
            <div class="product-body">
              <strong class="product-name">{{ productDisplayName(p) }}</strong>
              <div class="product-meta">
                <span>型号: {{ p.model || '-' }}</span>
                <span *ngIf="p.protocol">{{ p.protocol }}</span>
              </div>
            </div>
            <nz-tag class="lifecycle-badge" [nzColor]="lifecycleColor(p.lifecycle)">
              {{ lifecycleLabel(p.lifecycle) }}
            </nz-tag>
            <span nz-icon nzType="right" nzTheme="outline" style="color:#ccc;margin-left:8px"></span>
          </div>
        </div>
      </nz-spin>
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; max-width: 800px; margin: 0 auto; }
    .page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .page-header h2 { margin: 0; font-size: 20px; font-weight: 600; }
    .product-count { color: #999; font-size: 13px; }
    .content-spin { min-height: 300px; }
    .product-grid { display: flex; flex-direction: column; gap: 6px; }
    .product-card {
      display: flex; align-items: center; gap: 12px; background: #fff;
      padding: 12px 16px; border-radius: 8px; cursor: pointer;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06); transition: all 0.2s;
    }
    .product-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .product-icon {
      width: 40px; height: 40px; border-radius: 10px; background: #fff7e6;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; color: #fa8c16; flex-shrink: 0;
    }
    .product-body { flex: 1; }
    .product-name { display: block; margin-bottom: 4px; }
    .product-meta { display: flex; gap: 12px; }
    .product-meta span { color: #999; font-size: 11px; }
    .lifecycle-badge { flex-shrink: 0; }
    :host-context(.dark-theme) .product-card { background: #1f1f1f; }
    :host-context(.dark-theme) .product-icon { background: #2a1f00; color: #d48806; }
  `]
})
export class ProductListComponent implements OnInit {
  router = inject(Router);
  private api = inject(ApiService);
  private msg = inject(NzMessageService);

  products = signal<ProductEntity[]>([]);
  loading = signal(false);
  productDisplayName = productDisplayName;

  ngOnInit(): void { this.loadProducts(); }

  private loadProducts(): void {
    this.loading.set(true);
    this.api.getProducts().subscribe({
      next: (products) => { this.products.set(products); this.loading.set(false); },
      error: (err) => { this.msg.error(err.message); this.loading.set(false); }
    });
  }

  productDetail(p: ProductEntity): void {
    if (p.id) this.router.navigate(['/products', p.id]);
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
}
