import { Routes } from '@angular/router';
import { DeviceComponent } from './device.component';
import { DeviceDetailComponent } from './detail/device.detail.component';
import { DeviceDebuggerComponent } from './debugger/device.debugger.component';
import { DeviceServicesComponent } from './services/device.services.component';
import { DeviceServiceCreateComponent } from './services/service/create/device.service.create.component';
import { DeviceServiceDetailComponent } from './services/service/detail/device.service.detail.component';
import { DeviceServiceEditComponent } from './services/service/edit/device.service.edit.component';

export const DEVICE_ROUTES: Routes = [
  {
    path: '',
    component: DeviceComponent,
  },
  {
    path: 'detail/:id',
    data: { breadcrumb: '详情' },
    component: DeviceDetailComponent,
  },
  {
    path: 'debugger/:did',
    data: { breadcrumb: '调试' },
    component: DeviceDebuggerComponent,
  },
  {
    path: 'services/:did',
    data: { breadcrumb: '服务' },
    component: DeviceServicesComponent,
  },
  {
    path: 'services/:did/service/create',
    data: { breadcrumb: '添加服务' },
    component: DeviceServiceCreateComponent,
  },
  {
    path: 'services/:did/service/detail/:id',
    data: { breadcrumb: '服务详情' },
    component: DeviceServiceDetailComponent,
  },
  {
    path: 'services/:did/service/edit/:id',
    data: { breadcrumb: '编辑服务' },
    component: DeviceServiceEditComponent,
  },
];
