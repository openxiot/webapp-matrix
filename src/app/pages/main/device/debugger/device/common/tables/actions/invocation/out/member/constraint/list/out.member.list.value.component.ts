import {Component, Input, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {MainI18nService} from '@app/service/i18n.service';
import {NzSpaceModule} from 'ng-zorro-antd/space';

@Component({
    selector: 'out-member-list-value',
    templateUrl: './out.member.list.value.component.html',
    styleUrls: ['./out.member.list.value.component.less'],
    imports: [
        ReactiveFormsModule,
        FormsModule,
        NzSpaceModule
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class OutMemberListValueComponent {

  @Input() property: Property | undefined;

  @Input() value: any;

  protected readonly i18n = inject(MainI18nService);

  getValueDescription(x: any): string | undefined {
    if (this.property) {
      const list = this.property.valueList();
      if (list) {
        const found = list.values.find(v => v.value === x);
        if (found) {
          return found.description.get(this.i18n.getCurrentLang());
        }
      }
    }

    return undefined;
  }
}
