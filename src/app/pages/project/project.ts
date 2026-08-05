import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { SpaceTreeNode } from '../../components/space-tree-node/space-tree-node';
import { AccountService } from '../../service/account.service';
import { ProjectService } from '../../service/project.service';
import { DeviceEntity } from '../../typedef/define/device/DeviceEntity';

@Component({
  selector: 'app-project',
  imports: [RouterLink, NzIconModule, NzButtonModule, NzSpinModule, NzEmptyModule, SpaceTreeNode],
  templateUrl: './project.html',
  styleUrl: './project.less',
})
export class Project implements OnInit {
  constructor(
    public account: AccountService,
    public project: ProjectService,
    private router: Router,
  ) {}

  onDeviceClick(device: DeviceEntity) {
    this.router.navigate(['/device-operation', device.did], {
      queryParams: { type: device.type, spaceId: device.space?.spaceId },
    });
  }

  onDeviceDetail(device: DeviceEntity) {
    this.router.navigate(['/device', device.did]);
  }

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

  deviceIcon(device: DeviceEntity): string {
    return this.project.deviceIcon(device);
  }
}
