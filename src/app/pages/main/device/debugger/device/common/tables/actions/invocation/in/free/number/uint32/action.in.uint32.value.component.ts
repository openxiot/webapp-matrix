import {Component, EventEmitter, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {NzInputNumberModule} from 'ng-zorro-antd/input-number';
import {Property} from '@openxiot/xiot-core-spec-ts';

@Component({
    selector: 'action-in-uint32-value',
    templateUrl: './action.in.uint32.value.component.html',
    styleUrls: ['./action.in.uint32.value.component.less'],
    imports: [
        ReactiveFormsModule,
        NzInputNumberModule,
        FormsModule,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class ActionInUint32ValueComponent {

  value: any = 0;

  @Input() property: Property | undefined;

  @Output() valueChange = new EventEmitter<any>();

  onValueChanged($event: any) {
    this.valueChange.emit(this.value);
  }
}
