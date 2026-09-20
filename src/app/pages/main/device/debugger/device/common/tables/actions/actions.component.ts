import {Component, Input, ViewContainerRef, ChangeDetectionStrategy} from '@angular/core';
import {Action, DataFormat, Property, Service} from '@openxiot/xiot-core-spec-ts';
import {NzTableComponent, NzTableModule} from "ng-zorro-antd/table";
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzTooltipModule} from 'ng-zorro-antd/tooltip';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {NzSpaceModule} from 'ng-zorro-antd/space';
import {NzModalService} from 'ng-zorro-antd/modal';
import {IActionData} from './IActionData';
import {ActionInvocationComponent} from './invocation/action.invocation.component';
import {MainI18nService} from '@app/service/i18n.service';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
    selector: 'debugger-actions-controller',
    templateUrl: './actions.component.html',
    imports: [
        TranslatePipe,
        NzTableModule,
        NzTableComponent,
        NzTagModule,
        NzTooltipModule,
        NzIconModule,
        NzSpaceModule,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: [
        NzModalService
    ]
})
export class ActionsControllerComponent {

  @Input() did!: string;

  @Input() service!: Service;

  constructor(
    private modal: NzModalService,
    private viewContainerRef: ViewContainerRef,
    protected i18n: MainI18nService,
  ) {
  }

  protected getProperty(iid: number): Property | undefined {
    return this.service.properties.get(iid);
  }

  doInvocation(action: Action) {
    // 创建完就显示，不需要拿返回值。
    this.modal.create<ActionInvocationComponent, IActionData>({
      nzTitle: action.description.get(this.i18n.getCurrentLang()),
      nzContent: ActionInvocationComponent,
      nzViewContainerRef: this.viewContainerRef,
      nzData: {
        did: this.did,
        service: this.service,
        action: action
      },
      // nzOnOk: () => {
      //   return new Promise(resolve => setTimeout(resolve, 1000));
      // },
      nzFooter: [
        {
          label: this.i18n.translate.instant('取消'),
          onClick: component => component!.destroyModal()
        },
        {
          label: this.i18n.translate.instant('调用'),
          danger: true,
          type: 'primary',
          disabled: component => (action.in.size > 0 && component!.invalid()),
          loading: component => component!.loading(),
          onClick: component => { component!.doInvoke(); }
        }
      ],
      nzDraggable: false,
      nzWidth: 1024
    });
  }

  protected readonly DataFormat = DataFormat;
}
