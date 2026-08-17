import { Routes } from '@angular/router';
import { ProductComponent } from './product.component';
import { ProductDetailComponent } from './detail/product.detail.component';

export const PRODUCT_ROUTES: Routes = [
  {
    path: '',
    component: ProductComponent,
  },
  {
    path: 'detail/:id',
    data: { breadcrumb: '详情' },
    component: ProductDetailComponent,
  },
];
