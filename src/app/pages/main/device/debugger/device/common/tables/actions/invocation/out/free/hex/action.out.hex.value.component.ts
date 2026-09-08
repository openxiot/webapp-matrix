import {Component, Input, ChangeDetectionStrategy} from '@angular/core';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {NzSpaceModule} from 'ng-zorro-antd/space';
import {formatHexValue} from '../../../../../hex-value';

@Component({
    selector: 'action-out-hex-value',
    templateUrl: './action.out.hex.value.component.html',
    styleUrls: ['./action.out.hex.value.component.less'],
    imports: [
        NzSpaceModule
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class ActionOutHexValueComponent {

  @Input() property: Property | undefined;

  @Input() values: any[] = [];

  hexText(value: any): string {
    return formatHexValue(value);
  }
}
