import { Routes } from '@angular/router';
import { authGuard } from '../../../service/auth.guard';
import { ModbusComponent } from './modbus.component';
import { ModbusEditComponent } from './edit/modbus.edit.component';

export const MODBUS_ROUTES: Routes = [
  {
    path: '',
    component: ModbusComponent,
    canActivate: [authGuard],
    data: { breadcrumb: '设备点表' },
  },
  {
    path: 'create',
    component: ModbusEditComponent,
    canActivate: [authGuard],
    data: { breadcrumb: '创建' },
  },
  {
    path: 'edit/:id',
    component: ModbusEditComponent,
    canActivate: [authGuard],
    data: { breadcrumb: '编辑' },
  },
];
