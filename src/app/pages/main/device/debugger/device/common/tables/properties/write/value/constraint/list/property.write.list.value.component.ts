import {Component, EventEmitter, inject, Input, Output, ChangeDetectionStrategy} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Property} from '@openxiot/xiot-core-spec-ts';
import {MainI18nService} from '../../../../../../../../../../../../service/i18n.service';
import {NzOptionComponent, NzSelectComponent} from 'ng-zorro-antd/select';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
    selector: 'property-write-list-value',
    templateUrl: './property.write.list.value.component.html',
    styleUrls: ['./property.write.list.value.component.less'],
    imports: [
        TranslatePipe,
        ReactiveFormsModule,
        FormsModule,
        NzOptionComponent,
        NzSelectComponent
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyWriteListValueComponent {

  protected readonly i18n = inject(MainI18nService);

  value: any = '';

  @Input() property: Property | undefined;

  @Output() valueChange = new EventEmitter<any>();

  onValueChanged($event: any) {
    // this.valueChange.emit(this.value);

    // this.value是字符串，ValueList一般是整型，可能需要转一下。
    if (this.property?.formatString()) {
      this.valueChange.emit(this.value);
    } else {
      this.valueChange.emit(Number.parseInt(this.value));
    }
  }
}
