import { Component, computed, inject, signal } from '@angular/core';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { StringValue } from './StringValue';

@Component({
  selector: 'string-value-edit',
  templateUrl: './string.value.edit.component.html',
  styleUrl: './string.value.edit.component.less',
  imports: [
    NzInputModule,
  ],
})
export class StringValueEditComponent {

  readonly #modal = inject(NzModalRef);
  readonly data: StringValue = inject(NZ_MODAL_DATA);

  readonly newValue = signal(this.data.oldValue);
  readonly changed = computed(() => this.newValue() !== this.data.oldValue);

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    this.#modal.destroy(this.newValue());
  }

  protected onInput($event: Event): void {
    this.newValue.set(($event.target as HTMLInputElement).value);
  }
}
