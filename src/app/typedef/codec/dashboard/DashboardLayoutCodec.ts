import {
  DashboardLayout,
  DashboardPerson,
  DashboardWidget,
  WidgetSize,
  WidgetType,
} from '../../define/dashboard/DashboardLayout';

/**
 * 看板布局与 JSON 的互转。**要编也要解** —— 与其他只解的 codec 不同：布局是整个看板里
 * 唯一由前端写回后端的数据（PUT `/layout`），所以 `encode` 是与 `decode` 同等重要的一半。
 *
 * 三条口径：
 * - **`decode` 什么都不补**：`title` 没设就保持 `undefined`（不是空串），`creator` 没下发就不要这个键。
 *   「没设」与「设成了空」在编辑器里是两件事 —— 后者会显示成一片空白标题，前者会退回默认名。
 * - **`encode` 只发该发的**：`spaceId` 与 `creator` / `updater` 不带（服务端从路径与 JWT 取，
 *   客户端说了不算）。**`version` 必须带**：它是乐观锁，漏了后端按「首次保存」处理，
 *   别人的改动会被无声覆盖。
 * - **线格式里没有坐标**（顺序即位置）：`widgets` 的**数组顺序**本身就是排版信息，
 *   故编码就是按顺序 map，一个字节都不多。老文档里存着的 `widgets[].layout` 读的时候
 *   **不认识就丢掉**（Mongo 的 POJO codec 与 `@JsonIgnoreProperties` 都跳过未知键），
 *   第一次保存就把它洗掉了 —— 不需要迁移。
 */
export class DashboardLayoutCodec {
  static decode(o: any): DashboardLayout {
    const x = new DashboardLayout();
    x.spaceId = o?.spaceId ?? '';
    x.version = o?.version ?? 0;
    x.widgets = DashboardLayoutCodec.decodeWidgets(o?.widgets);
    x.creator = DashboardLayoutCodec.decodePerson(o?.creator);
    x.updater = DashboardLayoutCodec.decodePerson(o?.updater);
    return x;
  }

  static decodeWidgets(rows: any): DashboardWidget[] {
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.map((row) => DashboardLayoutCodec.decodeWidget(row));
  }

  static decodeWidget(o: any): DashboardWidget {
    const x = new DashboardWidget();
    x.id = o?.id ?? '';
    x.type = TYPES.includes(o?.type) ? (o.type as WidgetType) : 'stat';
    // 缺 title / titleKey 就是 undefined：预置布局的卡片靠 titleKey 显示名字，
    // 用户改过的卡片靠自己那份 title，两者都空时由页面按 type 兜底
    x.title = typeof o?.title === 'string' ? o.title : undefined;
    x.titleKey = typeof o?.titleKey === 'string' ? o.titleKey : undefined;
    x.size = SIZES.includes(o?.size) ? (o.size as WidgetSize) : 'S';
    x.refresh = typeof o?.refresh === 'number' ? o.refresh : undefined;
    // config 原样收下：它异构，按 type 断言是渲染侧的事（见 DashboardWidget 的说明）
    x.config = o?.config && typeof o.config === 'object' ? { ...o.config } : {};
    return x;
  }

  static decodePerson(o: any): DashboardPerson | undefined {
    // 整个键缺失（预置布局没有作者）时不要造一个空壳 —— 页面据此判断「显不显示作者」，
    // 一个 {id: undefined} 会让它显示出一行空白
    if (!o || typeof o !== 'object') {
      return undefined;
    }
    return { id: o.id, name: o.name, timestamp: o.timestamp };
  }

  /**
   * 保存请求体。**只发这几个键**，其余一概不发。
   *
   * 排版**一个字节都不发**：`widgets` 的数组顺序就是版式，服务端原样存下这个顺序。
   */
  static encode(layout: DashboardLayout): any {
    return {
      // 乐观锁：读到的原值原样回传，服务端比对不上就拒（而不是覆盖别人的改动）
      version: layout.version,
      widgets: layout.widgets.map((widget) => DashboardLayoutCodec.encodeWidget(widget)),
    };
  }

  static encodeWidget(widget: DashboardWidget): any {
    const body: any = {
      id: widget.id,
      type: widget.type,
      size: widget.size,
      config: widget.config ?? {},
    };
    // 空标题按「没设」处理：发一个空串上去，会被存成一个「用户把标题清空了」的卡片，
    // 之后它既不显示预置名也不显示用户名的位置 —— 而用户的本意是改回默认
    if (widget.title) {
      body.title = widget.title;
    }
    // titleKey 只在用户**没改标题**时原样带回去：它是「这张卡还挂着预置名」的记号，
    // 用户一旦自己起了名字，这张卡就是他的了，不该再留着一个会随服务端改文案而变的旧记号
    if (widget.titleKey && !widget.title) {
      body.titleKey = widget.titleKey;
    }
    if (widget.refresh !== undefined) {
      body.refresh = widget.refresh;
    }
    return body;
  }
}

const TYPES: WidgetType[] = ['stat', 'line', 'distribution', 'device', 'service'];
const SIZES: WidgetSize[] = ['S', 'M', 'L', 'XL'];
