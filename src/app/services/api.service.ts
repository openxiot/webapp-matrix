import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { TokenService } from './token.service';
import {
  ApiResponse, PlatformInfo, Organization, SpaceEntity,
  SpaceGraph, DeviceEntity, DeviceRegistration, MoveDeviceRequest,
  ProductEntity, Member
} from '../models/api.models';

const ACCOUNT_BASE = 'https://account.openxiot.cn';
const SITE_BASE = 'https://site.openxiot.cn';
const PRODUCT_BASE = 'https://product.openxiot.cn';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient, private token: TokenService) {}

  private headers(): HttpHeaders {
    let h = new HttpHeaders({ 'Content-Type': 'application/json' });
    const t = this.token.token;
    if (t) h = h.set('Authorization', `Bearer ${t}`);
    const orgId = this.token.currentOrgId;
    if (orgId) h = h.set('X-Org-Id', orgId);
    return h;
  }

  private handleResponse<T>(res: ApiResponse<T>): T {
    if (res.success && res.data != null) return res.data;
    throw new Error(res.message || '请求失败');
  }

  // ──── Account Service ────────
  getPlatforms(): Observable<PlatformInfo[]> {
    return this.http.get<ApiResponse<PlatformInfo[]>>(`${ACCOUNT_BASE}/developer/platform/all`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getGithubPlatform(): Observable<PlatformInfo> {
    return this.http.get<ApiResponse<PlatformInfo>>(`${ACCOUNT_BASE}/developer/platform/github`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getMyOrganizations(): Observable<Organization[]> {
    return this.http.get<ApiResponse<Organization[]>>(`${ACCOUNT_BASE}/organization/many`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getOrganization(orgId: string): Observable<Organization> {
    return this.http.get<ApiResponse<Organization>>(`${ACCOUNT_BASE}/organization/one/${orgId}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  createOrganization(id: string, name: string): Observable<Organization> {
    return this.http.post<ApiResponse<Organization>>(`${ACCOUNT_BASE}/organization/one/${id}`, { name }, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  updateOrganization(id: string, name: string): Observable<Organization> {
    return this.http.put<ApiResponse<Organization>>(`${ACCOUNT_BASE}/organization/one/${id}`, { name }, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  deleteOrganization(id: string): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${ACCOUNT_BASE}/organization/one/${id}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  addMember(orgId: string, member: Member): Observable<void> {
    return this.http.post<ApiResponse<void>>(`${ACCOUNT_BASE}/organization/member/${orgId}`, member, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  removeMember(orgId: string, memberId: string): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${ACCOUNT_BASE}/organization/member/${orgId}?memberId=${memberId}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  updateMember(orgId: string, member: Member): Observable<void> {
    return this.http.put<ApiResponse<void>>(`${ACCOUNT_BASE}/organization/member/${orgId}`, member, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  // ──── Site Service ────────
  getAllSpaces(): Observable<SpaceEntity[]> {
    return this.http.get<ApiResponse<SpaceEntity[]>>(`${SITE_BASE}/v1/space/all`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getSpace(id: string): Observable<SpaceEntity> {
    return this.http.get<ApiResponse<SpaceEntity>>(`${SITE_BASE}/v1/space/one/${id}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getSpaceTree(rootId: string): Observable<SpaceEntity> {
    return this.http.get<ApiResponse<SpaceEntity>>(`${SITE_BASE}/v1/space/tree/${rootId}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getSpaceGraph(rootId: string): Observable<SpaceGraph> {
    return this.http.get<ApiResponse<SpaceGraph>>(`${SITE_BASE}/v1/space/graph/${rootId}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  createSpace(space: SpaceEntity): Observable<SpaceEntity> {
    return this.http.post<ApiResponse<SpaceEntity>>(`${SITE_BASE}/v1/space/one`, space, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  updateSpace(space: SpaceEntity): Observable<SpaceEntity> {
    return this.http.put<ApiResponse<SpaceEntity>>(`${SITE_BASE}/v1/space/one`, space, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  deleteSpace(spaceId: string): Observable<void> {
    return this.http.delete<ApiResponse<void>>(`${SITE_BASE}/v1/space/one/${spaceId}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getDevices(spaceId: string): Observable<DeviceEntity[]> {
    return this.http.get<ApiResponse<DeviceEntity[]>>(`${SITE_BASE}/v1/device/many/${spaceId}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  addDevices(spaceId: string, devices: DeviceRegistration[]): Observable<void> {
    return this.http.post<ApiResponse<void>>(`${SITE_BASE}/v1/device/many/${spaceId}`, devices, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  addDeviceByQr(spaceId: string, body: Record<string, string>): Observable<void> {
    return this.http.post<ApiResponse<void>>(`${SITE_BASE}/v1/device/one/${spaceId}`, body, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  updateDeviceSpace(body: MoveDeviceRequest): Observable<void> {
    return this.http.put<ApiResponse<void>>(`${SITE_BASE}/v1/device/many/space`, body, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getDeviceProperties(spaceId: string, pids: string[]): Observable<Array<Record<string, any>>> {
    return this.http.get<ApiResponse<Array<Record<string, any>>>>(
      `${SITE_BASE}/v1/device/properties/${spaceId}?pid=${pids.join(',')}`, { headers: this.headers() }
    ).pipe(map(r => this.handleResponse(r)));
  }

  setDeviceProperties(spaceId: string, body: Record<string, any>): Observable<Array<Record<string, any>>> {
    return this.http.post<ApiResponse<Array<Record<string, any>>>>(`${SITE_BASE}/v1/device/properties/${spaceId}`, body, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  // ──── Product Service ────────
  getProducts(): Observable<ProductEntity[]> {
    return this.http.get<ApiResponse<ProductEntity[]>>(`${PRODUCT_BASE}/v1/product/basic/public`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getVisibleProducts(orgId: string): Observable<ProductEntity[]> {
    return this.http.get<ApiResponse<ProductEntity[]>>(`${PRODUCT_BASE}/v1/product/basic/visible/${orgId}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getProductInstance(type: string): Observable<Record<string, any>> {
    return this.http.get<ApiResponse<Record<string, any>>>(`${PRODUCT_BASE}/v1/product/instance/one/${type}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getProductByOrgModel(orgId: string, model: string): Observable<ProductEntity> {
    return this.http.get<ApiResponse<ProductEntity>>(`${PRODUCT_BASE}/v1/product/basic/one/org-model?organizationId=${orgId}&model=${model}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }

  getProductDetail(productId: string): Observable<ProductEntity> {
    return this.http.get<ApiResponse<ProductEntity>>(`${PRODUCT_BASE}/v1/product/basic/one?productId=${productId}`, { headers: this.headers() })
      .pipe(map(r => this.handleResponse(r)));
  }
}
