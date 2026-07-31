import { Injectable, signal } from '@angular/core';
import { TokenService } from './token.service';

export type AppTheme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<AppTheme>('light');

  constructor(private token: TokenService) {
    const saved = this.token.isDarkMode;
    if (saved) this.theme.set('dark');
    this.applyTheme();
  }

  toggle(): void {
    const next: AppTheme = this.theme() === 'light' ? 'dark' : 'light';
    this.theme.set(next);
    this.token.isDarkMode = next === 'dark';
    this.applyTheme();
  }

  private applyTheme(): void {
    const isDark = this.theme() === 'dark';
    // Apply ng-zorro dark class
    if (isDark) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }
}
