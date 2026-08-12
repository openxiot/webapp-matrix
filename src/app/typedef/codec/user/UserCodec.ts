import {User} from '../../define/user/User';

export class UserCodec {

  public static encode(developer: User): string {
    return JSON.stringify(developer);
  }

  static decode(o: any): User {
    let developer = new User();
    developer.id = o.uid;
    developer.token = o.token;
    developer.name = o.name;
    developer.platform = o.platform || '';
    developer.avatar = o.avatar;
    developer.email = o.email;
    return developer;
  }
}
