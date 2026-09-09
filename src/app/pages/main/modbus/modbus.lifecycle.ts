import { LifeCycle } from '@openxiot/xiot-core-spec-ts';

/**
 * 生命周期（设备点表配置 / 产品共用同一套展示）：
 * 后端存储串与 xiot-spec Lifecycle 对齐（development/preview/released/undefined），
 * text 为状态文案 i18n 键（模板经 translate 管道渲染），color 为 nz-tag 颜色。
 * 与 product 详情页 LIFECYCLE_STYLE 同源。
 */
export interface LifecycleStyle {
  text: string;
  color: string;
}

const LIFECYCLE_STYLE: Record<string, LifecycleStyle> = {
  [LifeCycle.DEVELOPMENT]: { text: '开发中', color: 'processing' },
  [LifeCycle.PREVIEW]: { text: '预览', color: 'warning' },
  [LifeCycle.RELEASED]: { text: '已发布', color: 'success' },
};

/** 生命周期对应的展示样式（未收录/缺省按「未定义」处理，与 product 一致）。 */
export function lifecycleStyle(lifecycle?: string): LifecycleStyle {
  return (lifecycle && LIFECYCLE_STYLE[lifecycle]) || { text: '未定义', color: 'default' };
}

/**
 * 生命周期是否可修改：仅「开发」(development) 态可改；缺省（极早期文档未落库）视作可改。
 * 与后端门禁（released/preview 拒绝 update/delete）同口径。
 */
export function lifecycleModifiable(lifecycle?: string): boolean {
  return !lifecycle || (lifecycle !== LifeCycle.PREVIEW && lifecycle !== LifeCycle.RELEASED);
}
