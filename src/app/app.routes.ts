import { Routes } from '@angular/router';
import { MainComponent } from './pages/main/main.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/main/dashboard',
  },
  {
    path: 'passport',
    loadChildren: () => import('./pages/passport/passport.routes').then((m) => m.PASSPORT_ROUTES),
  },
  {
    path: 'main',
    data: { breadcrumb: '首页' },
    component: MainComponent,
    loadChildren: () => import('./pages/main/main.routes').then((m) => m.routes),
  },
];
