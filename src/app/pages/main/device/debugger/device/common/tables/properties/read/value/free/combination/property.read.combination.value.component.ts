import {Component, forwardRef, inject, Input, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Property, Service} from '@openxiot/xiot-core-spec-ts';
import {MainI18nService} from '../../../../../../../../../../../../service/i18n.service';
import {NzSwitchModule} from 'ng-zorro-antd/switch';
import {NzDescriptionsModule} from 'ng-zorro-antd/descriptions';
import {PropertyReadValueComponent} from '../../property.read.value.component';

@Component({
    selector: 'property-read-combination-value',
    templateUrl: './property.read.combination.value.component.html',
    styleUrls: ['./property.read.combination.value.component.less'],
    imports: [
        NzSwitchModule,
        ReactiveFormsModule,
        FormsModule,
        NzDescriptionsModule,
        forwardRef(() => PropertyReadValueComponent),
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyReadCombinationValueComponent {

  @Input() property: Property | undefined;

  @Input() service: Service | undefined;

  @Input() value!: any;

  getMember(iid: number): Property | undefined {
    return this.service?.properties.get(iid);
  }

  protected readonly i18n = inject(MainI18nService);

  getMemberName(iid: number): string {
    return this.service?.properties.get(iid)?.description.get(this.i18n.getCurrentLang()) || '';
  }

  getMemberValue(iid: number): any {
    return this.value.get(iid);
  }
}
