export class OrganizationMember {
  developerId: string = '';
  role: string = '';
  name: string = '';
  update: Date = new Date();
}

export class Person {
  id: string = '';
  name: string = '';
  timestamp: Date = new Date();
}

export class Organization {
  id: string = '';
  name: string = '';
  creator: Person = new Person();
  members: OrganizationMember[] = [];
  personal: boolean = false;
  _role: string = 'member';
}
