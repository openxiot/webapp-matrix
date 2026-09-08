import {Component, EventEmitter, forwardRef, Input, Output, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Property, Service} from '@openxiot/xiot-core-spec-ts';
import {MainI18nService} from '../../../../../../../../../../../../service/i18n.service';
import {NzSwitchModule} from 'ng-zorro-antd/switch';
import {NzDescriptionsModule} from 'ng-zorro-antd/descriptions';
import {PropertyWriteValueComponent} from '../../property.write.value.component';

@Component({
    selector: 'property-write-combination-value',
    templateUrl: './property.write.combination.value.component.html',
    styleUrls: ['./property.write.combination.value.component.less'],
    imports: [
        NzSwitchModule,
        ReactiveFormsModule,
        FormsModule,
        NzDescriptionsModule,
        forwardRef(() => PropertyWriteValueComponent),
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyWriteCombinationValueComponent {

  value: Map<number, any> = new Map();

  @Input() property: Property | undefined;

  @Input() service: Service | undefined;

  @Output() valueChange = new EventEmitter<any>();

  getMember(iid: number): Property | undefined {
    return this.service?.properties.get(iid);
  }

  protected readonly i18n = inject(MainI18nService);

  getMemberName(iid: number): string {
    return this.service?.properties.get(iid)?.description.get(this.i18n.getCurrentLang()) || '';
  }

  onValueChanged(iid: number, value: any): void {
    this.value.set(iid, value);
    this.valueChange.emit(this.value);
  }
}
