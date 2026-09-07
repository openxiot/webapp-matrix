import { Routes } from '@angular/router';
import { authGuard } from '../../../service/auth.guard';
import { ModbusComponent } from './modbus.component';
import { ModbusAddComponent } from './add/modbus.add.component';
import { ModbusDetailComponent } from './detail/modbus.detail.component';

export const MODBUS_ROUTES: Routes = [
  {
    path: '',
    component: ModbusComponent,
    canActivate: [authGuard],
    data: { breadcrumb: '设备点表' },
  },
  {
    path: 'create',
    component: ModbusAddComponent,
    canActivate: [authGuard],
    data: { breadcrumb: '创建' },
  },
  {
    path: 'detail/:id',
    component: ModbusDetailComponent,
    canActivate: [authGuard],
    data: { breadcrumb: '编辑' },
  },
];
