import { Routes } from '@angular/router';
import { DeviceComponent } from './device.component';
import { DeviceDetailComponent } from './detail/device.detail.component';
import { DeviceDebuggerComponent } from './debugger/device.debugger.component';
import { DeviceMappingComponent } from './mapping/device.mapping.component';

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
    path: 'mapping/:did',
    data: { breadcrumb: '映射' },
    component: DeviceMappingComponent,
  },
];
