import {DeviceDefinition, DeviceInstance, DeviceTemplate, DeviceType, LifeCycle} from '@openxiot/xiot-core-spec-ts';
import {ServiceInstanceHelper} from './ServiceInstanceHelper';

export class ProductInstanceHelper {

  static fromTemplate(language: string, organization: string, model: string, template: DeviceTemplate): DeviceInstance {
    const type: DeviceType = new DeviceType(`urn:${template.type.ns}:device:${template.type.name}:${template.type.shortUUID()}:${organization}:${model}:1`);
    const description: Map<string, string> = new Map();
    description.set(language, template.description.get(language) || '');

    const instance = new DeviceInstance(type, description, []);
    instance.lifecycle = LifeCycle.DEVELOPMENT;

    for (let service of template.getServices()) {
      const s = ServiceInstanceHelper.fromTemplate(language, organization, model, service);
      instance.services.set(s.iid, s);
    }

    return instance;
  }

  static fromDefinition(language: string, organization: string, model: string, def: DeviceDefinition): DeviceInstance {
    const t = `urn:${def.type.ns}:device:${def.type.name}:${def.type.shortUUID()}:${organization}:${model}:1`;
    const type: DeviceType = new DeviceType(t);
    const description: Map<string, string> = new Map();
    description.set(language, def.description.get(language) || '');

    const instance = new DeviceInstance(type, description, []);
    instance.lifecycle = LifeCycle.DEVELOPMENT;

    return instance;
  }
}
