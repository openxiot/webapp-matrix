import { ModelAnchor } from '../../define/model/ModelAnchor';

export class ModelAnchorCodec {
  /** 没有锚点（存量数据）或字段不成形时一律返回 `null`，让调用方走回退链 */
  static decode(o: any): ModelAnchor | null {
    if (!o || typeof o !== 'object') {
      return null;
    }

    const x = new ModelAnchor();
    x.model = o.model || '';
    x.rev = o.rev || '';
    x.x = o.x ?? 0;
    x.y = o.y ?? 0;
    x.z = o.z ?? 0;
    if (o.ry !== undefined && o.ry !== null) {
      x.ry = o.ry;
    }

    return x;
  }

  static encode(x: ModelAnchor | null): any {
    if (!x) {
      return null;
    }

    return {
      model: x.model,
      rev: x.rev,
      x: x.x,
      y: x.y,
      z: x.z,
      ry: x.ry ?? null,
    };
  }
}
