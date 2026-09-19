import { Component, computed, inject, signal } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSegmentedModule } from 'ng-zorro-antd/segmented';
import { NzIconDirective } from 'ng-zorro-antd/icon';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { MainI18nService } from '../../../service/i18n.service';
import { ProjectTableViewComponent } from './table/project.table.component';
import { ProjectTreeViewComponent } from './tree/project.tree.component';
import { Project3dViewComponent } from './3d/project.3d.component';

/** 项目页的三种视图。 */
type ProjectView = 'table' | 'tree' | '3d';

/**
 * 项目页宿主 —— **薄壳**：只负责页头（返回 / 面包屑 / 三视图切换）和按当前视图渲染对应的子组件。
 *
 * 三个视图（表格 / 树 / 3D）是平级子组件，**各自按 `account.space()` 加载当前项目**、自判定
 * `isAdmin`、自持有管理员写操作对话框 —— 宿主不碰任何项目数据（这也是「切视图即销毁重建」的
 * 来源：`@switch` 换分支会杀掉上一视图实例，切回来重新加载数据）。
 */
@Component({
  selector: 'projects-detail',
  standalone: true,
  templateUrl: './project.component.html',
  styleUrl: './project.component.less',
  imports: [
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSegmentedModule,
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

  private readonly i18n = inject(MainI18nService);

  /** 返回上一页（通常是项目列表），挂在页头的返回箭头上。 */
  protected readonly location = inject(Location);

  /**
   * segmented 的选项文案只能在 TS 里翻，所以跟语言信号重算（`history.component` 那个口径）。
   * 「表格 / 树 / 3D」三个键里「表格」已在词典，「树 / 3D」是本页补的。
   */
  protected readonly viewOptions = computed<
    { label: string; value: ProjectView }[]
  >(() => {
    void this.i18n.currentLang();
    const t = this.i18n.translate.instant.bind(this.i18n.translate);
    return [
      { label: t('表格'), value: 'table' },
      { label: t('树'), value: 'tree' },
      { label: t('3D'), value: '3d' },
    ];
  });

  protected onViewChange(value: ProjectView | string): void {
    if (value === 'table' || value === 'tree' || value === '3d') {
      this.viewMode.set(value);
    }
  }
}
