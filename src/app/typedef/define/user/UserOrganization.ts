export class OrganizationMember {
  userId: string = '';
  role: string = '';
  name: string = '';
  email: string = '';
  remark: string = '';
  update: Date | null = null;
}

export class Person {
  id: string = '';
  name: string = '';
  timestamp: Date | null = null;
}

export class UserOrganization {
  id: string = '';
  name: string = '';
  creator: Person = new Person();
  members: OrganizationMember[] = [];
  personal: boolean = false;
  _role: string = 'member';
}
