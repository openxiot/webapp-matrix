import { Routes } from '@angular/router';
import { authGuard } from '../../service/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/main/dashboard',
  },
  {
    path: 'account',
    canActivate: [authGuard],
    data: { breadcrumb: '账号' },
    loadChildren: () => import('./account/account.routes').then((m) => m.ACCOUNT_ROUTES),
  },
  {
    path: 'organization',
    canActivate: [authGuard],
    data: { breadcrumb: '组织' },
    loadChildren: () => import('./organization/organization.routes').then((m) => m.ORGANIZATION_ROUTES),
  },
  {
    path: 'project',
    canActivate: [authGuard],
    data: { breadcrumb: '项目' },
    loadChildren: () => import('./project/project.routes').then((m) => m.PROJECT_ROUTES),
  },
  {
    path: 'device',
    canActivate: [authGuard],
    data: { breadcrumb: '设备' },
    loadChildren: () => import('./device/device.routes').then((m) => m.DEVICE_ROUTES),
  },
  {
    path: 'product',
    data: { breadcrumb: '产品' },
    loadChildren: () => import('./product/product.routes').then((m) => m.PRODUCT_ROUTES),
  },
  {
    path: 'dashboard',
    data: { breadcrumb: '首页' },
    loadChildren: () => import('./dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
  },
  {
    path: 'alarm',
    data: { breadcrumb: '报警' },
    loadChildren: () => import('./alarm/alarm.routes').then((m) => m.ALARM_ROUTES),
  },
  {
    path: 'modbus',
    canActivate: [authGuard],
    data: { breadcrumb: '设备点表' },
    loadChildren: () => import('./modbus/modbus.routes').then((m) => m.MODBUS_ROUTES),
  },
];
