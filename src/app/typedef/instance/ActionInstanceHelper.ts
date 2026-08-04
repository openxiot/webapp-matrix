import {Action, ActionTemplate, ActionType, Argument} from '@openxiot/xiot-core-spec-ts';

export class ActionInstanceHelper {

  static fromTemplate(language: string, organization: string, model: string, template: ActionTemplate): Action {
    const type: ActionType = new ActionType(`urn:${template.type.ns}:action:${template.type.name}:${template.type.shortUUID()}:${organization}:${model}:1`);
    const description: Map<string, string> = new Map();
    description.set(language, template.description.get(language) || '');

    const argumentsIn: Argument[] = [];

    for (let argument of template.getArgumentsIn()) {
      argumentsIn.push(Argument.of(argument.piid, argument.minRepeat, argument.maxRepeat));
    }

    const argumentsOut: Argument[] = [];

    for (let argument of template.getArgumentsOut()) {
      argumentsOut.push(Argument.of(argument.piid, argument.minRepeat, argument.maxRepeat));
    }

    return new Action(template.iid, type, description, argumentsIn, argumentsOut);
  }
}
