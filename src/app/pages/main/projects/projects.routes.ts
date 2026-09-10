import { Routes } from '@angular/router';
import { ProjectsComponent } from './projects.component';
import { ProjectCreateComponent } from './create/project.create.component';
import { ProjectDetailComponent } from './detail/project.detail.component';
import { ProjectMemberComponent } from './member/project.member.component';

export const PROJECT_ROUTES: Routes = [
  {
    path: '',
    component: ProjectsComponent,
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
  {
    path: 'member/:id',
    data: { breadcrumb: '成员' },
    component: ProjectMemberComponent,
  },
];
