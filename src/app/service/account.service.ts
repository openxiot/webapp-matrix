import { Injectable, signal } from "@angular/core";
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserOrganizationService } from './user.organization.service';
import { UserOrganization } from '../typedef/define/user/UserOrganization';
import { User } from '../typedef/define/user/User';
import { UserCodec } from '../typedef/codec/user/UserCodec';
import { UserSettings } from '../typedef/define/user/UserSettings';
import { UserSettingsCodec } from '../typedef/codec/user/UserSettingsCodec';
import { UserSettingsService } from './user.settings.service';
import { SpaceEntity } from '../typedef/define/space/SpaceEntity';
import { MatrixService } from './matrix.service';

@Injectable({ providedIn: 'root' })
export class AccountService {
  public loading = signal(false);
  public organizations: UserOrganization[] = [];
  public spaces: SpaceEntity[] = [];

  public login = signal(false);
  public user = signal<User>(new User());
  public organization = signal<UserOrganization>(new UserOrganization());
  public space = signal<SpaceEntity>(new SpaceEntity());
  public userSettings = signal<UserSettings>(new UserSettings());

  constructor(
    private service: UserOrganizationService,
    private settingsService: UserSettingsService,
    private matrix: MatrixService,
    private msg: NzMessageService,
  ) {
    const a = localStorage.getItem('user') || null;
    if (a !== null) {
      this.user.set(UserCodec.decode(JSON.parse(a)));
      this.login.set(true);
    }
  }

  setOrganization(organization: UserOrganization) {
    if (this.isOrganizationChanged(organization)) {
      localStorage.setItem('organizationId', organization.id);

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
  }

  public load() {
    this.loadSettings();
  }

  /** 读取当前用户设置：先同步读缓存立即渲染，再刷新服务器值（避免菜单闪烁） */
  private loadSettings() {
    if (this.login()) {
      const cached = localStorage.getItem('userSettings');
      if (cached !== null) {
        this.userSettings.set(UserSettingsCodec.decode(JSON.parse(cached)));
      }

      this.settingsService.getSettings().subscribe({
        next: (settings) => {
          this.userSettings.set(settings);
          localStorage.setItem('userSettings', UserSettingsCodec.encode(settings));

          this.loadOrganizations();
          this.loadRootSpaces();
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
        // 保存成功后清空已选组织（组织可能已被禁用，不再保留选中状态）
        this.clearCurrentOrganization();
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

  private loadOrganizations() {
    if (this.login()) {
      this.service.getOrganizations().subscribe({
        next: (data) => {
          this.organizations = data;
          // this.selectCurrentOrganization();
          this.loading.set(false);
        },
        error: (error) => {
          this.msg.warning(error);
        },
      });
    }
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
