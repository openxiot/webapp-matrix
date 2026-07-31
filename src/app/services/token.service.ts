import { Injectable } from '@angular/core';

const STORAGE_KEY = 'openxiot_prefs';

@Injectable({ providedIn: 'root' })
export class TokenService {
  private getItem(key: string): string | null {
    try {
      return localStorage.getItem(`${STORAGE_KEY}_${key}`);
    } catch {
      return null;
    }
  }

  private setItem(key: string, value: string | null): void {
    try {
      if (value) {
        localStorage.setItem(`${STORAGE_KEY}_${key}`, value);
      } else {
        localStorage.removeItem(`${STORAGE_KEY}_${key}`);
      }
    } catch { /* ignore */ }
  }

  get token(): string | null { return this.getItem('token'); }
  set token(v: string | null) { this.setItem('token', v); }

  get username(): string | null { return this.getItem('username'); }
  set username(v: string | null) { this.setItem('username', v); }

  get avatar(): string | null { return this.getItem('avatar'); }
  set avatar(v: string | null) { this.setItem('avatar', v); }

  get platform(): string | null { return this.getItem('platform'); }
  set platform(v: string | null) { this.setItem('platform', v); }

  get currentOrgId(): string | null { return this.getItem('current_org_id'); }
  set currentOrgId(v: string | null) { this.setItem('current_org_id', v); }

  get currentOrgName(): string | null { return this.getItem('current_org_name'); }
  set currentOrgName(v: string | null) { this.setItem('current_org_name', v); }

  get currentRootSpaceId(): string | null { return this.getItem('current_root_space_id'); }
  set currentRootSpaceId(v: string | null) { this.setItem('current_root_space_id', v); }

  get currentRootSpaceName(): string | null { return this.getItem('current_root_space_name'); }
  set currentRootSpaceName(v: string | null) { this.setItem('current_root_space_name', v); }

  get developerId(): string | null { return this.getItem('developer_id'); }
  set developerId(v: string | null) { this.setItem('developer_id', v); }

  get isDarkMode(): boolean { return this.getItem('dark_mode') === 'true'; }
  set isDarkMode(v: boolean) { this.setItem('dark_mode', String(v)); }

  get isLoggedIn(): boolean { return this.token != null; }

  clear(): void {
    const keys = Object.keys(localStorage);
    keys.filter(k => k.startsWith(STORAGE_KEY)).forEach(k => localStorage.removeItem(k));
  }

  extractDeveloperIdFromToken(): string | null {
    const t = this.token;
    if (!t) return null;
    try {
      const parts = t.split('.');
      if (parts.length < 2) return null;
      const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      const json = JSON.parse(payload);
      return json.sub || json.preferred_username || json.clientId || null;
    } catch { return null; }
  }
}
