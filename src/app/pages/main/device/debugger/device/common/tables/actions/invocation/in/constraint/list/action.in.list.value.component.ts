import {Component, EventEmitter, inject, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {MainI18nService} from '../../../../../../../../../../../../service/i18n.service';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
    selector: 'action-in-list-value',
    templateUrl: './action.in.list.value.component.html',
    styleUrls: ['./action.in.list.value.component.less'],
    imports: [
        TranslatePipe,
        NzSelectModule,
        ReactiveFormsModule,
        FormsModule,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class ActionInListValueComponent {

  protected readonly i18n = inject(MainI18nService);

  value: any = '';

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
