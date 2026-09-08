import {Service, Property} from '@openxiot/xiot-core-spec-ts';

export interface IPropertyData {
  did: string;
  service: Service;
  property: Property;
}
