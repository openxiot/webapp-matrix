import {Component, computed, inject, signal} from '@angular/core';
import {NzModalRef} from 'ng-zorro-antd/modal';
import {MainI18nService} from '../../../../service/i18n.service';
import {NzColDirective, NzRowDirective} from 'ng-zorro-antd/grid';
import {NzCardModule} from 'ng-zorro-antd/card';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {TranslatePipe} from '@ngx-translate/core';

@Component({
  selector: 'app-language-change',
  templateUrl: './language.change.component.html',
  styleUrl: './language.change.component.less',
  imports: [
    NzRowDirective,
    NzColDirective,
    NzCardModule,
    NzIconModule,
    TranslatePipe,
  ],
})
export class LanguageChangeComponent {

  readonly i18n = inject(MainI18nService);
  readonly #modal = inject(NzModalRef);

  protected showAllLanguages = signal(false);

  readonly displayedLanguages = computed(() => {
    const all = this.i18n.languages;
    if (this.showAllLanguages() || all.length <= 12) {
      return all;
    }
    return all.slice(0, 12);
  });

  protected showMore(): void {
    this.showAllLanguages.set(true);
  }

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    this.#modal.destroy(undefined);
  }

  protected changeLanguage(code: string): void {
    this.i18n.changeLanguage(code);
    this.ok();
  }
}
