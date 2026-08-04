import {Organization, OrganizationMember, Person} from '../../define/developer/Organization';

export class OrganizationMemberCodec {

  public static encode(member: OrganizationMember): any {
    return {
      developerId: member.developerId,
      role: member.role,
      name: member.name
    }
  }

  static decode(o: any): OrganizationMember {
    let member = new OrganizationMember();
    member.developerId = o.developerId;
    member.role = o.role;
    member.name = o.name;
    member.update = new Date(o.update?.replace(/\[UTC]$/, ""));
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

export class OrganizationCodec {

  public static encode(organization: Organization): any {
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

  static decode(o: any): Organization {
    let organization = new Organization();
    organization.id = o.code;
    organization.name = o.name;
    if (o.creator) {
      organization.creator.id = o.creator.id;
      organization.creator.name = o.creator.name;
      organization.creator.timestamp = new Date(o.creator.timestamp?.replace(/\[UTC]$/, ""));
    }
    organization.members = OrganizationMemberCodec.decodeArray(o.members);
    organization.personal = o.personal;
    return organization;
  }

  public static decodeArray(array: Object): Organization[] {
    const list: Array<Organization> = [];

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

  static encodeArray(list: Organization[]): any {
    return list.map(x => {
      return OrganizationCodec.encode(x);
    });
  }
}
