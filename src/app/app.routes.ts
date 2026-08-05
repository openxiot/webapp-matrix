import { Routes } from '@angular/router';
import { authGuard } from './service/auth.guard';
import { Layout } from './layout/layout';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/project',
  },
  {
    path: 'passport',
    loadChildren: () => import('./pages/passport/passport.routes').then((m) => m.PASSPORT_ROUTES),
  },
  {
    path: '',
    component: Layout,
    canActivate: [authGuard],
    children: [
      {
        path: 'project',
        loadChildren: () => import('./pages/project/project.routes').then((m) => m.PROJECT_ROUTES),
      },
      {
        path: 'device',
        loadChildren: () => import('./pages/device/device.routes').then((m) => m.DEVICE_ROUTES),
      },
      {
        path: 'product',
        loadChildren: () => import('./pages/product/product.routes').then((m) => m.PRODUCT_ROUTES),
      },
      {
        path: 'settings',
        loadChildren: () => import('./pages/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
      },
      {
        path: 'org-picker',
        loadComponent: () =>
          import('./pages/organization/org-picker').then((m) => m.OrgPicker),
      },
      {
        path: 'org/:orgId',
        loadComponent: () =>
          import('./pages/organization/org-detail').then((m) => m.OrgDetail),
      },
      {
        path: 'project-picker',
        loadComponent: () =>
          import('./pages/project/project-picker').then((m) => m.ProjectPicker),
      },
      {
        path: 'space/:rootId',
        loadComponent: () => import('./pages/project/space-tree').then((m) => m.SpaceTree),
      },
      {
        path: 'device/:did',
        loadComponent: () =>
          import('./pages/device/device-detail').then((m) => m.DeviceDetail),
      },
      {
        path: 'device-operation/:did',
        loadComponent: () =>
          import('./pages/device/device-operation').then((m) => m.DeviceOperation),
      },
      {
        path: 'product/:productId',
        loadComponent: () =>
          import('./pages/product/product-detail').then((m) => m.ProductDetail),
      },
      {
        path: 'account',
        loadComponent: () => import('./pages/settings/account').then((m) => m.Account),
      },
      {
        path: 'about',
        loadComponent: () => import('./pages/settings/about').then((m) => m.About),
      },
    ],
  },
];
