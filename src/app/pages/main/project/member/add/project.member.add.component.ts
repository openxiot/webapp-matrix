import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzModalRef } from 'ng-zorro-antd/modal';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzFormModule } from 'ng-zorro-antd/form';
import { TranslatePipe } from '@ngx-translate/core';

/** 添加项目成员对话框返回值 */
export interface ProjectMemberAddResult {
  memberId: string;
  role: string;
}

/** 添加项目成员对话框：用户 ID + 角色，名称/邮箱由后端按账号解析 */
@Component({
  selector: 'project-member-add',
  templateUrl: './project.member.add.component.html',
  styleUrl: './project.member.add.component.less',
  imports: [FormsModule, NzInputModule, NzRadioModule, NzFormModule, TranslatePipe],
})
export class ProjectMemberAddComponent {
  readonly #modal = inject(NzModalRef);

  readonly userId = signal('');

  /** 角色，默认普通成员 */
  readonly role = signal('member');

  readonly roleOptions = [
    { label: '管理员', value: 'admin' },
    { label: '普通成员', value: 'member' },
  ];

  readonly valid = computed(() => this.userId().trim().length > 0);

  cancel(): void {
    this.#modal.destroy(undefined);
  }

  ok(): void {
    if (!this.valid()) {
      return;
    }
    const result: ProjectMemberAddResult = { memberId: this.userId().trim(), role: this.role() };
    this.#modal.destroy(result);
  }

  protected onUserIdInput($event: Event): void {
    this.userId.set(($event.target as HTMLInputElement).value);
  }
}
