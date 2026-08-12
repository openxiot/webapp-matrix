import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { DeviceInstance, DeviceInstanceCodec } from '@openxiot/xiot-core-spec-ts';
import { AccountService } from '../../service/account.service';
import { ProductService } from '../../service/product.service';
import { ProjectService } from '../../service/project.service';
import { MatrixService } from '../../service/matrix.service';
import { UrnUtils } from '../../typedef/utils/UrnUtils';

interface SwitchItem {
  serviceIid: number;
  iid: number;
  name: string;
  value: boolean;
}

@Component({
  selector: 'app-device-operation',
  imports: [
    FormsModule,
    NzButtonModule,
    NzCardModule,
    NzEmptyModule,
    NzIconModule,
    NzSpinModule,
    NzSwitchModule,
  ],
  templateUrl: './device-operation.html',
  styleUrl: './device-operation.less',
})
export class DeviceOperation implements OnInit {
  did: string = '';
  type: string = '';
  spaceId: string = '';
  loading: boolean = false;
  loadError: string = '';
  switches: SwitchItem[] = [];
  writing: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private msg: NzMessageService,
    private product: ProductService,
    private site: MatrixService,
    private project: ProjectService,
    public account: AccountService,
  ) {}

  ngOnInit() {
    this.did = this.route.snapshot.paramMap.get('did') || '';
    this.type = this.route.snapshot.queryParams['type'] || '';
    this.spaceId = this.route.snapshot.queryParams['spaceId'] || '';
    this.load();
  }

  load() {
    this.loading = true;
    this.loadError = '';
    this.product.getProductInstance(this.type).subscribe({
      next: (instance) => {
        this.switches = this.buildSwitches(instance);
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.loadError = e?.message ?? String(e);
      },
    });
  }

  private buildSwitches(instance: DeviceInstance): SwitchItem[] {
    const list: SwitchItem[] = [];
    for (const service of instance.getServices()) {
      for (const prop of service.getProperties()) {
        if (prop.access.isWritable && prop.formatBoolean()) {
          const name = prop.description.get('zh-CN') || service.description.get('zh-CN') || '属性';
          list.push({
            serviceIid: service.iid,
            iid: prop.iid,
            name,
            value: !!prop.getValue(),
          });
        }
      }
    }
    return list;
  }

  deviceName(): string {
    const device = this.project.devices().find((d) => d.did === this.did);
    if (device) return this.project.deviceName(device);
    return UrnUtils.extractTypeName(this.type) || this.did;
  }

  onToggle(item: SwitchItem, value: boolean) {
    item.value = value;
    this.writing = true;
    this.site
      .setDeviceProperties(this.spaceId, {
        did: this.did,
        [String(item.iid)]: value,
      })
      .subscribe({
        next: () => {
          this.writing = false;
          this.msg.success(`已设置 ${item.name}`);
        },
        error: (e) => {
          this.writing = false;
          this.msg.error(e?.message ?? e);
        },
      });
  }

  routerBack() {
    this.router.navigate(['/device']);
  }
}
