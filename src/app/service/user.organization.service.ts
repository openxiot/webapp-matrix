import {Injectable} from "@angular/core";
import {environment} from "../../environments/environment";
import {HttpClient} from "@angular/common/http";
import {lastValueFrom, map, Observable} from "rxjs";
import {OxResponse} from "./response/OxResponse";
import {UserOrganization, OrganizationMember} from '@app/typedef/define/user/UserOrganization';
import {UserOrganizationCodec, OrganizationMemberCodec} from '@app/typedef/codec/user/UserOrganizationCodec';
import { Oauth2Configuration } from '@app/typedef/define/oauth/Oauth2Configuration';
import { Oauth2ConfigurationCodec } from '@app/typedef/codec/oauth/Oauth2ConfigurationCodec';

@Injectable({providedIn: 'root'})
export class UserOrganizationService {
  private server: string = environment.server;
  private account: string = environment.account;

  constructor(
    private http: HttpClient
  ) {
  }

  getUserPlatforms(): Observable<Oauth2Configuration[]> {
    return this.http
      .get<OxResponse>(`${this.account}/user/platform/all`)
      .pipe(map(response => Oauth2ConfigurationCodec.decodeArray(response.data)));
  }

  /**------------------------------------------------------------------------------------------------
   * 组织
   *------------------------------------------------------------------------------------------------*/
  createOrganization(organizationId: string, name: string): Observable<void> {
    console.log(`addOrganization: ${organizationId}/${name}`);
    return this.http
      .post(`${this.account}/user/organization/one/${organizationId}`, {name})
      .pipe(map(() => undefined));
  }

  removeOrganization(organizationId: string): Observable<void> {
    console.log(`removeOrganization: ${organizationId}`);
    return this.http
      .delete(`${this.account}/user/organization/one/${organizationId}`)
      .pipe(map(() => undefined));
  }

  updateOrganizationName(organizationId: string, name: string): Observable<void> {
    console.log(`updateOrganizationName: ${organizationId} => ${name}`);
    return this.http
      .put(`${this.account}/user/organization/one/${organizationId}`, { name: name })
      .pipe(map(() => undefined));
  }

  addOrganizationMember(organizationId: string, member: OrganizationMember) {
    console.log(`addOrganizationMember: ${organizationId} => ${member}`);
    return this.http
      .post(
        `${this.account}/user/organization/member/${organizationId}`,
        OrganizationMemberCodec.encode(member),
      )
      .pipe(map(() => undefined));
  }

  updateOrganizationMember(organizationId: string, member: OrganizationMember) {
    console.log(`updateOrganizationMember: ${organizationId} => ${member}`);
    return this.http
      .put(
        `${this.account}/user/organization/member/${organizationId}`,
        OrganizationMemberCodec.encode(member),
      )
      .pipe(map(() => undefined));
  }

  removeOrganizationMember(organizationId: string, memberId: string) {
    console.log(`removeOrganizationMember: ${organizationId} => ${memberId}`);
    return this.http
      .delete(`${this.account}/user/organization/member/${organizationId}`, {
        params: { memberId },
      })
      .pipe(map(() => undefined));
  }

  getOrganization(organizationId: string): Observable<UserOrganization> {
    console.log(`getOrganization: ${organizationId}`);
    return this.http
      .get<OxResponse>(`${this.account}/user/organization/one/${organizationId}`)
      .pipe(map((response) => UserOrganizationCodec.decode(response.data)));
  }

  getOrganizations(): Observable<UserOrganization[]> {
    return this.http
      .get<OxResponse>(`${this.account}/user/organization/many`)
      .pipe(map((response) => UserOrganizationCodec.decodeArray(response.data)));
  }

  getAllOrganizations(): Observable<UserOrganization[]> {
    return this.http
      .get<OxResponse>(`${this.account}/user/organization/all`)
      .pipe(map((response) => UserOrganizationCodec.decodeArray(response.data)));
  }
}
