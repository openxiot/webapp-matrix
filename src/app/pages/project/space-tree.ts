import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { QrScanner } from '../../components/qr-scanner/qr-scanner';
import { SpaceTreeNode } from '../../components/space-tree-node/space-tree-node';
import { ProjectService } from '../../service/project.service';
import { DeviceEntity } from '../../typedef/define/device/DeviceEntity';
import { SpaceEntity } from '../../typedef/define/space/SpaceEntity';
import { SpaceUtils } from '../../typedef/utils/SpaceUtils';

const SPACE_TYPES = ['building', 'floor', 'room', 'zone'];

@Component({
  selector: 'app-space-tree',
  imports: [
    FormsModule,
    NzButtonModule,
    NzEmptyModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzRadioModule,
    NzSelectModule,
    NzSpinModule,
    QrScanner,
    SpaceTreeNode,
  ],
  templateUrl: './space-tree.html',
  styleUrl: './space-tree.less',
})
export class SpaceTree implements OnInit {
  rootId: string = '';

  addVisible: boolean = false;
  addTarget: SpaceEntity | null = null;
  addName: string = '';
  addType: string = 'room';

  moveVisible: boolean = false;
  moveTarget: DeviceEntity | null = null;
  moveTargetId: string = '';
  moveSpaces: SpaceEntity[] = [];

  qrVisible: boolean = false;
  qrSpaceId: string = '';
  qrError: string = '';
  manualVisible: boolean = false;
  manualDid: string = '';
  manualType: string = '';

  constructor(
    public project: ProjectService,
    private route: ActivatedRoute,
    private router: Router,
    private msg: NzMessageService,
  ) {}

  ngOnInit() {
    this.rootId = this.route.snapshot.paramMap.get('rootId') || '';
    this.load();
  }

  load() {
    this.project.loadSpaceGraph(this.rootId);
  }

  routerBack() {
    this.router.navigate(['/project-picker']);
  }

  protected readonly spaceTypes = SPACE_TYPES;
  typeLabel(t: string): string {
    return SpaceUtils.typeLabel(t);
  }

  /**------------------------------------------------------------------------------------------------
   * 添加空间
   *------------------------------------------------------------------------------------------------*/
  onAddSpace(parent: SpaceEntity) {
    this.addTarget = parent;
    this.addName = '';
    this.addType = this.defaultChildType(parent.type);
    this.addVisible = true;
  }

  defaultChildType(parentType: string): string {
    switch (parentType) {
      case 'building':
        return 'floor';
      case 'floor':
        return 'room';
      case 'room':
        return 'zone';
      default:
        return 'room';
    }
  }

  submitAdd() {
    const name = this.addName.trim();
    if (!name || !this.addTarget) {
      this.msg.warning('请填写空间名称');
      return;
    }
    const space = new SpaceEntity();
    space.name = name;
    space.type = this.addType;
    space.parentId = this.addTarget.id;
    space.rootId = this.rootId;

    this.project.createSpace(space, this.rootId);
    this.addVisible = false;
  }

  /**------------------------------------------------------------------------------------------------
   * 删除空间
   *------------------------------------------------------------------------------------------------*/
  onDeleteSpace(space: SpaceEntity) {
    this.project.deleteSpace(space.id, this.rootId);
  }

  /**------------------------------------------------------------------------------------------------
   * 添加设备（扫码/手动）
   *------------------------------------------------------------------------------------------------*/
  onAddDevice(space: SpaceEntity) {
    this.qrSpaceId = space.id;
    this.qrError = '';
    this.manualVisible = false;
    this.qrVisible = true;
  }

  onQrScanned(text: string) {
    this.project.addDeviceByQr(this.qrSpaceId, text, this.rootId);
    this.qrVisible = false;
    this.msg.success('设备添加成功');
  }

  onQrError(err: string) {
    this.qrError = err;
    this.manualVisible = true;
  }

  submitManual() {
    const did = this.manualDid.trim();
    const type = this.manualType.trim();
    if (!did || !type) {
      this.msg.warning('请填写设备 ID 和类型');
      return;
    }
    this.project.addDevice(this.qrSpaceId, { did, type }, this.rootId);
    this.manualVisible = false;
    this.qrVisible = false;
    this.msg.success('设备添加成功');
  }

  /**------------------------------------------------------------------------------------------------
   * 移动设备
   *------------------------------------------------------------------------------------------------*/
  onMoveDevice(device: DeviceEntity) {
    this.moveTarget = device;
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
    if (!this.moveTarget || !this.moveTargetId) {
      this.msg.warning('请选择目标空间');
      return;
    }
    this.project.moveDevice(this.moveTarget, this.moveTargetId);
    this.moveVisible = false;
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
