import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {Property, Service} from '@openxiot/xiot-core-spec-ts';
import {FormsModule} from "@angular/forms";

@Component({
    selector: 'debugger-property-default-value',
    templateUrl: './property-value.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
        FormsModule,
    ]
})
export class PropertyValueComponent {
  @Input() service!: Service;
  @Input() property!: Property;

  getProperty(iid: number): Property | undefined {
    return this.service?.properties.get(iid);
  }
}
