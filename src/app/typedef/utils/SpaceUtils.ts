const TYPE_LABELS: Record<string, string> = {
  site: '站点',
  building: '楼栋',
  floor: '楼层',
  room: '房间',
  zone: '区域',
  field: '场地',
  workshop: '车间',
  parking: '停车场',
};

const TYPE_ICONS: Record<string, string> = {
  site: 'home',
  building: 'bank',
  floor: 'appstore',
  room: 'shop',
  zone: 'environment',
};

export class SpaceUtils {
  static typeLabel(type: string): string {
    return TYPE_LABELS[type] || type || '空间';
  }

  static typeIcon(type: string): string {
    return TYPE_ICONS[type] || 'folder';
  }
}
