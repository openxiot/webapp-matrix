import {Service, ServiceTemplate, ServiceType} from '@openxiot/xiot-core-spec-ts';
import {EventInstanceHelper} from './EventInstanceHelper';
import {ActionInstanceHelper} from './ActionInstanceHelper';
import {PropertyInstanceHelper} from './PropertyInstanceHelper';

export class ServiceInstanceHelper {

  static fromTemplate(language: string, organization: string, model: string, template: ServiceTemplate): Service {
    const iid: number = template.iid;
    const type: ServiceType = new ServiceType(`urn:${template.type.ns}:service:${template.type.name}:${template.type.shortUUID()}:${organization}:${model}:1`);
    const description: Map<string, string> = new Map();
    description.set(language, template.description.get(language) || '');

    const service = new Service(iid, type, description, [], [], []);

    for (let property of template.getProperties()) {
      const p = PropertyInstanceHelper.fromTemplate(language, organization, model, property);
      service.properties.set(p.iid, p);
    }

    for (let action of template.getActions()) {
      const a = ActionInstanceHelper.fromTemplate(language, organization, model, action);
      service.actions.set(a.iid, a);
    }

    for (let event of template.getEvents()) {
      const e = EventInstanceHelper.fromTemplate(language, organization, model, event);
      service.events.set(e.iid, e);
    }

    return service;
  }
}
