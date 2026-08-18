import { Injectable, signal } from "@angular/core";
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserOrganizationService } from './user.organization.service';
import { UserOrganization } from '../typedef/define/user/UserOrganization';
import { User } from '../typedef/define/user/User';
import { UserCodec } from '../typedef/codec/user/UserCodec';
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

  constructor(
    private service: UserOrganizationService,
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

  /** 清空当前组织（退出虚拟组织后使用），同时清空当前项目 */
  clearCurrentOrganization() {
    localStorage.removeItem('organizationId');
    this.organization.set(new UserOrganization());
    this.clearCurrentRootSpace();
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
  }

  public load() {
    this.loadOrganizations();
  }

  private loadOrganizations() {
    if (this.login()) {
      this.service.getOrganizations().subscribe({
        next: (data) => {
          this.organizations = data;
          this.selectCurrentOrganization();
          this.loading.set(false);

          this.loadSpaces();
        },
        error: (error) => {
          this.msg.warning(error);
        },
      });
    }
  }

  private loadSpaces() {
    if (this.organization()) {
      if (this.organization().id.length > 0) {
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
    }
  }

  private selectCurrentOrganization() {
    const selected = localStorage.getItem('organizationId') || null;
    if (selected !== null) {
      const org = this.organizations.find((x) => x.id === selected);
      if (org) {
        this.setOrganization(org);
      }
    } else {
      if (this.organizations.length > 0) {
        const org = this.organizations[0];
        this.setOrganization(org);
      }
    }
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
