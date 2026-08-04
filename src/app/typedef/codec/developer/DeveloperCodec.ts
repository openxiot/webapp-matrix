import {Developer} from '../../define/developer/Developer';

export class DeveloperCodec {

  public static encode(developer: Developer): string {
    return JSON.stringify(developer);
  }

  static decode(o: any): Developer {
    let developer = new Developer();
    developer.uid = o.uid;
    developer.token = o.token;
    developer.name = o.name;
    developer.platform = o.platform || '';
    developer.avatar = o.avatar;
    developer.email = o.email;
    return developer;
  }
}
