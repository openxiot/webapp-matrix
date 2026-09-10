import { SpaceRef } from '../../define/space/SpaceRef';

export class SpaceRefCodec {
  static decode(o: any): SpaceRef {
    const x = new SpaceRef();

    if (o) {
      x.spaceId = o.spaceId || '';
      x.rootId = o.rootId || '';
    }

    return x;
  }

  static encode(x: SpaceRef): any {
    return {
      spaceId: x.spaceId,
      rootId: x.rootId,
    };
  }
}
