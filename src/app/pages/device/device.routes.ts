import { Routes } from '@angular/router';
import { DeviceComponent } from './device.component';
import { DeviceDetailComponent } from './detail/device.detail.component';

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
];
