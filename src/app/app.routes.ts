import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/settings',
  },
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
];
