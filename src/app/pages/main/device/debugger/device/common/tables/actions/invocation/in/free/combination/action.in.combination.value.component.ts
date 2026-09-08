import {Component, EventEmitter, forwardRef, inject, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Argument, Property, Service} from '@openxiot/xiot-core-spec-ts';
import {MainI18nService} from '../../../../../../../../../../../../service/i18n.service';
import {NzSwitchModule} from 'ng-zorro-antd/switch';
import {NzDescriptionsModule} from 'ng-zorro-antd/descriptions';
import {ActionInValueComponent} from '../../action.in.value.component';

@Component({
    selector: 'action-in-combination-value',
    templateUrl: './action.in.combination.value.component.html',
    styleUrls: ['./action.in.combination.value.component.less'],
    imports: [
        NzSwitchModule,
        ReactiveFormsModule,
        FormsModule,
        NzDescriptionsModule,
        forwardRef(() => ActionInValueComponent),
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class ActionInCombinationValueComponent {

  value: Map<number, any> = new Map();

  @Input() property: Property | undefined;

  @Input() argument: Argument | undefined;

  @Input() service: Service | undefined;

  @Output() valueChange = new EventEmitter<any>();

  protected readonly i18n = inject(MainI18nService);

  getMemberName(iid: number): string {
    return this.service?.properties.get(iid)?.description.get(this.i18n.getCurrentLang()) || '';
  }

  onValueChanged(iid: number, value: any): void {
    this.value.set(iid, value);
    this.valueChange.emit(this.value);
  }

  getMemberArgument(iid: number): Argument {
    return Argument.of(iid, 1, 1);
  }
}
