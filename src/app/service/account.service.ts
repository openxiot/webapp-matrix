import { Injectable, signal } from "@angular/core";
import { NzMessageService } from 'ng-zorro-antd/message';
import { UserOrganizationService } from './user.organization.service';
import { Organization } from '../typedef/define/user/Organization';
import { User } from '../typedef/define/user/User';
import { UserCodec } from '../typedef/codec/user/UserCodec';

@Injectable({ providedIn: 'root' })
export class AccountService {
  public loading = signal(false);
  public organizations: Organization[] = [];

  public login = signal(false);
  public user = signal<User>(new User());
  public organization = signal<Organization>(new Organization());

  /** 当前项目（根空间）上下文，持久化到 localStorage */
  public currentRootSpaceId = signal<string | null>(localStorage.getItem('current_root_space_id'));
  public currentRootSpaceName = signal<string | null>(
    localStorage.getItem('current_root_space_name'),
  );

  constructor(
    private service: UserOrganizationService,
    private msg: NzMessageService,
  ) {
    const a = localStorage.getItem('user') || null;
    if (a !== null) {
      this.user.set(UserCodec.decode(JSON.parse(a)));
      this.login.set(true);
    }

    console.info('AccountService Constructed: ', this.user);
    console.info('user.avatar: ' + this.user().avatar);
  }

  setOrganization(organization: Organization) {
    if (this.isOrganizationChanged(organization)) {
      localStorage.setItem('organizationId', organization.id);

      this.organization.set(organization);
      // 切换组织后清空当前项目（对齐 Android TokenManager 行为）
      this.clearCurrentRootSpace();
    }
  }

  public isCurrentOrganization(organization: Organization): boolean {
    if (this.organization()) {
      return this.organization().id === organization.id;
    }

    return false;
  }

  setCurrentRootSpace(id: string, name: string) {
    localStorage.setItem('current_root_space_id', id);
    localStorage.setItem('current_root_space_name', name);
    this.currentRootSpaceId.set(id);
    this.currentRootSpaceName.set(name);
  }

  clearCurrentRootSpace() {
    localStorage.removeItem('current_root_space_id');
    localStorage.removeItem('current_root_space_name');
    this.currentRootSpaceId.set(null);
    this.currentRootSpaceName.set(null);
  }

  private isOrganizationChanged(organization: Organization): boolean {
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
    this.currentRootSpaceId.set(null);
    this.currentRootSpaceName.set(null);
  }

  public loadOrganizations() {
    if (this.login()) {
      this.service.getOrganizations().subscribe({
        next: (data) => {
          this.organizations = data;
          this.selectCurrentOrganization();
          this.loading.set(false);
        },
        error: (error) => {
          this.msg.warning(error);
        },
      });
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
}
