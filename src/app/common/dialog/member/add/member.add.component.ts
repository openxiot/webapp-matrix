import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzModalRef } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzFormModule } from 'ng-zorro-antd/form';
import { OrganizationMember } from '../../../../typedef/define/user/Organization';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'member-add',
  templateUrl: './member.add.component.html',
  styleUrl: './member.add.component.less',
  imports: [FormsModule, NzInputModule, NzRadioModule, NzFormModule, TranslatePipe],
})
export class MemberAddComponent {
  readonly #modal = inject(NzModalRef);

  readonly userId = signal('');
  readonly name = signal('');
  readonly role = signal('member');

  readonly valid = computed(() => this.userId().trim().length > 0 && this.name().trim().length > 0);

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    if (!this.valid()) {
      return;
    }
    const member = new OrganizationMember();
    member.userId = this.userId().trim();
    member.name = this.name().trim();
    member.role = this.role();
    this.#modal.destroy(member);
  }

  protected onUserIdInput($event: Event): void {
    this.userId.set(($event.target as HTMLInputElement).value);
  }

  protected onNameInput($event: Event): void {
    this.name.set(($event.target as HTMLInputElement).value);
  }

  protected onRoleChange(value: string): void {
    this.role.set(value);
  }
}
