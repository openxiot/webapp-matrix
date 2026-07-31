import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'oauth/callback', loadComponent: () => import('./pages/login/oauth-callback.component').then(m => m.OauthCallbackComponent) },

  // Main layout with sidebar
  {
    path: '',
    loadComponent: () => import('./layout/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'projects', pathMatch: 'full' },

      // Projects
      { path: 'projects', loadComponent: () => import('./pages/projects/projects.component').then(m => m.ProjectsComponent) },
      { path: 'projects/list', loadComponent: () => import('./pages/projects/project-list.component').then(m => m.ProjectListComponent) },
      { path: 'projects/:rootId', loadComponent: () => import('./pages/projects/space-tree.component').then(m => m.SpaceTreeComponent) },

      // Devices
      { path: 'devices', loadComponent: () => import('./pages/devices/device-list.component').then(m => m.DeviceListComponent) },
      { path: 'devices/:did', loadComponent: () => import('./pages/devices/device-detail.component').then(m => m.DeviceDetailComponent) },
      { path: 'devices/:did/operation', loadComponent: () => import('./pages/devices/device-operation.component').then(m => m.DeviceOperationComponent) },

      // Products
      { path: 'products', loadComponent: () => import('./pages/products/product-list.component').then(m => m.ProductListComponent) },
      { path: 'products/:productId', loadComponent: () => import('./pages/products/product-detail.component').then(m => m.ProductDetailComponent) },

      // Organizations
      { path: 'organizations', loadComponent: () => import('./pages/organizations/org-picker.component').then(m => m.OrgPickerComponent) },
      { path: 'organizations/:orgId', loadComponent: () => import('./pages/organizations/org-detail.component').then(m => m.OrgDetailComponent) },

      // Profile
      { path: 'profile', loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent) },
      { path: 'profile/account', loadComponent: () => import('./pages/profile/account.component').then(m => m.AccountComponent) },
      { path: 'profile/about', loadComponent: () => import('./pages/profile/about.component').then(m => m.AboutComponent) },
    ]
  },

  // Fallback
  { path: '**', redirectTo: 'projects' },
];
