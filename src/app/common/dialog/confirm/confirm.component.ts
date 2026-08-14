import {Component, inject} from '@angular/core';
import {NZ_MODAL_DATA, NzModalRef} from 'ng-zorro-antd/modal';

@Component({
  selector: 'app-confirm',
  templateUrl: './confirm.component.html',
  styleUrl: './confirm.component.less',
})
export class ConfirmComponent {

  readonly #modal = inject(NzModalRef);
  readonly message: string = inject(NZ_MODAL_DATA);

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    this.#modal.destroy(this.message);
  }
}
