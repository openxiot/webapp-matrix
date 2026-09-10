import { ModbusService } from '../../define/modbus/ModbusService';
import { ModbusPerson } from '../../define/modbus/Modbus';
import { ModbusServiceDeviceCodec } from './ModbusServiceDeviceCodec';
import { ModbusServiceFunctionCodec } from './ModbusServiceFunctionCodec';

/**
 * Modbus 服务与 JSON 的互转（对应后端 ModbusServiceCodec）。
 *
 * decode 用于读取：主键是十六进制字符串，子结构逐个委派给各自的 Codec。
 * encode 用于请求体：id / orgId / creator / updater 不由请求体决定（id 由后端生成、org 取 X-Org-Id、
 * 人员取当前登录用户），故不输出。
 */
export class ModbusServiceCodec {
  static decode(o: any): ModbusService {
    const x = new ModbusService();

    if (o.id != null) {
      x.id = o.id;
    }
    if (o.orgId != null) {
      x.orgId = o.orgId;
    }
    x.name = o.name || '';
    if (o.version != null) {
      x.version = o.version;
    }
    if (o.configId != null) {
      x.configId = o.configId;
    }
    x.device = ModbusServiceDeviceCodec.decode(o.device);
    x.functions = ModbusServiceFunctionCodec.decodeArray(o.functions);
    if (o.creator != null) {
      x.creator = ModbusServiceCodec.decodePerson(o.creator);
    }
    if (o.updater != null) {
      x.updater = ModbusServiceCodec.decodePerson(o.updater);
    }

    return x;
  }

  static encode(x: ModbusService): any {
    const o: any = {
      name: x.name,
      device: ModbusServiceDeviceCodec.encode(x.device),
      functions: ModbusServiceFunctionCodec.encodeArray(x.functions),
    };
    // version：新建固定 1、编辑沿用服务里原版本，两者都由前端填在请求体里
    if (x.version != null) {
      o.version = x.version;
    }
    if (x.configId != null && x.configId !== '') {
      o.configId = x.configId;
    }
    return o;
  }

  static decodeArray(array: Object): ModbusService[] {
    const list: ModbusService[] = [];

    if (array instanceof Array) {
      for (const item of array) {
        list.push(ModbusServiceCodec.decode(item));
      }
    }

    return list;
  }

  private static decodePerson(o: any): ModbusPerson {
    const p: ModbusPerson = {};

    if (o.id != null) {
      p.id = o.id;
    }
    if (o.name != null) {
      p.name = o.name;
    }
    if (o.timestamp != null) {
      p.timestamp = o.timestamp;
    }

    return p;
  }
}
