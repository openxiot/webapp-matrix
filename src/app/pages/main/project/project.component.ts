import { Component, computed, inject, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { AccountService } from '../../../service/account.service';
import { ProjectTableViewComponent } from './table/project.table.view.component';
import { ProjectTreeViewComponent } from './tree/project.tree.view.component';
import { Project3dViewComponent } from './3d/project.3d.view.component';

/** 项目页的三种视图。 */
type ProjectView = 'table' | 'tree' | '3d';

/**
 * 项目页宿主 —— **薄壳**：只负责页头（返回 / 面包屑 / 三视图切换）和按当前视图渲染对应的子组件。
 *
 * 三个视图（表格 / 树 / 3D）是平级子组件，**各自按 `account.space()` 加载当前项目**、自判定
 * `isAdmin`、自持有管理员写操作对话框 —— 宿主不碰任何项目数据（这也是「切视图即销毁重建」的
 * 来源：`@switch` 换分支会杀掉上一视图实例，切回来重新加载数据）。
 *
 * 唯一例外是页头 title：它读 `account.space()` 拿项目名（宿主不加载数据，但根空间本身是
 * `account` 已经有的信号，读一下不算「碰项目数据」）。切项目时（左侧列表）它会跟着变。
 */
@Component({
  selector: 'projects-detail',
  standalone: true,
  templateUrl: './project.component.html',
  styleUrl: './project.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzRadioModule,
    FormsModule,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    ProjectTableViewComponent,
    ProjectTreeViewComponent,
    Project3dViewComponent,
  ],
})
export class ProjectComponent {
  /** 当前选中的视图，默认「表格」。 */
  protected readonly viewMode = signal<ProjectView>('table');

  /** 返回上一页（通常是项目列表），挂在页头的返回箭头上。 */
  protected readonly location = inject(Location);

  private readonly account = inject(AccountService);

  /** 页头 title 的项目名：跟着 `account.space()` 走（空/未选项目时模板里退回 `'项目'` 键）。 */
  protected readonly projectName = computed(() => this.account.space().name);

  protected onViewChange(value: ProjectView | string): void {
    if (value === 'table' || value === 'tree' || value === '3d') {
      this.viewMode.set(value);
    }
  }
}
