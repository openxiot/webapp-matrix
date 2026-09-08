import {Component, EventEmitter, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {NzInputDirective} from 'ng-zorro-antd/input';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';

@Component({
    selector: 'property-write-string-value',
    templateUrl: './property.write.string.value.component.html',
    styleUrls: ['./property.write.string.value.component.less'],
    imports: [
        NzInputDirective,
        ReactiveFormsModule,
        FormsModule
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyWriteStringValueComponent {

  value: any = '';

  @Input() property: Property | undefined;

  @Output() valueChange = new EventEmitter<any>();

  onValueChanged($event: any) {
    this.valueChange.emit(this.value);
  }
}
