import { Routes } from '@angular/router';
import { DeviceComponent } from './device.component';
import { DeviceDetailComponent } from './detail/device.detail.component';
import { DeviceChildrenComponent } from './children/device.children.component';
import { DeviceDebuggerComponent } from './debugger/device.debugger.component';
import { DeviceServicesComponent } from './services/device.services.component';
import { DeviceServiceCreateComponent } from './services/service/create/device.service.create.component';
import { DeviceServiceDetailComponent } from './services/service/detail/device.service.detail.component';
import { DeviceServiceEditComponent } from './services/service/edit/device.service.edit.component';
import { DeviceServiceHistoryComponent } from './services/service/history/device.service.history.component';

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
    path: 'children/:id',
    data: { breadcrumb: '子设备' },
    component: DeviceChildrenComponent,
  },
  {
    path: 'debugger/:did',
    data: { breadcrumb: '调试' },
    component: DeviceDebuggerComponent,
  },
  /**
   * 设备下的 Modbus 服务：列表 + 列表里每一项的 添加/详情/编辑。
   *
   * 这里**故意**做成父子（父路由不带组件，子路由渲染到上层 outlet），而不是四条平级路由：
   * 面包屑由 nz-breadcrumb 按**激活路由树的层级**逐层生成（一层有 url 且有 data.breadcrumb 才出一枚），
   * 平级的话详情页相对设备只深一层，只能出「服务」一枚；嵌套后才是 设备 → 服务 → 详情 四级。
   */
  {
    path: 'services/:did',
    data: { breadcrumb: '服务' },
    children: [
      {
        path: '',
        component: DeviceServicesComponent,
      },
      {
        path: 'service/create',
        data: { breadcrumb: '添加' },
        component: DeviceServiceCreateComponent,
      },
      {
        path: 'service/detail/:id',
        data: { breadcrumb: '详情' },
        component: DeviceServiceDetailComponent,
      },
      {
        path: 'service/edit/:id',
        data: { breadcrumb: '编辑' },
        component: DeviceServiceEditComponent,
      },
      {
        path: 'service/history/:id',
        data: { breadcrumb: '历史' },
        component: DeviceServiceHistoryComponent,
      },
    ],
  },
];
