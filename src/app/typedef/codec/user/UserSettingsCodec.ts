import { UserSettings } from '../../define/user/UserSettings';

export class UserSettingsCodec {

  public static encode(settings: UserSettings): string {
    return JSON.stringify(settings);
  }

  static decode(o: any): UserSettings {
    const settings = new UserSettings();
    // 字段缺失 / null / 非 boolean 一律兜底为 false（默认不启用）
    settings.organizationEnabled = o?.organizationEnabled === true;
    return settings;
  }
}
