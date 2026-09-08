import {Component, EventEmitter, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {NzInputNumberModule} from 'ng-zorro-antd/input-number';
import {Property} from '@openxiot/xiot-core-spec-ts';

@Component({
    selector: 'property-write-float-value',
    templateUrl: './property.write.float.value.component.html',
    styleUrls: ['./property.write.float.value.component.less'],
    imports: [
        ReactiveFormsModule,
        NzInputNumberModule,
        FormsModule,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyWriteFloatValueComponent {

  value: number = 0.0;

  @Input() property: Property | undefined;

  @Output() valueChange = new EventEmitter<any>();

  onValueChanged($event: any) {
    // this.value是字符串，ValueList一般是整型，可能需要转一下。

    if (typeof this.value === 'string') {
      this.valueChange.emit(Number.parseFloat(this.value));
    } else {
      this.valueChange.emit(this.value);
    }
  }
}
