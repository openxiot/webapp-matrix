import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  isDark = signal(false);

  constructor() {
    const saved = localStorage.getItem('dark_mode') === 'true';
    this.apply(saved);
  }

  toggle() {
    this.apply(!this.isDark());
  }

  private apply(dark: boolean) {
    this.isDark.set(dark);
    localStorage.setItem('dark_mode', String(dark));
    document.body.classList.toggle('dark-theme', dark);
  }
}
