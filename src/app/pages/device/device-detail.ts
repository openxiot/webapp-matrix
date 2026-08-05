import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDescriptionsModule } from 'ng-zorro-antd/descriptions';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { AccountService } from '../../service/account.service';
import { ProjectService } from '../../service/project.service';
import { DeviceEntity } from '../../typedef/define/device/DeviceEntity';
import { SpaceEntity } from '../../typedef/define/space/SpaceEntity';
import { UrnUtils } from '../../typedef/utils/UrnUtils';

@Component({
  selector: 'app-device-detail',
  imports: [
    FormsModule,
    NzButtonModule,
    NzCardModule,
    NzDescriptionsModule,
    NzDividerModule,
    NzEmptyModule,
    NzIconModule,
    NzModalModule,
    NzRadioModule,
    NzSpinModule,
    NzTagModule,
    NzTooltipModule,
  ],
  templateUrl: './device-detail.html',
  styleUrl: './device-detail.less',
})
export class DeviceDetail implements OnInit {
  did: string = '';
  moveVisible: boolean = false;
  moveTargetId: string = '';
  moveSpaces: SpaceEntity[] = [];

  constructor(
    public account: AccountService,
    public project: ProjectService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    this.did = this.route.snapshot.paramMap.get('did') || '';
    const rootId = this.account.currentRootSpaceId();
    if (rootId) {
      this.project.loadSpaceGraph(rootId);
    }
  }

  device(): DeviceEntity | null {
    return this.project.devices().find((d) => d.did === this.did) || null;
  }

  typeName(): string {
    return UrnUtils.extractTypeName(this.device()?.type || '');
  }

  spaceName(): string {
    const device = this.device();
    return device ? this.project.spaceName(device.space?.spaceId || '') : '-';
  }

  formatTime(t: string): string {
    if (!t) return '-';
    const d = new Date(t);
    if (isNaN(d.getTime())) return t;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  routerBack() {
    this.router.navigate(['/device']);
  }

  openMove() {
    this.moveTargetId = '';
    this.moveSpaces = this.flatten(this.project.rootSpace());
    this.moveVisible = true;
  }

  private flatten(root: SpaceEntity | null): SpaceEntity[] {
    const result: SpaceEntity[] = [];
    const walk = (s: SpaceEntity, depth: number) => {
      const copy = Object.assign(new SpaceEntity(), s);
      copy.level = depth;
      result.push(copy);
      for (const c of s.children) walk(c, depth + 1);
    };
    if (root) walk(root, 0);
    return result;
  }

  spaceIndent(space: SpaceEntity): number {
    return space.level * 16;
  }

  submitMove() {
    const device = this.device();
    if (!device || !this.moveTargetId) return;
    this.project.moveDevice(device, this.moveTargetId);
    this.moveVisible = false;
  }
}
