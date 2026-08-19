import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzFormModule } from 'ng-zorro-antd/form';
import { TranslatePipe } from '@ngx-translate/core';
import { OrganizationMember } from '../../../../../typedef/define/user/UserOrganization';

/** 调整项目成员角色对话框：选择 admin / member */
@Component({
  selector: 'project-member-role',
  templateUrl: './project.member.role.component.html',
  imports: [FormsModule, NzSelectModule, NzFormModule, TranslatePipe],
})
export class ProjectMemberRoleComponent {
  readonly #modal = inject(NzModalRef);
  readonly data = inject<OrganizationMember>(NZ_MODAL_DATA);

  /** 成员名（仅展示） */
  readonly name = signal(this.data.name || this.data.userId);

  /** 当前角色 */
  readonly role = signal(this.data.role || 'member');

  readonly options = [
    { label: 'admin', value: 'admin' },
    { label: 'member', value: 'member' },
  ];

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    this.#modal.destroy(this.role());
  }
}
