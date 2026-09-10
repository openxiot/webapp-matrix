import { GenericService } from '../../define/service/GenericService';

export class GenericServiceCodec {
  static decode(o: any): GenericService {
    const x = new GenericService();

    x.id = o.id || '';
    x.name = o.name || '';
    x.type = o.type || '';
    x.did = o.did || '';
    x.spaceId = o.spaceId || '';

    return x;
  }

  static encode(x: GenericService): any {
    return {
      id: x.id,
      name: x.name,
      type: x.type,
      did: x.did,
      spaceId: x.spaceId,
    };
  }

  static decodeArray(array: Object): GenericService[] {
    const list: GenericService[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(GenericServiceCodec.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: GenericService[]): any {
    return list.map((x) => GenericServiceCodec.encode(x));
  }
}
