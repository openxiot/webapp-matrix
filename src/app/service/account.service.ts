import { Injectable, signal } from "@angular/core";
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserOrganization } from '@app/typedef/define/user/UserOrganization';
import { User } from '@app/typedef/define/user/User';
import { UserCodec } from '@app/typedef/codec/user/UserCodec';
import { UserSettings } from '@app/typedef/define/user/UserSettings';
import { UserSettingsCodec } from '@app/typedef/codec/user/UserSettingsCodec';
import { UserSettingsService } from './user.settings.service';
import { SpaceEntity } from '@app/typedef/define/space/SpaceEntity';
import { MatrixService } from './matrix.service';
import { UserOrganizationService } from './user.organization.service';

@Injectable({ providedIn: 'root' })
export class AccountService {

  public loading = signal(false);
  private spaces: SpaceEntity[] = [];

  public login = signal(false);
  public user = signal<User>(new User());
  public organization = signal<UserOrganization>(new UserOrganization());
  public space = signal<SpaceEntity>(new SpaceEntity());
  public userSettings = signal<UserSettings>(new UserSettings());

  constructor(
    private settingsService: UserSettingsService,
    private matrix: MatrixService,
    private msg: NzMessageService,
    private organizations: UserOrganizationService,
  ) {
    const a = localStorage.getItem('user') || null;
    if (a !== null) {
      this.user.set(UserCodec.decode(JSON.parse(a)));
      this.login.set(true);
    }
  }

  setOrganization(organization: UserOrganization) {
    if (this.isOrganizationChanged(organization)) {
      // 取消选中传进来的是空对象：存一个空串进去只会让下次启动多转一圈（还要去核对一个
      // 查无此人的 id），干脆把这条记录删掉。
      if (organization.id) {
        localStorage.setItem('organizationId', organization.id);
      } else {
        localStorage.removeItem('organizationId');
      }

      this.organization.set(organization);

      // 切换组织后清空当前项目（对齐 Android TokenManager 行为）
      this.clearCurrentRootSpace();

      this.loadRootSpaces();
    }
  }

  public isCurrentOrganization(organization: UserOrganization): boolean {
    if (this.organization()) {
      return this.organization().id === organization.id;
    }

    return false;
  }

  public isCurrentProject(space: SpaceEntity): boolean {
    if (this.space()) {
      return this.space().id === space.id;
    }

    return false;
  }

  setCurrentProject(space: SpaceEntity) {
    localStorage.setItem('spaceId', space.id);
    this.space.set(space);
  }

  clearCurrentRootSpace() {
    localStorage.removeItem('spaceId');
    this.space.set(new SpaceEntity());
  }

  private isOrganizationChanged(organization: UserOrganization): boolean {
    if (this.organization) {
      return this.organization().id !== organization.id;
    } else {
      return true;
    }
  }

  setUser(user: User) {
    console.log('setUser: ', user);
    localStorage.setItem('user', UserCodec.encode(user));
    this.user.set(user);
    this.login.set(true);
  }

  clear() {
    console.log('clear');
    localStorage.clear();
    this.login.set(false);
    this.space.set(new SpaceEntity());
    this.userSettings.set(new UserSettings());
    // 组织也得复位：它是「当前账号」的一部分，留着的话换个账号登录后它还在，
    // 拦截器照旧发上一个账号的组织 id，新账号的项目列表整个拉不出来。
    this.organization.set(new UserOrganization());
  }

  public load() {
    this.loadSettings();
  }

  /** 读取当前用户设置：先同步读缓存立即渲染，再刷新服务器值（避免菜单闪烁） */
  private loadSettings() {
    if (this.login()) {
      this.loading.set(true);

      const cached = localStorage.getItem('userSettings');
      if (cached !== null) {
        this.userSettings.set(UserSettingsCodec.decode(JSON.parse(cached)));
      }

      this.settingsService.getSettings().subscribe({
        next: (settings) => {
          this.userSettings.set(settings);
          localStorage.setItem('userSettings', UserSettingsCodec.encode(settings));

          this.loading.set(false);

          this.restoreOrganization();
        },
        error: (error) => {
          this.msg.warning(error);
        },
      });
    }
  }

  /** 更新当前用户设置：先乐观更新本地，失败则回滚为服务器上的值 */
  updateSettings(settings: UserSettings) {
    this.userSettings.set(settings);
    localStorage.setItem('userSettings', UserSettingsCodec.encode(settings));
    this.settingsService.updateSettings(settings).subscribe({
      next: () => {
        // 只有**关掉**组织功能才清空已选组织：组织从界面上消失了，留着选中态没有意义。
        // 打开时不清 —— 选中态在关掉那一刻已经清过了，再清一次是空操作。
        if (!settings.organizationEnabled) {
          this.clearCurrentOrganization();
        }
        this.load();
      },
      error: (error) => {
        this.msg.warning(error);
        this.loadSettings();
      },
    });
  }

  /** 清空已选组织：移除 localStorage 记录并复位信号，同时清空其下的当前项目（对齐切换组织行为） */
  private clearCurrentOrganization() {
    localStorage.removeItem('organizationId');
    this.organization.set(new UserOrganization());
    this.clearCurrentRootSpace();
  }

  /**
   * 恢复上次选中的组织，然后再拉项目列表。
   *
   * <p>组织只活在内存里，刷新一次就没了 —— 而 {@code GET /space/all} 要靠 X-Org-Id 才知道该列
   * 哪个组织的项目（不带头就是「只要个人项目」）。于是刷新之后，组织的项目从列表里整体消失，
   * 本地记着的 spaceId 在列表里也找不到，当前项目跟着变空。</p>
   *
   * <p>本地那个 id 可能已经失效（组织被删、自己被移出），拿它去查就是一路
   * Organization not found，而它一直躺在本地、每次进来都重来一遍。所以先跟服务端的组织列表核一遍：
   * 对得上才用，对不上就地清掉。请求本身失败则**不清** —— 那多半只是网络抖动，
   * 不该顺手把用户的选择抹掉。</p>
   */
  private restoreOrganization() {
    const saved = localStorage.getItem('organizationId') || null;
    if (saved === null || !this.userSettings().organizationEnabled) {
      this.loadRootSpaces();
      return;
    }

    this.organizations.getOrganizations().subscribe({
      next: (organizations) => {
        const found = organizations.find((o) => o.id === saved);
        if (found) {
          // 这里直接 set，不走 setOrganization：那个带「切换组织」的语义（clearCurrentRootSpace），
          // 而这一步恰恰是要把本地记着的 spaceId 捞回来，清了就白记了。
          this.organization.set(found);
        } else {
          localStorage.removeItem('organizationId');
        }
        this.loadRootSpaces();
      },
      error: () => {
        this.loadRootSpaces();
      },
    });
  }

  private loadRootSpaces() {
    this.loading.set(true);
    this.matrix.getAllSpaces().subscribe({
      next: (data) => {
        this.spaces = data;
        this.selectCurrentSpace();
        this.loading.set(false);
      },
      error: (error) => {
        this.msg.warning(error);
      },
    });
  }

  private selectCurrentSpace() {
    const selected = localStorage.getItem('spaceId') || null;
    if (selected !== null) {
      const project = this.spaces.find((x) => x.id === selected);
      if (project) {
        this.setCurrentProject(project);
      }
    } else {
      if (this.spaces.length > 0) {
        const project = this.spaces[0];
        this.setCurrentProject(project);
      }
    }
  }
}
