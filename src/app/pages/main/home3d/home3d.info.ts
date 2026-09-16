import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { devicesInSpace, spaceAnchor, spacePath } from './home3d.anchor';
import type { MarkerRect } from './model3d.scene';

/**
 * 悬停信息面板的内容。纯函数，不依赖 Angular，可单测。
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
 * 悬停一个**空间**标签时显示什么（面板跟着那个标签走，见 {@link placePanel}）。
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
  // 只会让人以为标记丢了。判定规则归 home3d.anchor.ts 管，这里只管显示。
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
 * 悬停一个**设备**标签时显示什么（面板跟着那个标签走，见 {@link placePanel}）。
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
