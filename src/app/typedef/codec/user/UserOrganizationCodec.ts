import {UserOrganization, OrganizationMember, Person} from '../../define/user/UserOrganization';

export class OrganizationMemberCodec {

  public static encode(member: OrganizationMember): any {
    return {
      userId: member.userId,
      role: member.role,
      name: member.name,
    };
  }

  static decode(o: any): OrganizationMember {
    let member = new OrganizationMember();
    member.userId = o.userId;
    member.role = o.role;
    member.name = o.name;
    member.email = o.email;
    member.update = o.update ? new Date(o.update.replace(/\[UTC]$/, "")) : null;
    return member;
  }

  public static decodeArray(array: Object): OrganizationMember[] {
    const list: Array<OrganizationMember> = [];

    if (array == null) {
      return [];
    }

    if (array instanceof Array) {
      for (const item of array) {
        list.push(this.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: OrganizationMember[]): any {
    return list.map(x => {
      return OrganizationMemberCodec.encode(x);
    });
  }
}

export class UserOrganizationCodec {

  public static encode(organization: UserOrganization): any {
    let o: any = {
      code: organization.id,
      name: organization.name,
      creator: {
        id: organization.creator.id,
        name: organization.creator.name,
        timestamp: organization.creator.timestamp
      },
      members: OrganizationMemberCodec.encodeArray(organization.members),
      personal: organization.personal
    };

    if (organization.id.length > 0) {
      o.id = organization.id;
    }

    return o;
  }

  static decode(o: any): UserOrganization {
    let organization = new UserOrganization();
    organization.id = o.code;
    organization.name = o.name;
    if (o.creator) {
      organization.creator.id = o.creator.id;
      organization.creator.name = o.creator.name;
      organization.creator.timestamp = o.creator.timestamp ? new Date(o.creator.timestamp.replace(/\[UTC]$/, "")) : null;
    }
    organization.members = OrganizationMemberCodec.decodeArray(o.members);
    organization.personal = o.personal;
    return organization;
  }

  public static decodeArray(array: Object): UserOrganization[] {
    const list: Array<UserOrganization> = [];

    if (array == null) {
      return [];
    }

    if (array instanceof Array) {
      for (const item of array) {
        list.push(this.decode(item));
      }
    }

    return list;
  }

  static encodeArray(list: UserOrganization[]): any {
    return list.map(x => {
      return UserOrganizationCodec.encode(x);
    });
  }
}
