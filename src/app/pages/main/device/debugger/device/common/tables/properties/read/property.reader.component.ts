import {Component, inject, ChangeDetectionStrategy, signal} from '@angular/core';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NZ_MODAL_DATA, NzModalRef} from 'ng-zorro-antd/modal';
import {NzFormModule} from 'ng-zorro-antd/form';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {PropertyOperation, Status} from '@openxiot/xiot-core-spec-ts';
import {NzDividerModule} from 'ng-zorro-antd/divider';
import {NzBadgeModule} from 'ng-zorro-antd/badge';
import {NzDescriptionsModule} from 'ng-zorro-antd/descriptions';
import {NzResultModule} from 'ng-zorro-antd/result';
import {NzGridModule} from 'ng-zorro-antd/grid';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {NzTableModule} from 'ng-zorro-antd/table';
import {IPropertyData} from '../IPropertyData';
import {firstValueFrom, map} from 'rxjs';
import {PropertyReadValueComponent} from './value/property.read.value.component';
import {NzMessageService} from 'ng-zorro-antd/message';
import {MatrixService} from '../../../../../../../../../service/matrix.service';
import {AccountService} from '../../../../../../../../../service/account.service';

@Component({
    selector: 'property-reader',
    templateUrl: './property.reader.component.html',
    styleUrls: ['./property.reader.component.less'],
    imports: [
        ReactiveFormsModule,
        NzButtonModule,
        NzFormModule,
        NzDividerModule,
        NzBadgeModule,
        NzDescriptionsModule,
        NzResultModule,
        NzGridModule,
        NzIconModule,
        NzTableModule,
        FormsModule,
        PropertyReadValueComponent
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyReaderComponent {

  readonly #modal = inject(NzModalRef);
  readonly data: IPropertyData = inject(NZ_MODAL_DATA);
  operation = signal<PropertyOperation | null>(null);
  loading = signal(false);

  constructor(
    private matrix: MatrixService,
    private account: AccountService,
    private msg: NzMessageService,
  ) {
  }

  destroyModal(): void {
    this.#modal.destroy({data: 'this the result data'});
  }

  async doRead(): Promise<void> {
    if (this.loading()) {
      return;
    }
    console.log('doRead');

    this.loading.set(true);
    this.operation.set(null);

    const property: PropertyOperation = new PropertyOperation();
    property.pid.did = this.data.did;
    property.pid.siid = this.data.service.iid;
    property.pid.iid = this.data.property.iid;

    try {
      await firstValueFrom(
        this.matrix.getDeviceProperty(this.account.space().id, property)
          .pipe(map(x => {

            if (x.status === 0) {
              const valid: boolean = this.data.property.trySetValue(x.value);
              if (!valid) {
                console.log('value invalid: ', x.value);
                x.status = Status.PROPERTY_VALUE_INVALID;
                x.description = `成功读取到了属性值: ${x.value}，但这个值不合法!`;
              } else {
                console.log('value valid: ', x.value);
              }
            }

            this.operation.set(x);
            console.log('doRead: ', this.operation());
            return x;
          }))
      );
    } catch (err) {
      const e: any = err;
      this.msg.warning(e?.message || e);
    } finally {
      this.loading.set(false);
    }
  }
}
