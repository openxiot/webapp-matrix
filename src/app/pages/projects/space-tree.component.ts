import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTreeModule } from 'ng-zorro-antd/tree';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzPageHeaderModule } from 'ng-zorro-antd/page-header';
import { NzBreadCrumbModule } from 'ng-zorro-antd/breadcrumb';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { ApiService } from '../../services/api.service';
import { TokenService } from '../../services/token.service';
import { SpaceEntity, DeviceEntity, extractModelFromUrn, extractTypeName, productDisplayName } from '../../models/api.models';

interface TreeNode {
  title: string;
  key: string;
  icon: string;
  expanded: boolean;
  children: TreeNode[];
  isLeaf: boolean;
  isDevice?: boolean;
  device?: DeviceEntity;
  space?: SpaceEntity;
}

@Component({
  selector: 'app-space-tree',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    NzIconModule, NzButtonModule, NzTreeModule, NzCardModule, NzTagModule,
    NzSpinModule, NzEmptyModule, NzModalModule, NzInputModule,
    NzRadioModule, NzPageHeaderModule, NzBreadCrumbModule, NzTooltipModule,
  ],
  template: `
    <div class="page-container" *ngIf="rootSpaceId">
      <nz-page-header (nzBack)="router.navigate(['/projects/list'])" nzBackIcon>
        <nz-breadcrumb nz-page-header-breadcrumb nzSeparator=">">
          <nz-breadcrumb-item><a (click)="router.navigate(['/projects/list'])">项目列表</a></nz-breadcrumb-item>
          <nz-breadcrumb-item>{{ rootSpace()?.name || '空间管理' }}</nz-breadcrumb-item>
        </nz-breadcrumb>
      </nz-page-header>

      <nz-spin [nzSpinning]="loading()" class="content-spin">
        <!-- Devices summary -->
        <div class="summary-bar" *ngIf="devices().length > 0">
          <span>共 <strong>{{ devices().length }}</strong> 个设备</span>
        </div>

        <nz-empty *ngIf="!loading() && !rootSpace()" nzNotFoundContent="空间数据为空"></nz-empty>
        <nz-empty *ngIf="!loading() && rootSpace() && nodeList().length === 0" nzNotFoundContent="请添加空间或设备"></nz-empty>

        <!-- Tree with custom node actions -->
        <nz-tree
          *ngIf="nodeList().length > 0"
          [nzData]="nodeList()"
          [nzShowLine]="true"
          [nzShowIcon]="true"
          [nzTreeTemplate]="treeTemplate"
          nzBlockNode>
        </nz-tree>
      </nz-spin>

      <!-- Floating action buttons -->
      <div class="actions-fab">
        <button nz-button nzType="primary" nzShape="circle" nzSize="large" nz-tooltip="添加空间"
                (click)="showCreateSpace(rootSpaceId)" style="margin-bottom:12px">
          <span nz-icon nzType="account-book"></span>
        </button>
        <button nz-button nzType="primary" nzShape="circle" nzSize="large" nz-tooltip="添加设备"
                (click)="showAddDevice()">
          <span nz-icon nzType="appstore"></span>
        </button>
      </div>
    </div>

    <!-- Custom tree node template with actions -->
    <ng-template #treeTemplate let-node let-origin="origin">
      <span class="custom-node" [class.device-node]="origin.isDevice">
        <!-- Device node: click to view detail -->
        <span class="node-label" (click)="onDeviceClick(origin)" *ngIf="origin.isDevice">
          <span class="status-dot" [class.online]="origin.device?.online" [class.offline]="!origin.device?.online"></span>
          <span class="node-title">{{ origin.title }}</span>
          <nz-tag nzSize="small" [nzColor]="origin.device?.online ? 'green' : 'default'">
            {{ origin.device?.online ? '在线' : '离线' }}
          </nz-tag>
        </span>

        <!-- Space node -->
        <span class="node-label" (click)="onSpaceClick(origin)" *ngIf="!origin.isDevice">
          <span nz-icon [nzType]="origin.icon" nzTheme="outline" style="color:#0D84FF"></span>
          <span class="node-title" [innerHTML]="origin.title"></span>
        </span>

        <!-- Space actions -->
        <span class="node-actions" *ngIf="origin.space && !origin.isDevice">
          <a nz-tooltip="添加子空间" (click)="showCreateSpace(origin.space!.id)">
            <span nz-icon nzType="plus"></span>
          </a>
          <a nz-tooltip="重命名" (click)="showRenameSpace(origin.space)">
            <span nz-icon nzType="edit"></span>
          </a>
          <a nz-tooltip="删除" class="danger" (click)="showDeleteSpace(origin.space)">
            <span nz-icon nzType="delete"></span>
          </a>
        </span>
      </span>
    </ng-template>

    <!-- Create space modal -->
    <nz-modal [(nzVisible)]="createSpaceVisible" nzTitle="添加空间" (nzOnCancel)="createSpaceVisible = false"
              (nzOnOk)="createSpace()" [nzOkLoading]="submitting" [nzOkDisabled]="!spaceName">
      <div *nzModalContent>
        <input nz-input placeholder="空间名称" [(ngModel)]="spaceName" style="margin-bottom:12px">
        <p style="margin-bottom:8px;font-weight:500">空间类型</p>
        <nz-radio-group [(ngModel)]="spaceType">
          <label nz-radio nzValue="building">楼栋</label>
          <label nz-radio nzValue="floor" style="margin-left:12px">楼层</label>
          <label nz-radio nzValue="room" style="margin-left:12px">房间</label>
          <label nz-radio nzValue="zone" style="margin-left:12px">区域</label>
        </nz-radio-group>
      </div>
    </nz-modal>

    <!-- Rename space modal -->
    <nz-modal [(nzVisible)]="renameVisible" nzTitle="重命名空间" (nzOnCancel)="renameVisible = false"
              (nzOnOk)="renameSpace()" [nzOkLoading]="submitting" [nzOkDisabled]="!renameName">
      <div *nzModalContent>
        <input nz-input placeholder="空间名称" [(ngModel)]="renameName">
      </div>
    </nz-modal>

    <!-- Add device modal -->
    <nz-modal [(nzVisible)]="addDeviceVisible" nzTitle="添加设备" (nzOnCancel)="addDeviceVisible = false"
              (nzOnOk)="addDevice()" [nzOkLoading]="submitting" [nzOkDisabled]="!deviceDid || !deviceType">
      <div *nzModalContent>
        <input nz-input placeholder="设备 DID" [(ngModel)]="deviceDid" style="margin-bottom:12px">
        <input nz-input placeholder="设备类型 (URN)" [(ngModel)]="deviceType">
      </div>
    </nz-modal>

    <!-- Delete confirm -->
    <nz-modal [(nzVisible)]="deleteVisible" nzTitle="确认删除" nzOkDanger nzOkType="primary"
              (nzOnCancel)="deleteVisible = false" (nzOnOk)="confirmDelete()" [nzOkLoading]="submitting">
      <div *nzModalContent>
        <p>确定要删除这个空间吗？</p>
        <p *ngIf="deleteTarget?.children?.length">该空间下有子空间，可能无法删除。</p>
      </div>
    </nz-modal>
  `,
  styles: [`
    .page-container { padding: 0 24px 80px; max-width: 1000px; margin: 0 auto; }
    .content-spin { min-height: 300px; }
    .summary-bar {
      background: #fff; padding: 8px 16px; border-radius: 6px; margin-bottom: 8px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06); font-size: 13px;
    }
    .actions-fab {
      position: fixed; bottom: 32px; right: 32px; display: flex; flex-direction: column;
    }
    .custom-node {
      display: flex; align-items: center; justify-content: space-between; width: 100%;
      padding: 2px 4px; border-radius: 4px;
    }
    .custom-node:hover { background: #f5f5f5; }
    .node-label {
      display: inline-flex; align-items: center; gap: 6px; cursor: pointer; flex: 1;
      min-width: 0; overflow: hidden;
    }
    .node-title {
      display: inline-block; max-width: 300px; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap;
    }
    .node-title .type-tag { color: #999; font-size: 11px; margin-left: 6px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .status-dot.online { background: #52c41a; }
    .status-dot.offline { background: #ff4d4f; }
    .node-actions {
      display: inline-flex; align-items: center; gap: 10px; opacity: 0;
      transition: opacity 0.2s; padding-right: 8px;
    }
    .custom-node:hover .node-actions { opacity: 1; }
    .node-actions a { color: #999; font-size: 14px; }
    .node-actions a:hover { color: #0D84FF; }
    .node-actions a.danger:hover { color: #ff4d4f; }
    .device-node .node-title { color: #333; font-weight: 500; }
    :host-context(.dark-theme) .summary-bar { background: #1f1f1f; }
    :host-context(.dark-theme) .custom-node:hover { background: #262626; }
    :host-context(.dark-theme) .device-node .node-title { color: #e0e0e0; }
  `]
})
export class SpaceTreeComponent implements OnInit {
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private msg = inject(NzMessageService);
  private token = inject(TokenService);

  rootSpaceId = '';
  rootSpace = signal<SpaceEntity | null>(null);
  devices = signal<DeviceEntity[]>([]);
  loading = signal(false);
  submitting = false;

  nodeList = signal<TreeNode[]>([]);
  productNames: Record<string, string> = {};

  // Create space
  createSpaceVisible = false;
  spaceName = '';
  spaceType = 'building';
  spaceParentId: string | null = null;

  // Rename
  renameVisible = false;
  renameTarget: SpaceEntity | null = null;
  renameName = '';

  // Add device
  addDeviceVisible = false;
  deviceDid = '';
  deviceType = '';

  // Delete
  deleteVisible = false;
  deleteTarget: SpaceEntity | null = null;

  ngOnInit(): void {
    this.rootSpaceId = this.route.snapshot.paramMap.get('rootId') || '';
    if (this.rootSpaceId) this.loadGraph();
  }

  private loadGraph(): void {
    this.loading.set(true);
    this.api.getSpaceGraph(this.rootSpaceId).subscribe({
      next: (graph) => {
        const root = this.buildTree(graph.spaces || []);
        this.rootSpace.set(root);
        const allDevices = graph.devices || [];
        this.devices.set(allDevices);
        this.nodeList.set(this.buildTreeNodes(root, allDevices, 0));
        if (allDevices.length > 0) this.loadProductNames(allDevices);
        this.loading.set(false);
      },
      error: (err) => { this.msg.error(err.message); this.loading.set(false); }
    });
  }

  private buildTree(spaces: SpaceEntity[]): SpaceEntity | null {
    if (!spaces.length) return null;
    const byParent = new Map<string | undefined, SpaceEntity[]>();
    spaces.forEach(s => {
      const key = s.parentId || '';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(s);
    });
    const root = spaces[0];
    const assign = (parent: SpaceEntity) => {
      parent.children = byParent.get(parent.id) || [];
      parent.children.forEach(assign);
    };
    assign(root);
    return root;
  }

  private buildTreeNodes(space: SpaceEntity | null, devices: DeviceEntity[], depth: number): TreeNode[] {
    if (!space) return [];
    const result: TreeNode[] = [];

    (space.children || []).forEach(child => {
      const spaceDevices = devices.filter(d => d.space?.spaceId === child.id);
      const childNodes = this.buildTreeNodes(child, devices, depth + 1);
      spaceDevices.forEach(d => childNodes.push(this.deviceNode(d)));
      const node: TreeNode = {
        title: `${child.name || '未命名'} <span class="type-tag">${this.typeLabel(child.type || '')}</span>`,
        key: `space_${child.id}`,
        icon: this.typeIcon(child.type || ''),
        expanded: depth < 1,
        children: childNodes,
        isLeaf: childNodes.length === 0,
        space: child,
      };
      result.push(node);
    });

    // Root devices
    const rootDevices = devices.filter(d => d.space?.spaceId === space.id);
    rootDevices.forEach(d => result.push(this.deviceNode(d)));
    return result;
  }

  private deviceNode(d: DeviceEntity): TreeNode {
    const model = extractModelFromUrn(d.type);
    const name = (model && this.productNames[model])
      || extractTypeName(d.type) || d.type || d.did || '未知设备';
    return {
      title: `${name}${d.did ? ` <small style="color:#999">(${d.did.substring(0, 20)}${d.did.length > 20 ? '…' : ''})</small>` : ''}`,
      key: `device_${d.did}`,
      icon: 'appstore',
      expanded: false,
      children: [],
      isLeaf: true,
      isDevice: true,
      device: d,
    };
  }

  private loadProductNames(devices: DeviceEntity[]): void {
    const orgId = this.token.currentOrgId;
    if (!orgId) return;
    this.api.getVisibleProducts(orgId).subscribe({
      next: (products) => {
        products.forEach(p => { if (p.model) this.productNames[p.model] = productDisplayName(p); });
        const root = this.rootSpace();
        if (root) this.nodeList.set(this.buildTreeNodes(root, this.devices(), 0));
      }
    });
  }

  onSpaceClick(node: TreeNode): void {
    // Toggle expansion handled by nz-tree's expand icon; nothing else here
  }

  onDeviceClick(node: TreeNode): void {
    if (node.device?.did) this.router.navigate(['/devices', node.device.did]);
  }

  showCreateSpace(parentId?: string): void {
    this.createSpaceVisible = true;
    this.spaceName = '';
    this.spaceParentId = parentId || this.rootSpaceId;
    // Infer default type from parent
    const parent = parentId ? this.findSpace(parentId) : null;
    this.spaceType = this.inferChildType(parent?.type || 'site');
  }

  createSpace(): void {
    if (!this.spaceName) return;
    this.submitting = true;
    this.api.createSpace({
      name: this.spaceName,
      type: this.spaceType,
      parentId: this.spaceParentId,
      rootId: this.rootSpaceId,
    } as SpaceEntity).subscribe({
      next: () => { this.submitting = false; this.createSpaceVisible = false; this.msg.success('空间已创建'); this.loadGraph(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }

  showRenameSpace(space: SpaceEntity): void {
    this.renameTarget = space;
    this.renameName = space.name || '';
    this.renameVisible = true;
  }

  renameSpace(): void {
    if (!this.renameTarget?.id || !this.renameName) return;
    this.submitting = true;
    this.api.updateSpace({ id: this.renameTarget.id, name: this.renameName } as SpaceEntity).subscribe({
      next: () => { this.submitting = false; this.renameVisible = false; this.msg.success('重命名成功'); this.loadGraph(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }

  showDeleteSpace(space: SpaceEntity): void {
    this.deleteTarget = space;
    this.deleteVisible = true;
  }

  confirmDelete(): void {
    if (!this.deleteTarget?.id) return;
    this.submitting = true;
    this.api.deleteSpace(this.deleteTarget.id).subscribe({
      next: () => { this.submitting = false; this.deleteVisible = false; this.msg.success('删除成功'); this.loadGraph(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }

  showAddDevice(): void {
    this.addDeviceVisible = true;
    this.deviceDid = '';
    this.deviceType = '';
  }

  addDevice(): void {
    if (!this.deviceDid || !this.deviceType) return;
    this.submitting = true;
    this.api.addDevices(this.rootSpaceId, [{ did: this.deviceDid, type: this.deviceType }]).subscribe({
      next: () => { this.submitting = false; this.addDeviceVisible = false; this.msg.success('设备已添加'); this.loadGraph(); },
      error: (err) => { this.submitting = false; this.msg.error(err.message); }
    });
  }

  private findSpace(id: string): SpaceEntity | null {
    const search = (space: SpaceEntity | null): SpaceEntity | null => {
      if (!space) return null;
      if (space.id === id) return space;
      for (const child of space.children || []) {
        const found = search(child);
        if (found) return found;
      }
      return null;
    };
    return search(this.rootSpace());
  }

  private inferChildType(parentType: string): string {
    switch (parentType) {
      case 'site': return 'building';
      case 'building': return 'floor';
      case 'floor': return 'room';
      case 'room': return 'zone';
      default: return 'building';
    }
  }

  private typeLabel(type: string): string {
    const map: Record<string, string> = {
      site: '站点', building: '楼栋', floor: '楼层',
      room: '房间', zone: '区域', field: '场地', workshop: '车间', parking: '停车场'
    };
    return map[type.toLowerCase()] || type;
  }

  private typeIcon(type: string): string {
    const map: Record<string, string> = {
      site: 'bank', building: 'build', floor: 'bars',
      room: 'border-inner', zone: 'environment',
    };
    return map[type.toLowerCase()] || 'folder';
  }
}
