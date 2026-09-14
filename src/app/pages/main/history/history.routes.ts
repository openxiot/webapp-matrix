import { Routes } from '@angular/router';
import { HistoryComponent } from './history.component';
import { HistoryServicesComponent } from './services/history.services.component';

export const HISTORY_ROUTES: Routes = [
  {
    path: '',
    component: HistoryComponent,
  },
  {
    // 二级页：项目下**所有服务**的历史数据放在一个页面里看（表格 / 曲线图）
    path: 'services',
    data: { breadcrumb: '所有服务' },
    component: HistoryServicesComponent,
  },
];
