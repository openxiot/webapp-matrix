import {Component, Input, ViewContainerRef, ChangeDetectionStrategy} from '@angular/core';
import {Property, Service} from '@openxiot/xiot-core-spec-ts';
import {NzTableComponent, NzTableModule} from "ng-zorro-antd/table";
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {NzSpaceModule} from 'ng-zorro-antd/space';
import {PropertyValueComponent} from './property-value/property-value.component';
import {PropertyWriterComponent} from './write/property.writer.component';
import {IPropertyData} from './IPropertyData';
import {NzModalService} from 'ng-zorro-antd/modal';
import {PropertyReaderComponent} from './read/property.reader.component';
import {NzDividerComponent} from 'ng-zorro-antd/divider';
import {MainI18nService} from '@app/service/i18n.service';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
    selector: 'debugger-properties-controller',
    templateUrl: './properties.component.html',
    imports: [
        TranslatePipe,
        NzIconModule,
        NzSpaceModule,
        NzTableModule,
        NzTableComponent,
        NzTagModule,
        PropertyValueComponent,
        NzDividerComponent,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: [
        NzModalService
    ]
})
export class PropertiesControllerComponent {

  @Input() did!: string;

  @Input() service!: Service;

  constructor(
    protected i18n: MainI18nService,
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
  ) {
  }

  setProperty(property: Property) {
    // 创建完就显示，不需要拿返回值。
    this.modal.create<PropertyWriterComponent, IPropertyData>({
      nzTitle: property.description.get(this.i18n.getCurrentLang()),
      nzContent: PropertyWriterComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: {
        did: this.did,
        service: this.service,
        property: property
      },
      nzFooter: [
        {
          label: this.i18n.translate.instant('取消'),
          onClick: component => component!.destroyModal()
        },
        {
          label: this.i18n.translate.instant('写属性'),
          danger: true,
          type: 'primary',
          disabled: component => component!.invalid(),
          loading: component => component!.loading(),
          onClick: component => { component!.doWrite(); }
        }
      ],
      nzDraggable: false,
      nzWidth: 600
    });
  }

  getProperty(property: Property) {
    this.modal.create<PropertyReaderComponent, IPropertyData>({
      nzTitle: property.description.get(this.i18n.getCurrentLang()),
      nzContent: PropertyReaderComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: {
        did: this.did,
        service: this.service,
        property: property
      },
      nzFooter: [
        {
          label: this.i18n.translate.instant('取消'),
          onClick: component => component!.destroyModal()
        },
        {
          label: this.i18n.translate.instant('读属性'),
          danger: true,
          type: 'primary',
          loading: component => component!.loading(),
          onClick: component => { component!.doRead(); }
        }
      ],
      nzDraggable: false,
      nzWidth: 600
    });
  }
}
