import {Action, Service} from '@openxiot/xiot-core-spec-ts';

export interface IActionData {
  did: string;
  service: Service;
  action: Action;
}
