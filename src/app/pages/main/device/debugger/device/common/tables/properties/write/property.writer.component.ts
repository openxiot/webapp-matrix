import {Component, inject, ChangeDetectionStrategy, signal} from '@angular/core';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NZ_MODAL_DATA, NzModalRef} from 'ng-zorro-antd/modal';
import {NzFormModule} from 'ng-zorro-antd/form';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {PropertyOperation} from '@openxiot/xiot-core-spec-ts';
import {NzDividerModule} from 'ng-zorro-antd/divider';
import {NzBadgeModule} from 'ng-zorro-antd/badge';
import {NzDescriptionsModule} from 'ng-zorro-antd/descriptions';
import {NzResultModule} from 'ng-zorro-antd/result';
import {NzGridModule} from 'ng-zorro-antd/grid';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {NzTableModule} from 'ng-zorro-antd/table';
import {IPropertyData} from '../IPropertyData';
import {firstValueFrom, map} from 'rxjs';
import {PropertyWriteValueComponent} from './value/property.write.value.component';
import {NzMessageService} from 'ng-zorro-antd/message';
import {MatrixService} from '@app/service/matrix.service';
import {AccountService} from '@app/service/account.service';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
    selector: 'property-writer',
    templateUrl: './property.writer.component.html',
    styleUrls: ['./property.writer.component.less'],
    imports: [
        TranslatePipe,
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
        PropertyWriteValueComponent
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: []
})
export class PropertyWriterComponent {

  readonly #modal = inject(NzModalRef);
  readonly data: IPropertyData = inject(NZ_MODAL_DATA);
  operation = signal<PropertyOperation | null>(null);
  loading = signal(false);
  value: any;
  invalid = signal(true);

  constructor(
    private matrix: MatrixService,
    private account: AccountService,
    private msg: NzMessageService,
  ) {
    this.value = this.data.property.value.value().rawValue();
    this.invalid.set(! this.data.property.trySetValue(this.value));
  }

  destroyModal(): void {
    this.#modal.destroy({data: 'this the result data'});
  }

  onValueChanged(value: any) {
    console.log(`onValueChanged: `, value);

    this.value = value;
    this.invalid.set(! this.data.property.trySetValue(this.value));

    // 删除operation，隐藏调用结果
    this.operation.set(null);
  }

  async doWrite(): Promise<void> {
    if (this.loading()) {
      return;
    }
    console.log('doWrite');

    this.loading.set(true);
    this.operation.set(null);

    const property: PropertyOperation = new PropertyOperation();
    property.pid.did = this.data.did;
    property.pid.siid = this.data.service.iid;
    property.pid.iid = this.data.property.iid;
    property.value = this.value;

    try {
      await firstValueFrom(
        this.matrix.setDeviceProperty(this.account.space().id, property)
          .pipe(map(x => {
            this.operation.set(x);
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
