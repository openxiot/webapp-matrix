import {Component, EventEmitter, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {NzInputNumberModule} from 'ng-zorro-antd/input-number';
import {Property} from '@openxiot/xiot-core-spec-ts';
@Component({
    selector: 'action-in-int64-value',
    templateUrl: './action.in.int64.value.component.html',
    styleUrls: ['./action.in.int64.value.component.less'],
    imports: [
        ReactiveFormsModule,
        NzInputNumberModule,
        FormsModule,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class ActionInInt64ValueComponent {

  value: any = 0;

  @Input() property: Property | undefined;

  @Output() valueChange = new EventEmitter<any>();

  onValueChanged($event: any) {
    this.valueChange.emit(this.value);
  }
}
