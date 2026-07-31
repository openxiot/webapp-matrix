/** API response wrapper matching Android ApiResponse<T> */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface PlatformInfo {
  platformId: string;
  platformName: string;
  clientId: string;
  callbackUrl: string;
  authorizeUrl: string;
  icon?: string;
  available: boolean;
}

export interface Creator {
  id?: string;
  name?: string;
  timestamp?: string;
}

export interface Member {
  developerId: string;
  name: string;
  role: string;
  email?: string;
}

export interface Organization {
  code?: string;
  name?: string;
  creator?: Creator;
  members?: Member[];
}

export interface SpaceEntity {
  id?: string;
  tenantId?: string;
  name?: string;
  type?: string;
  typeAlias?: string;
  parentId?: string;
  rootId?: string;
  level?: number;
  ancestors?: string[];
  sortOrder?: number;
  children?: SpaceEntity[];
  devices?: DeviceEntity[];
  createTime?: string;
  updateTime?: string;
}

export interface DeviceSpaceRef {
  spaceId?: string;
  rootId?: string;
}

export interface DeviceEntity {
  did?: string;
  type?: string;
  online?: boolean;
  protocol?: string;
  lastOnline?: string;
  lastOffline?: string;
  space?: DeviceSpaceRef;
}

export interface SpaceGraph {
  spaces?: SpaceEntity[];
  devices?: DeviceEntity[];
}

export interface DeviceRegistration {
  did: string;
  type: string;
}

export interface MoveDeviceRequest {
  spaceId: string;
  rootSpaceId: string;
  dids: string[];
}

export interface LocalizedName {
  'zh-CN'?: string;
}

export interface ProductEntity {
  id?: string;
  name?: LocalizedName;
  model?: string;
  protocol?: string;
  lifecycle?: string;
  icon?: string;
  organization?: string;
  template?: string;
}

export function productDisplayName(p: ProductEntity): string {
  return p.name?.['zh-CN'] || p.model || p.id || '未知产品';
}

/** Helper utilities for device type URN parsing */
export function extractModelFromUrn(urn: string | null | undefined): string | null {
  if (!urn) return null;
  const parts = urn.split(':');
  return parts.length >= 7 ? parts[6] : null;
}

export function extractTypeName(urn: string | null | undefined): string | null {
  if (!urn) return null;
  const parts = urn.split(':');
  return parts.length >= 4 ? parts[3] : null;
}

export function extractOrgModel(urn: string | null | undefined): { org: string; model: string } | null {
  if (!urn) return null;
  const parts = urn.split(':');
  if (parts.length >= 7) return { org: parts[5], model: parts[6] };
  return null;
}
