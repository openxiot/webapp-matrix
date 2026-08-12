import {Oauth2Configuration} from '../../define/oauth/Oauth2Configuration';

export class Oauth2ConfigurationCodec {
  static decode(o: any): Oauth2Configuration {
    const x: Oauth2Configuration = new Oauth2Configuration();

    x.type = o.type || 'null';
    x.platformId = o.platformId || '';
    x.platformName = o.platformName || '';
    x.clientId = o.clientId || '';
    x.clientSecret = o.clientSecret || '';
    x.callbackUrl = o.callbackUrl || '';
    x.accessTokenUrl = o.accessTokenUrl || '';
    x.profileUrl = o.profileUrl || '';
    x.redirectUrl = o.redirectUrl || '';
    x.authorizeUrl = o.authorizeUrl || '';
    x.icon = o.icon || '';
    x.available = o.available || false;

    return x;
  }

  static encode(x: Oauth2Configuration): any {
    return {
      type: x.type || '',
      platformId: x.platformId,
      platformName: x.platformName,
      clientId: x.clientId,
      clientSecret: x.clientSecret,
      callbackUrl: x.callbackUrl,
      accessTokenUrl: x.accessTokenUrl,
      profileUrl: x.profileUrl,
      redirectUrl: x.redirectUrl,
      authorizeUrl: x.authorizeUrl,
      icon: x.icon,
      available: x.available
    };
  }

  static decodeArray(list: Object): Oauth2Configuration[] {
    const array: Oauth2Configuration[] = [];

    if (list instanceof Array) {
      list.forEach(json => {
        const item = Oauth2ConfigurationCodec.decode(json);
        if (item.type === 'web') {
          array.push(item);
        }
      });
    }

    return array;
  }

  static encodeArray(list: Oauth2Configuration[]): any {
    return list.map(x => {
      return Oauth2ConfigurationCodec.encode(x);
    });
  }
}
