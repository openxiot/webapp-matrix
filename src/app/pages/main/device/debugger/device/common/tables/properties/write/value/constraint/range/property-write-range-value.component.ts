import {Component, EventEmitter, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {NzSliderModule} from 'ng-zorro-antd/slider';
import {NzColDirective, NzRowDirective} from 'ng-zorro-antd/grid';
import {NzInputNumberComponent} from 'ng-zorro-antd/input-number';

@Component({
    selector: 'property-write-range-value',
    templateUrl: 'property-write-range-value.component.html',
    styleUrls: ['property-write-range-value.component.less'],
    imports: [
        ReactiveFormsModule,
        FormsModule,
        NzSliderModule,
        NzColDirective,
        NzInputNumberComponent,
        NzRowDirective
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyWriteRangeValueComponent {

  value: any = 0;

  @Input() property: Property | undefined;

  @Output() valueChange = new EventEmitter<any>();

  onValueChanged($event: any) {
    // this.value是字符串，ValueList一般是整型，可能需要转一下。
    if (this.property?.formatString()) {
      this.valueChange.emit(this.value);
    } else {
      this.valueChange.emit(Number.parseInt(this.value));
    }
  }
}
