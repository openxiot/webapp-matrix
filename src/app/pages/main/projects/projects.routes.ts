import { Routes } from '@angular/router';
import { ProjectsComponent } from './projects.component';
import { ProjectCreateComponent } from './create/project.create.component';
import { ProjectMemberComponent } from './member/project.member.component';
import { ProjectComponent } from '../project/project.component';

export const PROJECTS_ROUTES: Routes = [
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
    component: ProjectComponent,
  },
  {
    path: 'member/:id',
    data: { breadcrumb: '成员' },
    component: ProjectMemberComponent,
  },
];
