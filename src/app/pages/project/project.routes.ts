import { Routes } from '@angular/router';
import { ProjectComponent } from './project.component';
import { ProjectCreateComponent } from './create/project.create.component';
import { ProjectDetailComponent } from './detail/project.detail.component';

export const PROJECT_ROUTES: Routes = [
  {
    path: '',
    component: ProjectComponent,
  },
  {
    path: 'create',
    data: { breadcrumb: '创建' },
    component: ProjectCreateComponent,
  },
  {
    path: 'detail/:id',
    data: { breadcrumb: '详情' },
    component: ProjectDetailComponent,
  },
];
