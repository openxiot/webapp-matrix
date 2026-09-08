import {Component, EventEmitter, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {NzSwitchModule} from 'ng-zorro-antd/switch';

@Component({
    selector: 'property-write-boolean-value',
    templateUrl: './property.write.boolean.value.component.html',
    styleUrls: ['./property.write.boolean.value.component.less'],
    imports: [
        NzSwitchModule,
        ReactiveFormsModule,
        FormsModule,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyWriteBooleanValueComponent {

  value: boolean = false;

  @Input() property: Property | undefined;

  @Output() valueChange = new EventEmitter<any>();

  onValueChanged($event: any) {
    this.valueChange.emit(this.value);
  }
}
