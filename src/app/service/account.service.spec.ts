import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AccountService } from './account.service';
import { UserSettingsService } from './user.settings.service';
import { MatrixService } from './matrix.service';
import { UserOrganizationService } from './user.organization.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { User } from '@app/typedef/define/user/User';
import { UserSettings } from '@app/typedef/define/user/UserSettings';
import { UserOrganization } from '@app/typedef/define/user/UserOrganization';
import { SpaceEntity } from '@app/typedef/define/space/SpaceEntity';

/**
 * 当前组织是「刷新之后还剩不剩」的那一环，而它错了不会报错，只是**项目列表悄悄换了内容**
 * （组织的项目整体消失、当前项目变空），所以用例盯的是三条：
 *
 * 1. 本地记着的组织要恢复回来 —— 不恢复，`GET /space/all` 就退成「只要个人项目」。
 * 2. 恢复**不能走** `setOrganization` —— 那个带切换组织的语义（清当前项目），
 *    而这一步正要靠本地记着的 spaceId 把当前项目捞回来。
 * 3. 本地那个 id 失效时（组织被删 / 自己被移出）要就地清掉，否则它一直躺在本地，
 *    每次进来都发一个查不到的头，列表永远拉不出来。
 */

function settings(enabled: boolean): UserSettings {
  const s = new UserSettings();
  s.organizationEnabled = enabled;
  return s;
}

function organization(id: string, name = id): UserOrganization {
  const o = new UserOrganization();
  o.id = id;
  o.name = name;
  return o;
}

function space(id: string): SpaceEntity {
  const s = new SpaceEntity();
  s.id = id;
  return s;
}

describe('AccountService 恢复当前组织', () => {
  let organizations: UserOrganization[];
  let spaces: SpaceEntity[];
  let settingsValue: UserSettings;
  let orgsFails: boolean;
  let orgsCalls: number;

  /** 按需装配：每个用例只声明自己关心的那几件事 */
  function build(): AccountService {
    orgsCalls = 0;
    TestBed.configureTestingModule({
      providers: [
        AccountService,
        {
          provide: UserSettingsService,
          useValue: {
            getSettings: () => of(settingsValue),
            updateSettings: () => of(undefined),
          },
        },
        { provide: MatrixService, useValue: { getAllSpaces: () => of(spaces) } },
        {
          provide: UserOrganizationService,
          useValue: {
            getOrganizations: () => {
              orgsCalls++;
              return orgsFails ? throwError(() => new Error('offline')) : of(organizations);
            },
          },
        },
        { provide: NzMessageService, useValue: { warning: () => undefined } },
      ],
    });

    const account = TestBed.inject(AccountService);
    account.setUser(new User());
    return account;
  }

  beforeEach(() => {
    localStorage.clear();
    organizations = [organization('org-1')];
    spaces = [space('space-1')];
    settingsValue = settings(true);
    orgsFails = false;
    orgsCalls = 0;
  });

  it('本地记着组织，启动后恢复回来', () => {
    localStorage.setItem('organizationId', 'org-1');

    const account = build();
    account.load();

    expect(account.organization().id).toBe('org-1');
  });

  it('恢复时不走 setOrganization，本地记着的当前项目还在', () => {
    localStorage.setItem('organizationId', 'org-1');
    localStorage.setItem('spaceId', 'space-1');

    const account = build();
    account.load();

    expect(account.organization().id).toBe('org-1');
    expect(account.space().id).toBe('space-1');
  });

  it('组织已经不在自己的组织列表里，就地清掉本地记录，也不选它', () => {
    localStorage.setItem('organizationId', 'org-gone');

    const account = build();
    account.load();

    expect(account.organization().id).toBe('');
    expect(localStorage.getItem('organizationId')).toBeNull();
  });

  it('组织列表请求失败，不清本地记录（那多半只是网络抖动）', () => {
    localStorage.setItem('organizationId', 'org-1');
    orgsFails = true;

    const account = build();
    account.load();

    expect(account.organization().id).toBe('');
    expect(localStorage.getItem('organizationId')).toBe('org-1');
  });

  it('组织功能关着，压根不去查组织', () => {
    localStorage.setItem('organizationId', 'org-1');
    settingsValue = settings(false);

    const account = build();
    account.load();

    expect(orgsCalls).toBe(0);
    expect(account.organization().id).toBe('');
  });

  it('本地没有记录，不去查组织', () => {
    const account = build();
    account.load();

    expect(orgsCalls).toBe(0);
    expect(account.organization().id).toBe('');
  });

  it('取消选中组织时删掉本地记录，不留一个空串', () => {
    localStorage.setItem('organizationId', 'org-1');

    const account = build();
    account.setOrganization(organization('org-1'));
    account.setOrganization(new UserOrganization());

    expect(account.organization().id).toBe('');
    expect(localStorage.getItem('organizationId')).toBeNull();
  });

  it('退出登录时组织一起复位（换账号后不能还发着上一个账号的组织）', () => {
    localStorage.setItem('organizationId', 'org-1');

    const account = build();
    account.setOrganization(organization('org-1'));
    account.clear();

    expect(account.organization().id).toBe('');
  });

  it('关掉组织功能才清空已选组织', () => {
    localStorage.setItem('organizationId', 'org-1');

    const account = build();
    account.setOrganization(organization('org-1'));
    account.updateSettings(settings(false));

    expect(account.organization().id).toBe('');
    expect(localStorage.getItem('organizationId')).toBeNull();
  });

  it('打开组织功能不动已选组织', () => {
    localStorage.setItem('organizationId', 'org-1');

    const account = build();
    account.setOrganization(organization('org-1'));
    account.updateSettings(settings(true));

    expect(account.organization().id).toBe('org-1');
  });
});
