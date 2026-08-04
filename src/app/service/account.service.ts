import {Injectable} from "@angular/core";
import {NzMessageService} from 'ng-zorro-antd/message';
import { MatrixService } from './matrix.service';
import { Organization } from '../typedef/define/developer/Organization';
import { Developer } from '../typedef/define/developer/Developer';
import { DeveloperCodec } from '../typedef/codec/developer/DeveloperCodec';

@Injectable({ providedIn: 'root' })
export class AccountService {

  public loading: boolean = false;
  public organizations: Organization[] = [];
  public login: boolean = false;
  public developer: Developer = new Developer();
  public organization!: Organization;

  constructor(
    private main: MatrixService,
    private msg: NzMessageService,
  ) {
    const a = localStorage.getItem('developer') || null;
    if (a !== null) {
      this.developer = DeveloperCodec.decode(JSON.parse(a));
      this.login = true;
    }

    console.info('AccountService Constructed: ', this.developer);
    console.info('developer.avatar: ' + this.developer.avatar);
  }

  setOrganization(organization: Organization) {
    if (this.isOrganizationChanged(organization)) {
      localStorage.setItem('organizationId', organization.id);

      this.organization = organization;
    }
  }

  private isOrganizationChanged(organization: Organization): boolean {
    if (this.organization) {
      return this.organization.id !== organization.id;
    } else {
      return true;
    }
  }

  setDeveloper(developer: Developer) {
    console.log('setDeveloper: ', developer);
    localStorage.setItem('developer', DeveloperCodec.encode(developer));
    this.developer = developer;
    this.login = true;
  }

  clear() {
    console.log('clear');
    localStorage.clear();
    this.login = false;
  }

  public loadOrganizations() {
    if (this.login) {
      this.main.getOrganizations().subscribe({
        next: (data) => {
          this.organizations = data;
          this.selectCurrentOrganization();
          this.loading = false;
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
