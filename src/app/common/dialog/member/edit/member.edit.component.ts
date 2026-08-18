import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzFormModule } from 'ng-zorro-antd/form';
import { OrganizationMember } from '../../../../typedef/define/user/UserOrganization';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'member-edit',
  templateUrl: './member.edit.component.html',
  styleUrl: './member.edit.component.less',
  imports: [FormsModule, NzInputModule, NzRadioModule, NzFormModule, TranslatePipe],
})
export class MemberEditComponent {
  readonly #modal = inject(NzModalRef);
  readonly data: OrganizationMember = inject(NZ_MODAL_DATA);

  readonly userId = signal(this.data.userId);
  readonly name = signal(this.data.name);
  readonly role = signal(this.data.role);

  readonly valid = computed(() => this.name().trim().length > 0);
  readonly changed = computed(() => this.name() !== this.data.name || this.role() !== this.data.role);

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    if (!this.valid() || !this.changed()) {
      return;
    }
    const member = new OrganizationMember();
    member.userId = this.userId();
    member.name = this.name().trim();
    member.role = this.role();
    this.#modal.destroy(member);
  }

  protected onNameInput($event: Event): void {
    this.name.set(($event.target as HTMLInputElement).value);
  }

  protected onRoleChange(value: string): void {
    this.role.set(value);
  }
}
