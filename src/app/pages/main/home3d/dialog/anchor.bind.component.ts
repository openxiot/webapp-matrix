import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { TranslatePipe } from '@ngx-translate/core';
import { SpaceEntity } from '../../../../typedef/define/space/SpaceEntity';
import { spacePath } from '../home3d.anchor';

/** 弹窗数据：项目里可选的全部空间（已按路径排好） */
export interface AnchorBindData {
  spaces: SpaceEntity[];
  /** 空间 id → 空间，用来拼路径 */
  spaceById: Map<string, SpaceEntity>;
  /** 默认父空间 id（一般给项目根） */
  defaultParentId: string;
}

/** 弹窗结果。二选一：要么选了个已有空间，要么要求新建一个 */
export type AnchorBindResult =
  | { kind: 'existing'; spaceId: string }
  | { kind: 'create'; name: string; type: string; parentId: string };

/** 空间类型 → 默认子类型（与 common/dialog/space/space.add.component 同一套口径） */
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

/**
 * 「在此标注空间」。两个 tab：
 *
 * - **关联到已有空间**（默认）—— 现场运维面对的通常是**已经建好的空间树**，
 *   要做的是把 3D 里这个位置对应到树里那个已存在的房间，而不是凭空造一个新的。
 * - **新建空间** —— 树里确实没有的时候才用。
 *
 * 结果不在这里落库，交给调用方（`Home3dComponent`）拿 `AnchorBindResult` 去写。
 */
@Component({
  selector: 'home3d-anchor-bind',
  standalone: true,
  templateUrl: './anchor.bind.component.html',
  styleUrl: './anchor.bind.component.less',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzRadioModule,
    NzSelectModule,
    NzTabsModule,
    TranslatePipe,
  ],
})
export class AnchorBindComponent {
  private readonly modal = inject(NzModalRef);
  readonly data: AnchorBindData = inject(NZ_MODAL_DATA);

  /** 0 = 关联已有，1 = 新建 */
  readonly tab = signal(0);

  readonly spaceId = signal('');
  readonly name = signal('');
  readonly type = signal('room');
  readonly parentId = signal('');

  constructor() {
    // 新建时父空间默认落在项目根：这也是「锚点只能落在子空间、不能落在项目根」
    // 那条约束的来源 —— 根空间就是一个项目，它本身不该有 3D 位置。
    this.parentId.set(this.data.defaultParentId);
    this.type.set(defaultChildType(this.parentOf(this.data.defaultParentId)?.type ?? ''));
  }

  /** 供 nz-select 用的选项。label 是完整路径，两个同名房间才分得清 */
  readonly options = computed(() =>
    this.data.spaces.map((space) => ({
      value: space.id,
      label: spacePath(space, this.data.spaceById),
    })),
  );

  readonly valid = computed(() =>
    this.tab() === 0 ? this.spaceId().length > 0 : this.name().trim().length > 0,
  );

  cancel(): void {
    this.modal.destroy(undefined);
  }

  ok(): void {
    if (!this.valid()) {
      return;
    }
    if (this.tab() === 0) {
      this.modal.destroy({ kind: 'existing', spaceId: this.spaceId() } satisfies AnchorBindResult);
      return;
    }
    this.modal.destroy({
      kind: 'create',
      name: this.name().trim(),
      type: this.type(),
      parentId: this.parentId(),
    } satisfies AnchorBindResult);
  }

  /** 换父空间时子类型跟着走，省得手选（同 common/dialog/space 的行为） */
  protected onParentChange(parentId: string): void {
    this.parentId.set(parentId);
    this.type.set(defaultChildType(this.parentOf(parentId)?.type ?? ''));
  }

  private parentOf(id: string): SpaceEntity | undefined {
    return this.data.spaceById.get(id);
  }
}
