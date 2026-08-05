import { Routes } from '@angular/router';
import { Passport } from './passport';
import { Callback } from './callback';

export const PASSPORT_ROUTES: Routes = [
  {
    path: '',
    component: Passport,
  },
  {
    path: 'callback',
    component: Callback,
  },
];
