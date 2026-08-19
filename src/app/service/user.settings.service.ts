import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { OxResponse } from './response/OxResponse';
import { UserSettings } from '../typedef/define/user/UserSettings';
import { UserSettingsCodec } from '../typedef/codec/user/UserSettingsCodec';

@Injectable({ providedIn: 'root' })
export class UserSettingsService {

  private account: string = environment.account;

  constructor(private http: HttpClient) {}

  getSettings(): Observable<UserSettings> {
    return this.http
      .get<OxResponse>(`${this.account}/user/settings`)
      .pipe(map((response) => UserSettingsCodec.decode(response.data)));
  }

  updateSettings(settings: UserSettings): Observable<void> {
    return this.http
      .put(`${this.account}/user/settings`, { organizationEnabled: settings.organizationEnabled })
      .pipe(map(() => undefined));
  }
}
