import { Routes } from '@angular/router';
import { Project1Component } from './project1.component';

/**
 * 项目树。**没有 `:id`** —— 与 `/main/project` 同一个口径：项目取「当前项目」
 * （`AccountService.space()`），不把 id 写进地址。要看别的项目，先从项目列表切过去。
 */
export const PROJECT1_ROUTES: Routes = [{ path: '', component: Project1Component }];
