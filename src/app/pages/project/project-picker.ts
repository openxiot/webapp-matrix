import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzListModule } from 'ng-zorro-antd/list';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { AccountService } from '../../service/account.service';
import { SiteService } from '../../service/site.service';
import { SpaceEntity } from '../../typedef/define/space/SpaceEntity';

@Component({
  selector: 'app-project-picker',
  imports: [
    FormsModule,
    NzButtonModule,
    NzEmptyModule,
    NzIconModule,
    NzInputModule,
    NzListModule,
    NzModalModule,
    NzPopconfirmModule,
    NzSpinModule,
    NzTagModule,
    NzTooltipModule,
  ],
  templateUrl: './project-picker.html',
  styleUrl: './project-picker.less',
})
export class ProjectPicker implements OnInit {
  loading: boolean = false;
  projects: SpaceEntity[] = [];
  createVisible: boolean = false;
  renameVisible: boolean = false;
  renameTarget: SpaceEntity | null = null;
  newName: string = '';
  renameName: string = '';

  constructor(
    public account: AccountService,
    private site: SiteService,
    private msg: NzMessageService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.site.getAllSpaces().subscribe({
      next: (data) => {
        this.projects = data;
        this.loading = false;
      },
      error: (e) => {
        this.msg.error(e?.message ?? e);
        this.loading = false;
      },
    });
  }

  routerBack() {
    this.router.navigate(['/project']);
  }

  select(project: SpaceEntity) {
    this.account.setCurrentRootSpace(project.id, project.name);
    this.msg.success(`已切换到项目：${project.name}`);
    this.router.navigate(['/project']);
  }

  toManage(project: SpaceEntity) {
    this.router.navigate(['/space', project.id]);
  }

  openCreate() {
    this.newName = '';
    this.createVisible = true;
  }

  submitCreate() {
    const name = this.newName.trim();
    if (!name) {
      this.msg.warning('请填写项目名称');
      return;
    }
    const space = new SpaceEntity();
    space.name = name;
    space.type = 'site';

    this.site.createSpace(space).subscribe({
      next: () => {
        this.createVisible = false;
        this.msg.success('创建成功');
        this.load();
      },
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }

  openRename(project: SpaceEntity) {
    this.renameTarget = project;
    this.renameName = project.name;
    this.renameVisible = true;
  }

  submitRename() {
    const name = this.renameName.trim();
    if (!name || !this.renameTarget) return;
    const space = Object.assign(new SpaceEntity(), this.renameTarget);
    space.name = name;

    this.site.updateSpace(space).subscribe({
      next: () => {
        this.renameVisible = false;
        this.msg.success('重命名成功');
        this.load();
      },
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }

  remove(project: SpaceEntity) {
    this.site.deleteSpace(project.id).subscribe({
      next: () => {
        this.msg.success('删除成功');
        if (this.account.currentRootSpaceId() === project.id) {
          this.account.clearCurrentRootSpace();
        }
        this.load();
      },
      error: (e) => this.msg.error(e?.message ?? e),
    });
  }
}
