import {EventTemplate, Event, Argument, EventType} from '@openxiot/xiot-core-spec-ts';

export class EventInstanceHelper {

  static fromTemplate(language: string, organization: string, model: string, template: EventTemplate): Event {
    const type: EventType = new EventType(`urn:${template.type.ns}:event:${template.type.name}:${template.type.shortUUID()}:${organization}:${model}:1`);
    const description: Map<string, string> = new Map();
    description.set(language, template.description.get(language) || '');

    const args: Argument[] = [];

    for (let argument of template.getArguments()) {
      args.push(Argument.of(argument.piid, argument.minRepeat, argument.maxRepeat));
    }

    return new Event(template.iid, type, description, args);
  }
}
