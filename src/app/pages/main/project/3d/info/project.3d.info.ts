import { DeviceEntity } from '../../../../../typedef/define/device/DeviceEntity';
import { SpaceEntity } from '../../../../../typedef/define/space/SpaceEntity';
import { type AnchorMarker, devicesInSpace, spaceAnchor, spacePath } from '../anchor/project.3d.anchor';
import type { MarkerRect } from '../scene/project.3d.scene';

/**
 * 信息面板的内容与摆位。纯函数，不依赖 Angular，可单测。
 *
 * 面板有两条来路，都在这里出料：
 *
 * 1. **悬停一块** —— {@link spaceInfo} / {@link deviceInfo} + {@link placePanel}，
 *    由组件的 `hover` 用；
 * 2. **「显示信息」铺开一片** —— {@link buildPanels} + {@link placePanels}，
 *    画面上每个标记一块。两者共用同一套 `spaceInfo` / `deviceInfo` / `placePanel`，
 *    所以悬停看到的那块和铺开时看到的那块**必然是同一块**，不会两处两样。
 *
 * 面板上**写什么、写几行**在这里定死，组件只负责把结果画出来。这么做是因为
 * 这些行全是「从实体上挑几个字段拼成文字」，正是最容易悄悄写错的地方 ——
 * 比如「设备数量」，同一块画面上角标、菜单、弹窗都会报这个数，各算各的就会各报各的
 * （见 {@link devicesInSpace}）。放在纯模块里，有 spec 盯着。
 *
 * ⚠️ 面板是**只读**的：这里不产生任何动作，要改东西走点击菜单。
 */

/** 面板里的一行 */
export interface InfoRow {
  label: string;
  value: string;
  /**
   * 值前面那颗小圆点的语义。
   *
   * 只用来上色，**信息不能只靠它** —— 在线状态必须同时写在 `value` 里
   * （「在线」/「离线」两个字），色盲用户和黑白打印都还得看得出。
   */
  tone?: 'online' | 'offline';
}

export interface InfoPanel {
  title: string;
  /** 标题下的那行灰字，如空间路径。空字符串 = 不显示这一行 */
  subtitle: string;
  rows: InfoRow[];
}

/**
 * 面板贴哪儿。同一根轴只会给一个值，另一个是 `null` —— 由 {@link placePanel} 决定。
 */
export interface PanelPlacement {
  left: number;
  /** 与 {@link bottom} 二选一：标签在上半屏时给这个 */
  top: number | null;
  /** 与 {@link top} 二选一：标签在下半屏时给这个 */
  bottom: number | null;
}

/** 面板需要的翻译与取名。由组件把 `TranslateService.instant` 与显示服务递进来 */
export interface InfoText {
  t: (key: string) => string;
  /** 设备显示名，与标记上写的**必须**是同一个（都走 DeviceDisplayService.name） */
  deviceName: (device: DeviceEntity) => string;
  deviceModel: (device: DeviceEntity) => string;
}

/**
 * 一块已经算好内容的面板，以及它属于哪个**标记**（{@link AnchorMarker.id}）。
 *
 * 认标记 id 而不是实体 id：摆位要按标记的矩形去查（见 {@link placePanels}），
 * 而矩形表就是按标记 id 建的。
 */
export interface PanelEntry {
  id: string;
  panel: InfoPanel;
}

/**
 * 内容 + 摆位。模板直接画这个。
 *
 * 比悬停那条路径多一个 `id`（那边直接返回 `{ panel, placement }`）——
 * 铺开时要 `@for ... track` 用，且**只有这里有 id 可 track**。
 */
export interface PanelView extends PanelEntry {
  placement: PanelPlacement;
}

/**
 * 坐标显示成 `1.234, -2.250, 3.000`。
 *
 * 一律三位小数：菜单里点模型表面时的副标题也是它，两处必须一样 ——
 * 同一个点在一处显示 1.23、另一处 1.234 会让人以为说的是两个地方。
 */
export function formatPoint(point: { x: number; y: number; z: number }): string {
  const round = (value: number) => value.toFixed(3);
  return `${round(point.x)}, ${round(point.y)}, ${round(point.z)}`;
}

/**
 * 一个**空间**标签的面板写什么。悬停和「显示信息」铺开两条路径共用。
 *
 * 路径放在副标题里**不带标签**（就一个 `园区 / A栋 / 3层`），和点击菜单的副标题
 * 一个样子；为此也不需要「路径」这个 i18n 键。
 *
 * 空间类型**刻意不放**：全项目现有的两份类型标签助手互相矛盾
 * （`SpaceUtils.typeLabel` 说 site 是「站点」且无人使用，`project.component` 里的
 * `SPACE_TYPE_LABELS` 说 site 是「项目」且在用），再写第三份只会更乱。
 * 要用得先把那两份合并。
 */
export function spaceInfo(
  space: SpaceEntity,
  spaceById: Map<string, SpaceEntity>,
  devices: DeviceEntity[],
  text: InfoText,
): InfoPanel {
  // 用 spaceAnchor 而不是直接读 space.anchor：模型换了版本之后老坐标是失效的，
  // 那个锚点不会被画在模型上。面板里却报出一个画面**上根本不存在**的位置，
  // 只会让人以为标记丢了。判定规则归 project.3d.anchor.ts 管，这里只管显示。
  const anchor = spaceAnchor(space);
  return {
    title: space.name,
    subtitle: spacePath(space, spaceById),
    rows: compact([
      // 「设备数量」= 这个空间**拥有**几台，与设备有没有单独标点无关 ——
      // 和空间角标、菜单的「设备 N 台」、空间设备弹窗是同一个口径（都走
      // {@link devicesInSpace}），四处永远一致。
      row(text.t('设备数量'), String(devicesInSpace(devices, space.id).length)),
      anchor && row(text.t('模型位置'), formatPoint(anchor)),
    ]),
  };
}

/**
 * 一个**设备**标签的面板写什么。悬停和「显示信息」铺开两条路径共用。
 *
 * 设备所在的空间同样走副标题，所以**不再单出一行「所在空间」** ——
 * 一行里写两遍同一个路径是白占位置。
 */
export function deviceInfo(
  device: DeviceEntity,
  spaceById: Map<string, SpaceEntity>,
  text: InfoText,
): InfoPanel {
  const spaceId = device.space?.spaceId;
  const space = spaceId ? spaceById.get(spaceId) : undefined;
  return {
    title: text.deviceName(device),
    // 空间查不到（设备挂在别处、或空间图还没到）就是空副标题，不编一个出来
    subtitle: space ? spacePath(space, spaceById) : '',
    rows: compact([
      row(text.t('状态'), text.t(device.online ? '在线' : '离线'), device.online ? 'online' : 'offline'),
      row(text.t('产品型号'), text.deviceModel(device)),
      row(text.t('设备ID'), device.did),
    ]),
  };
}

/**
 * 给画面上**每个**标记配一块面板 —— 「显示信息」勾上之后铺的就是这一批。
 *
 * 输入是 {@link AnchorMarker}（画面上真有的标记），不是全部空间和设备：
 * 于是图层开关关掉的东西天然不在这里，不必另写一套可见性判断。
 *
 * 查不到的实体**跳过**：空间图每次写完都整棵重拉，标记和实体之间有一个短暂的空档，
 * 期间翻开关就会碰上。少画一块，比画一块空白的好。
 *
 * ⚠️ **设备认 `deviceId` 不认 `id`。** 「显示设备」列在空间标签下的那些行，
 * id 是 `空间id@did`（见 {@link spaceDeviceKey}），拿它去 `deviceById` 查必然查不到 ——
 * 而且是静默地少画一块，看不出错。悬停那条路径（组件的 `onMarkerHover`）踩过同一个坑。
 *
 * ⚠️ **同一个 id 只出一块**（首个胜出）。引擎那边 `markers` 是个 Map，天生去重；
 * 这里直出数组，不去重就与引擎不一致了。而后果是静默的：模板按 `view.id` 跟踪，
 * 撞键时 Angular 只 `console.warn`（NG0955）然后**少画一块** —— 一个 id 一个标签，
 * 本来就只该有一块面板。
 */
export function buildPanels(
  markers: AnchorMarker[],
  spaceById: Map<string, SpaceEntity>,
  deviceById: Map<string, DeviceEntity>,
  devices: DeviceEntity[],
  text: InfoText,
): PanelEntry[] {
  const entries: PanelEntry[] = [];
  const seen = new Set<string>();
  for (const marker of markers) {
    if (seen.has(marker.id)) {
      continue;
    }
    if (marker.kind === 'space') {
      const space = spaceById.get(marker.spaceId);
      if (space) {
        seen.add(marker.id);
        entries.push({ id: marker.id, panel: spaceInfo(space, spaceById, devices, text) });
      }
      continue;
    }
    const device = marker.deviceId ? deviceById.get(marker.deviceId) : undefined;
    if (device) {
      seen.add(marker.id);
      entries.push({ id: marker.id, panel: deviceInfo(device, spaceById, text) });
    }
  }
  return entries;
}

/**
 * 这个矩形算不算「画面上真看得见的一个标签」。
 *
 * 铺开那一片必须过这一关，悬停那一块不必 —— 鼠标只能停在看得见的标签上。
 *
 * 两条都要挡，而且**两条都不是理论上的**，都是铺开之后才第一次碰上的：
 *
 * 1. **零尺寸**。标记转到镜头背后时 CSS2DRenderer 会给它 `display: none`
 *    （见引擎里 `syncAllRects` 的注释），而 `display: none` 的元素量出来四个数全是 0，
 *    减掉画布原点之后就是一对负数。这种「矩形」`placePanel` 照单全收，
 *    然后在容器边上摆出一块没有主的空面板 —— 转个视角就冒一个。
 * 2. **整个在容器外**。标签被裁在画布外面时 `getBoundingClientRect` 照样有值
 *    （父层的 `overflow: hidden` 不改矩形）。横向那条「右边放不下就翻到左边」
 *    会把它夹回容器内（`Math.max` 那一下），于是凭空多出一块**位置正当、
 *    却没有对应标签**的面板。纵向那半边不会：下半屏锚的是 `bottom`，
 *    标签在容器下面时 `bottom` 直接是负的，自己就出界了 —— 只补横向这一半。
 */
export function isMarkerVisible(
  rect: MarkerRect,
  container: { width: number; height: number },
): boolean {
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  return (
    rect.x + rect.width > 0 &&
    rect.x < container.width &&
    rect.y + rect.height > 0 &&
    rect.y < container.height
  );
}

/**
 * 给每块面板算摆位。「显示信息」铺开的那一批走这里，一块一块地过 {@link placePanel}。
 *
 * **没有矩形的那块直接丢掉。** 矩形的来源是引擎每帧的上报，而开关刚勾上、标记刚加进来
 * 的那一下表里还是空的；不丢的话 `placePanel` 会拿到 `undefined`，面板一闪在容器的
 * 左上角 —— 正是组件的 `hover` 注释里说的那种「先看到有内容、没位置的中间态」。
 * 下一帧矩形到了，它自己就补上。
 *
 * 有矩形也还得过 {@link isMarkerVisible}：镜头背后的、被裁到画布外的标记量出来
 * 也有「矩形」，照摆就会在容器边上留下一块没有主的空面板。
 *
 * 矩形表里的条目**比面板多**是正常的（标记刚被删掉、这一帧还没重报），
 * 这里按面板去查表，多的那些自然用不上，不必清理。
 */
export function placePanels(
  entries: PanelEntry[],
  rects: ReadonlyMap<string, MarkerRect>,
  container: { width: number; height: number },
): PanelView[] {
  const views: PanelView[] = [];
  for (const entry of entries) {
    const rect = rects.get(entry.id);
    if (rect && isMarkerVisible(rect, container)) {
      views.push({ ...entry, placement: placePanel(rect, container) });
    }
  }
  return views;
}

/**
 * 造一行；**值为空就返回 null**（由 {@link compact} 丢掉）。
 *
 * 有些字段是解析出来的，可能取不到（如产品型号取自 DeviceType URN 的 model 段）。
 * 留着的话面板上会出现一行只有标签、冒号后面空着的，看着像坏了。
 */
function row(label: string, value: string, tone?: InfoRow['tone']): InfoRow | null {
  return value ? { label, value, tone } : null;
}

/**
 * 面板宽度（CSS 像素）。
 *
 * ⚠️ **必须与样式表里 `.h3d-info` 的 `width` 一致。** 摆位那笔账要提前知道面板
 * 有多宽才算得出「右边放不放得下」，而量的代价是「先渲染再回流」—— 一个定值换掉
 * 一次回流是划算的，代价就是这处两边要对上。
 */
export const INFO_PANEL_WIDTH = 200;

/** 面板与标签之间留的空隙 */
const PANEL_GAP = 10;

/** 面板离容器边缘至少留这么多，别贴着边 */
const PANEL_MARGIN = 8;

/**
 * 面板摆哪儿：贴着标签的一侧。
 *
 * 四个方向里同一根轴只给一个值，另一个是 `null`（交给 CSS 的 `auto`）——
 * 这是刻意的，纵向因此**不需要知道面板多高**：标签在上半屏就锚 `top` 往下方长，
 * 在下半屏就锚 `bottom` 往上方长。高度是内容撑出来的，量它就要先渲染再回流。
 *
 * 横向反过来，是**算出来的**：面板宽度是个定值（见 {@link INFO_PANEL_WIDTH}），
 * 所以能提前判断右边放不放得下 —— 放不下就翻到标签左边，再放不下才贴左边界。
 * 只锚右边（用 `right`）就不用管宽度，但那要求先知道放不放得下，还是回到同一个问题。
 */
export function placePanel(
  label: MarkerRect,
  container: { width: number; height: number },
  panelWidth: number = INFO_PANEL_WIDTH,
): PanelPlacement {
  const fitsRight =
    label.x + label.width + PANEL_GAP + panelWidth <= container.width - PANEL_MARGIN;
  const left = fitsRight
    ? label.x + label.width + PANEL_GAP
    : Math.max(PANEL_MARGIN, label.x - PANEL_GAP - panelWidth);

  const above = label.y + label.height / 2 >= container.height / 2;
  return above
    ? { left, top: null, bottom: container.height - label.y - label.height }
    : { left, top: label.y, bottom: null };
}

function compact(rows: (InfoRow | null)[]): InfoRow[] {
  return rows.filter((item): item is InfoRow => item !== null);
}
