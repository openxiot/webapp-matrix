import { SpaceGraph } from '../../define/device/SpaceGraph';
import { SpaceEntityCodec } from '../space/SpaceEntityCodec';
import { DeviceEntityCodec } from './DeviceEntityCodec';
import { GenericServiceCodec } from '../service/GenericServiceCodec';

export class SpaceGraphCodec {
  static decode(o: any): SpaceGraph {
    const x = new SpaceGraph();

    x.spaces = SpaceEntityCodec.decodeArray(o.spaces);
    x.devices = DeviceEntityCodec.decodeArray(o.devices);
    x.services = GenericServiceCodec.decodeArray(o.services);

    return x;
  }
}
