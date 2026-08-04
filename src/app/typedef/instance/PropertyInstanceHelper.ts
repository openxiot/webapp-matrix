import {Property, PropertyTemplate, PropertyType} from '@openxiot/xiot-core-spec-ts';

export class PropertyInstanceHelper {

  static fromTemplate(language: string, organization: string, model: string, template: PropertyTemplate): Property {
    const iid: number = template.iid;
    const type: PropertyType = new PropertyType(`urn:${template.type.ns}:property:${template.type.name}:${template.type.shortUUID()}:${organization}:${model}:1`);
    const description: Map<string, string> = new Map();
    description.set(language, template.description.get(language) || '');
    const instance = new Property(iid, type, description, template.format, template.access, template.constraintValue, template.unit, template.members);

    const list = instance.valueList();
    if (list !== null) {
      for (let value of list.values) {
        const description: Map<string, string> = new Map();
        description.set(language, value.description.get(language) || '');
        value.description = description;
      }
    }

    return instance;
  }
}
