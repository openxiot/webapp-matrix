import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { ProductBasic, LifeCycle } from '@openxiot/xiot-core-spec-ts';
import { ProductService } from '../../service/product.service';

@Component({
  selector: 'app-product',
  imports: [
    NzEmptyModule,
    NzIconModule,
    NzListModule,
    NzSpinModule,
    NzTagModule,
    NzTooltipModule,
  ],
  templateUrl: './product.html',
  styleUrl: './product.less',
})
export class Product implements OnInit {
  loading: boolean = false;
  products: ProductBasic[] = [];

  constructor(
    private service: ProductService,
    private msg: NzMessageService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.service.getPublicProducts().subscribe({
      next: (data) => {
        this.products = data;
        this.loading = false;
      },
      error: (e) => {
        this.msg.error(e?.message ?? e);
        this.loading = false;
      },
    });
  }

  displayName(p: ProductBasic): string {
    return p.name?.value?.get('zh-CN') || p.model || p.id || '未知产品';
  }

  lifecycleLabel(lifecycle: LifeCycle): string {
    switch (lifecycle) {
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

  lifecycleColor(lifecycle: LifeCycle): string {
    switch (lifecycle) {
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

  openDetail(p: ProductBasic) {
    this.router.navigate(['/product', p.id]);
  }
}
