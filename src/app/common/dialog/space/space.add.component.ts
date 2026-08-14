import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzFormModule } from 'ng-zorro-antd/form';
import { TranslatePipe } from '@ngx-translate/core';

export interface SpaceAddResult {
  name: string;
  type: string;
}

/** 空间类型 -> 默认子类型（对齐 Android） */
function defaultChildType(parentType: string): string {
  switch (parentType) {
    case 'building':
      return 'floor';
    case 'floor':
      return 'room';
    case 'room':
      return 'zone';
    default:
      return 'building';
  }
}

@Component({
  selector: 'space-add',
  templateUrl: './space.add.component.html',
  styleUrl: './space.add.component.less',
  imports: [FormsModule, NzInputModule, NzRadioModule, NzFormModule, TranslatePipe],
})
export class SpaceAddComponent {
  readonly #modal = inject(NzModalRef);

  /** 父空间类型，用于推断默认子类型 */
  readonly data: string = inject(NZ_MODAL_DATA);

  readonly name = signal('');
  readonly type = signal(defaultChildType(this.data));

  readonly valid = computed(() => this.name().trim().length > 0);

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    if (!this.valid()) {
      return;
    }
    this.#modal.destroy({ name: this.name().trim(), type: this.type() } satisfies SpaceAddResult);
  }

  protected onNameInput($event: Event): void {
    this.name.set(($event.target as HTMLInputElement).value);
  }

  protected onTypeChange(value: string): void {
    this.type.set(value);
  }
}
