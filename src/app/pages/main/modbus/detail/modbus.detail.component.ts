import { DragDropModule } from '@angular/cdk/drag-drop';
import { Component } from '@angular/core';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzModalService } from 'ng-zorro-antd/modal';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { NzBreadCrumbComponent } from 'ng-zorro-antd/breadcrumb';
import { NzColDirective, NzRowDirective } from 'ng-zorro-antd/grid';
import { ModbusEditor } from '../editor/modbus.editor';

@Component({
  selector: 'main-modbus-detail',
  standalone: true,
  templateUrl: '../editor/modbus.editor.html',
  styleUrl: '../editor/modbus.editor.less',
  imports: [
    DragDropModule,
    NzPageHeaderModule,
    NzSpinModule,
    NzCardModule,
    NzButtonModule,
    NzTableModule,
    NzDescriptionsModule,
    NzIconModule,
    NzDividerModule,
    TranslatePipe,
    BreadcrumbTranslateDirective,
    NzBreadCrumbComponent,
    NzRowDirective,
    NzColDirective,
  ],
  providers: [NzModalService],
})
export class ModbusDetailComponent extends ModbusEditor {
  protected override get kind(): 'add' | 'detail' {
    return 'detail';
  }
}
