import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { TranslatePipe } from '@ngx-translate/core';
import { BreadcrumbTranslateDirective } from '../../../../../../common/components/breadcrumb/breadcrumb-translate.directive';
import { DeviceServiceEditor } from '../editor/device.service.editor';

/**
 * 添加 Modbus 服务：在某个 DTU 设备（路由 did）下新建一份「点表 → 可调用方法」的服务定义。
 */
@Component({
  selector: 'device-service-create',
  templateUrl: '../editor/device.service.editor.html',
  styleUrls: ['../editor/device.service.editor.less'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    NzPageHeaderModule,
    NzBreadCrumbModule,
    NzSpinModule,
    NzCardModule,
    NzFormModule,
    NzSelectModule,
    NzInputModule,
    NzInputNumberModule,
    NzSwitchModule,
    NzButtonModule,
    NzTagModule,
    NzTableModule,
    NzAlertModule,
    NzEmptyModule,
    BreadcrumbTranslateDirective,
    TranslatePipe,
  ],
})
export class DeviceServiceCreateComponent extends DeviceServiceEditor {
  protected override get kind(): 'create' | 'edit' {
    return 'create';
  }
}
