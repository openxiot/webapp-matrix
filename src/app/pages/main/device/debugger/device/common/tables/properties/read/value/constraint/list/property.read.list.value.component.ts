import {Component, Input, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {MainI18nService} from '../../../../../../../../../../../../service/i18n.service';
import {NzSpaceModule} from 'ng-zorro-antd/space';

@Component({
    selector: 'property-read-list-value',
    templateUrl: './property.read.list.value.component.html',
    styleUrls: ['./property.read.list.value.component.less'],
    imports: [
        ReactiveFormsModule,
        FormsModule,
        NzSpaceModule
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyReadListValueComponent {

  @Input() property: Property | undefined;

  @Input() value!: any;

  protected readonly i18n = inject(MainI18nService);

  getValueDescription(x: any): string | undefined {
    if (this.property) {
      const list = this.property.valueList();
      if (list) {
        const found = list.values.find(v => v.value.rawValue() === x);
        if (found) {
          return found.description.get(this.i18n.getCurrentLang()) || found.description.get('en-US');
        } else {
          console.warn('value not found, value: ', x);
        }
      } else {
        console.error('valueList not found.');
      }
    }

    return undefined;
  }
}
