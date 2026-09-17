import { Service, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OxResponse } from './response/OxResponse';
import { DashboardLayout, DashboardWidget } from '../typedef/define/dashboard/DashboardLayout';
import { DashboardCatalog } from '../typedef/define/dashboard/DashboardCatalog';
import { DashboardCatalogCodec } from '../typedef/codec/dashboard/DashboardCatalogCodec';
import { DashboardLayoutCodec } from '../typedef/codec/dashboard/DashboardLayoutCodec';
import { DashboardWidgetData } from '../typedef/define/dashboard/DashboardWidgetData';
import { DashboardWidgetDataCodec } from '../typedef/codec/dashboard/DashboardWidgetDataCodec';

/**
 * 自定义数据看板（后端 DashboardResource，端点 `/matrix/v1/dashboard`）。
 *
 * **读写权限不对称**，这是本功能唯一的权限口径：
 * - `layout`：**空间成员**可读（看板人人可见），**空间管理员**才能 `save` / `reset`
 *   （布局是空间共享一份，改它影响所有人）。
 * - `render`：空间成员。
 *
 * 空间 ID 一律传**当前项目的根空间**（`account.space().id`）。路径上给子空间时后端也归到同一个
 * 项目 —— 但前端没有理由这么做，看板挂在项目上。
 *
 * `save` 的失败（不是管理员、版本冲突）由 `OxHttpInterceptor` 抛成 errored Observable，
 * 所以这里不检查 `success`；调用方 catch 到的 `error.message` 就是后端那句英文。
 */
@Service()
export class DashboardService {
  private server: string = environment.server;
  private http = inject(HttpClient);

  /**
   * 读布局（GET /layout/{spaceId}）。
   *
   * **从未配置过的空间不报错**：后端给一份内存生成的预置布局（版本号 `0`），
   * 用户第一次打开就有东西可看。所以「空看板」这个状态在正常路径上不会出现。
   */
  layout(spaceId: string): Observable<DashboardLayout> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/dashboard/layout/${encodeURIComponent(spaceId)}`)
      .pipe(map((r) => DashboardLayoutCodec.decode(r.data)));
  }

  /**
   * 保存布局（PUT /layout/{spaceId}，整体替换）。
   *
   * **`version` 是乐观锁**，`DashboardLayoutCodec.encode` 会把读到的原值带上；对不上时后端
   * 报「已被他人修改，请重新加载」而不是覆盖。返回保存**之后**的布局（版本号已 +1），
   * 调用方应当用它替换手里那份 —— 只有这样，连存两次才不会第二次就撞版本冲突。
   */
  save(spaceId: string, layout: DashboardLayout): Observable<DashboardLayout> {
    return this.http
      .put<OxResponse>(
        `${this.server}/matrix/v1/dashboard/layout/${encodeURIComponent(spaceId)}`,
        DashboardLayoutCodec.encode(layout),
      )
      .pipe(map((r) => DashboardLayoutCodec.decode(r.data)));
  }

  /**
   * 恢复预置布局（DELETE /layout/{spaceId}）。
   *
   * 返回的是**恢复之后读到的**预置布局（版本号回到 `0`），所以「恢复默认」之后直接拿它重画
   * 即可，不必再发一次 GET —— 那中间还夹着一个「删完再读之间别人又存了一次」的竞态。
   */
  reset(spaceId: string): Observable<DashboardLayout> {
    return this.http
      .delete<OxResponse>(`${this.server}/matrix/v1/dashboard/layout/${encodeURIComponent(spaceId)}`)
      .pipe(map((r) => DashboardLayoutCodec.decode(r.data)));
  }

  /**
   * 编辑器要的候选清单（GET /catalog/{spaceId}）：本项目的设备与服务。
   *
   * **进编辑态时取一次**，不是每次刷新都拉 —— 它只服务于表单的下拉与磁贴摘要。
   * 与 `layout` 同口径（空间成员可读），且候选范围与保存时的归属校验逐字一致
   * （后端按根空间的**子树**取），否则会出现「选得到、存不进」。
   */
  catalog(spaceId: string): Observable<DashboardCatalog> {
    return this.http
      .get<OxResponse>(`${this.server}/matrix/v1/dashboard/catalog/${encodeURIComponent(spaceId)}`)
      .pipe(map((r) => DashboardCatalogCodec.decode(r.data)));
  }

  /**
   * 取数（POST /render/{spaceId}）。
   *
   * **不传 `widgets` = 渲染已存布局**，这是看板自动刷新的用法：页面上那张卡是几分钟前读的，
   * 而刷新应当取**当前**布局，否则管理员刚改完、别人的页面还停在旧卡片上。
   *
   * 传 `widgets` = **编辑器预览**：渲染一份尚未保存的草稿，不落库（改十次预览不该写十次）。
   *
   * 请求体**总是要发一个 JSON 对象**（发 `{}`），不能发裸 POST：后端这个方法消费
   * `application/json`，没有 body 会在进入方法体之前就被框架以 415 拒掉。
   */
  render(spaceId: string, draft?: DashboardWidget[]): Observable<DashboardWidgetData> {
    // 草稿也走 encodeWidget：`w`/`h` 不发（服务端按 size 覆盖）、空标题不发。
    // 让调用方自己 encode 就等于把这些规则复制到每个预览入口上
    const body = draft ? { widgets: draft.map((w) => DashboardLayoutCodec.encodeWidget(w)) } : {};
    return this.http
      .post<OxResponse>(
        `${this.server}/matrix/v1/dashboard/render/${encodeURIComponent(spaceId)}`,
        body,
      )
      .pipe(map((r) => DashboardWidgetDataCodec.decode(r.data)));
  }
}
