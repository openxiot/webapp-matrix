import { Component, input, output } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { ProjectService } from '../../../service/project.service';
import { SpaceEntity } from '../../../typedef/define/space/SpaceEntity';
import { DeviceEntity } from '../../../typedef/define/device/DeviceEntity';
import { SpaceUtils } from '../../../typedef/utils/SpaceUtils';

@Component({
  selector: 'app-space-tree-node',
  imports: [NzIconModule, NzTagModule, NzTooltipModule],
  templateUrl: './space-tree-node.html',
  styleUrl: './space-tree-node.less',
})
export class SpaceTreeNode {
  space = input.required<SpaceEntity>();
  depth = input(0);
  showActions = input(false);

  addSpace = output<SpaceEntity>();
  addDevice = output<SpaceEntity>();
  deleteSpace = output<SpaceEntity>();
  moveDevice = output<DeviceEntity>();
  deviceClick = output<DeviceEntity>();
  deviceDetail = output<DeviceEntity>();

  expanded = true;

  constructor(public project: ProjectService) {}

  toggle() {
    this.expanded = !this.expanded;
  }

  typeLabel(): string {
    return SpaceUtils.typeLabel(this.space().type);
  }

  typeIcon(): string {
    return SpaceUtils.typeIcon(this.space().type);
  }

  devicesOf(): DeviceEntity[] {
    return this.project.devicesOf(this.space().id);
  }
}
