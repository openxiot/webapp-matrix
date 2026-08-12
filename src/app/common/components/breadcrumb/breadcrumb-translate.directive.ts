import {Directive, OnInit, OnDestroy, inject, ChangeDetectorRef} from '@angular/core';
import {ActivatedRoute, PRIMARY_OUTLET} from '@angular/router';
import {BreadcrumbOption, NzBreadCrumbComponent} from 'ng-zorro-antd/breadcrumb';
import {TranslateService} from '@ngx-translate/core';
import {Subject, forkJoin, of} from 'rxjs';
import {map, switchMap, takeUntil} from 'rxjs/operators';

/**
 * 放置在 <nz-breadcrumb> 上，替代 nzAutoGenerate 自动从路由 data.breadcrumb 中读取 i18n key，
 * 使用 TranslateService 进行翻译，切换语言时自动更新面包屑文字。
 *
 * 用法：
 *   <nz-breadcrumb [nzAutoGenerate]="true" nz-page-header-breadcrumb appBreadcrumbTranslate></nz-breadcrumb>
 *
 * 实现原理：
 *   1. 在 constructor 中设置 nzRouteLabelFn，让组件自身的 getBreadcrumbs 直接产出翻译后的 label
 *   2. 监听语言切换事件，切换时重建面包屑并触发 OnPush 变更检测
 */
@Directive({
  selector: 'nz-breadcrumb[appBreadcrumbTranslate]',
  standalone: true,
})
export class BreadcrumbTranslateDirective implements OnInit, OnDestroy {

  private breadcrumb = inject(NzBreadCrumbComponent);
  private route = inject(ActivatedRoute);
  private translate = inject(TranslateService);
  /** 宿主组件 nz-breadcrumb 的 ChangeDetectorRef（OnPush 下需手动 markForCheck） */
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  constructor() {
    // 在 constructor 中设置翻译函数，赶在组件 ngOnInit 调用
    // registerRouterChange → getBreadcrumbs 之前生效，避免初始渲染时出现中文
    this.breadcrumb.nzRouteLabelFn = (label: string) => {
      return this.translate.instant(label);
    };
  }

  ngOnInit() {
    // 监听语言切换，触发面包屑重建
    //（路由切换由组件自身的 registerRouterChange + nzRouteLabelFn 处理）
    this.translate.onLangChange.pipe(
      switchMap(() => {
        const items = this.buildBreadcrumbs(this.route.root);
        if (items.length === 0) {
          return of([]);
        }
        return this.translateLabels(items);
      }),
      takeUntil(this.destroy$),
    ).subscribe((translated) => {
      // 组件使用 OnPush 策略，直接设置 breadcrumbs 不会触发变更检测
      this.breadcrumb.breadcrumbs = translated;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private translateLabels(items: BreadcrumbOption[]) {
    return forkJoin(
      items.map((item) =>
        this.translate.get(item.label).pipe(
          map((translated) => ({...item, label: translated})),
        ),
      ),
    );
  }

  /**
   * 与 ng-zorro NzBreadCrumbComponent.getBreadcrumbs 逻辑保持一致：
   *   - 只处理 PRIMARY_OUTLET 的子路由
   *   - 路由 URL 为空时保持父级 URL
   *   - 只 push routeUrl 和 breadcrumbLabel 都非空的面包屑
   *   - 处理完第一个匹配的子路由后立即 return（不继续遍历兄弟）
   */
  private buildBreadcrumbs(
    route: ActivatedRoute,
    url: string = '',
    breadcrumbs: BreadcrumbOption[] = [],
  ): BreadcrumbOption[] {
    const children = route.children;

    if (children.length === 0) {
      return breadcrumbs;
    }

    for (const child of children) {
      if (child.outlet === PRIMARY_OUTLET) {
        // 收集有效 path 段
        const routeUrl = child.snapshot.url
          .map((seg) => seg.path)
          .filter((p) => p)
          .join('/');

        // 路由 URL 为空则 URL 不变（懒加载模块的空路径路由）
        const nextUrl = routeUrl ? `${url}/${routeUrl}` : url;

        // 从路由 data 中读取原始 breadcrumb key，原生 getBreadcrumbs 用 nzRouteLabelFn 变换
        const breadcrumbLabel = child.snapshot.data['breadcrumb'];

        // 原生条件：只有 routeUrl 和 breadcrumbLabel 同时非空才生成面包屑
        if (routeUrl && breadcrumbLabel) {
          breadcrumbs.push({
            label: breadcrumbLabel,
            params: child.snapshot.params,
            url: nextUrl,
          });
        }

        // 【关键】与原生一致 — 只处理第一个 PRIMARY_OUTLET 子路由后立即返回
        return this.buildBreadcrumbs(child, nextUrl, breadcrumbs);
      }
    }

    return breadcrumbs;
  }

}
