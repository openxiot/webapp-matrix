import { Routes } from '@angular/router';
import { authGuard } from './service/auth.guard';
import { Layout } from './layout/layout';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/account',
  },
  {
    path: 'passport',
    loadChildren: () => import('./pages/passport/passport.routes').then((m) => m.PASSPORT_ROUTES),
  },
  {
    path: 'account',
    component: Layout,
    canActivate: [authGuard],
    data: { breadcrumb: '账号' },
    loadChildren: () => import('./pages/account/account.routes').then((m) => m.ACCOUNT_ROUTES),
  },
  {
    path: 'organization',
    component: Layout,
    canActivate: [authGuard],
    data: { breadcrumb: '组织' },
    loadChildren: () =>
      import('./pages/organization/organization.routes').then((m) => m.ORGANIZATION_ROUTES),
  },
  {
    path: 'project',
    component: Layout,
    canActivate: [authGuard],
    data: { breadcrumb: '项目' },
    loadChildren: () => import('./pages/project/project.routes').then((m) => m.PROJECT_ROUTES),
  },
  {
    path: 'device',
    component: Layout,
    canActivate: [authGuard],
    data: { breadcrumb: '设备' },
    loadChildren: () => import('./pages/device/device.routes').then((m) => m.DEVICE_ROUTES),
  },
  {
    path: 'product',
    component: Layout,
    data: { breadcrumb: '产品' },
    loadChildren: () => import('./pages/product/product.routes').then((m) => m.PRODUCT_ROUTES),
  },
];
