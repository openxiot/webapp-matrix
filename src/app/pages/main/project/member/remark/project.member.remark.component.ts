import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzFormModule } from 'ng-zorro-antd/form';
import { TranslatePipe } from '@ngx-translate/core';
import { OrganizationMember } from '../../../../../typedef/define/user/UserOrganization';

/** 编辑项目成员备注对话框：textarea 输入，返回新备注 */
@Component({
  selector: 'project-member-remark',
  templateUrl: './project.member.remark.component.html',
  imports: [FormsModule, NzInputModule, NzFormModule, TranslatePipe],
})
export class ProjectMemberRemarkComponent {
  readonly #modal = inject(NzModalRef);
  readonly data = inject<OrganizationMember>(NZ_MODAL_DATA);

  /** 成员名（仅展示） */
  readonly name = signal(this.data.name || this.data.userId);

  /** 当前备注 */
  readonly remark = signal(this.data.remark || '');

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    this.#modal.destroy(this.remark());
  }

  protected onRemarkInput($event: Event): void {
    this.remark.set(($event.target as HTMLTextAreaElement).value);
  }
}
