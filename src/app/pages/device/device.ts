import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { AccountService } from '../../service/account.service';
import { ProjectService } from '../../service/project.service';
import { DeviceEntity } from '../../typedef/define/device/DeviceEntity';

@Component({
  selector: 'app-device',
  imports: [
    RouterLink,
    NzButtonModule,
    NzEmptyModule,
    NzIconModule,
    NzListModule,
    NzSpinModule,
    NzTooltipModule,
  ],
  templateUrl: './device.html',
  styleUrl: './device.less',
})
export class Device implements OnInit {
  constructor(
    public account: AccountService,
    public project: ProjectService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    const rootId = this.account.currentRootSpaceId();
    if (rootId) {
      this.project.loadSpaceGraph(rootId);
    }
  }

  deviceName(device: DeviceEntity): string {
    return this.project.deviceName(device);
  }

  onDeviceClick(device: DeviceEntity) {
    this.router.navigate(['/device-operation', device.did], {
      queryParams: { type: device.type, spaceId: device.space?.spaceId },
    });
  }

  onDeviceDetail(device: DeviceEntity) {
    this.router.navigate(['/device', device.did]);
  }
}
