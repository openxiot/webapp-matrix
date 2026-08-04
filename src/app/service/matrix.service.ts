import {Injectable} from "@angular/core";
import {environment} from "../../environments/environment";
import {HttpClient} from "@angular/common/http";
import {lastValueFrom, map, Observable} from "rxjs";
import {OxResponse} from "./response/OxResponse";
import {Organization, OrganizationMember} from '../typedef/define/developer/Organization';
import {OrganizationCodec, OrganizationMemberCodec} from '../typedef/codec/developer/OrganizationCodec';
import { Oauth2Configuration } from '../typedef/define/oauth/Oauth2Configuration';
import { Oauth2ConfigurationCodec } from '../typedef/codec/oauth/Oauth2ConfigurationCodec';
import { ProductBasic, ProductBasicCodec } from '@openxiot/xiot-core-spec-ts';

@Injectable({providedIn: 'root'})
export class MatrixService {
  private server: string = environment.server;
  private account: string = environment.account;

  constructor(
    private http: HttpClient
  ) {
  }

  getDeveloperPlatforms(): Observable<Oauth2Configuration[]> {
    return this.http
      .get<OxResponse>(`${this.account}/developer/platform/all`)
      .pipe(map(response => Oauth2ConfigurationCodec.decodeArray(response.data)));
  }

  /**------------------------------------------------------------------------------------------------
   * 组织
   *------------------------------------------------------------------------------------------------*/
  createOrganization(organizationId: string, name: string): Observable<void> {
    console.log(`addOrganization: ${organizationId}/${name}`);
    return this.http
      .post(`${this.account}/organization/one/${organizationId}`, {name})
      .pipe(map(() => undefined));
  }

  removeOrganization(organizationId: string): Observable<void> {
    console.log(`removeOrganization: ${organizationId}`);
    return this.http
      .delete(`${this.account}/organization/one/${organizationId}`)
      .pipe(map(() => undefined));
  }

  updateOrganizationName(organizationId: string, name: string): Observable<void> {
    console.log(`updateOrganizationName: ${organizationId} => ${name}`);
    return this.http
      .put(`${this.account}/organization/one/${organizationId}`, {name: name})
      .pipe(map(() => undefined));
  }

  addOrganizationMember(organizationId: string, member: OrganizationMember) {
    console.log(`addOrganizationMember: ${organizationId} => ${member}`);
    return this.http
      .post(`${this.account}/organization/member/${organizationId}`, OrganizationMemberCodec.encode(member))
      .pipe(map(() => undefined));
  }

  getOrganization(organizationId: string): Observable<Organization> {
    console.log(`getOrganization: ${organizationId}`);
    return this.http
      .get<OxResponse>(`${this.account}/organization/one/${organizationId}`)
      .pipe(map(response => OrganizationCodec.decode(response.data)));
  }

  getOrganizations(): Observable<Organization[]> {
    return this.http
      .get<OxResponse>(`${this.account}/organization/many`)
      .pipe(map(response => OrganizationCodec.decodeArray(response.data)));
  }

  getAllOrganizations(): Observable<Organization[]> {
    return this.http
      .get<OxResponse>(`${this.account}/organization/all`)
      .pipe(map(response => OrganizationCodec.decodeArray(response.data)));
  }

  /**------------------------------------------------------------------------------------------------
   * 产品
   *------------------------------------------------------------------------------------------------*/

  /**
   * 读取公开产品列表
   */
  private getPublicProducts(): Observable<ProductBasic[]> {
    console.log('getPublicProducts');
    return this.http
      .get<OxResponse>(`${this.server}/v1/product/basic/public`)
      .pipe(map(response => ProductBasicCodec.decodeArray(response.data)));
  }
}
