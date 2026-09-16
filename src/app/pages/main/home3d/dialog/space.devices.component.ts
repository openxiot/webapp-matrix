import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NZ_MODAL_DATA, NzModalRef } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { TranslatePipe } from '@ngx-translate/core';
import { DeviceEntity } from '../../../../typedef/define/device/DeviceEntity';
import { DeviceDisplayService } from '../../../../service/device.display.service';
import { devicesInSpace } from '../home3d.anchor';

/** 弹窗数据：目标空间 + 项目里全部设备 */
export interface SpaceDevicesData {
  spaceId: string;
  spaceName: string;
  /** 项目里的全部设备。本空间已有的和可绑的候选都在里面，按 spaceId 分 */
  devices: DeviceEntity[];
}

/** 弹窗结果：要搬进这个空间的设备 */
export interface SpaceDevicesResult {
  dids: string[];
}

/**
 * 「这个空间有哪些设备」+ 顺手绑几台进来。
 *
 * 合成一个弹窗而不是两个：用户点标记时想的是「这个空间里有什么」，
 * 绑定只是其中一个动作，分成两个入口反而要来回切。
 *
 * 只管**选择**，搬运交给调用方 `data.moveDevices()`。
 */
@Component({
  selector: 'home3d-space-devices',
  standalone: true,
  templateUrl: './space.devices.component.html',
  styleUrl: './space.devices.component.less',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, NzSelectModule, NzTableModule, NzTagModule, TranslatePipe],
})
export class SpaceDevicesComponent {
  private readonly modal = inject(NzModalRef);
  readonly data: SpaceDevicesData = inject(NZ_MODAL_DATA);
  private readonly display = inject(DeviceDisplayService);

  /** 待绑定的 did。确认时才真正搬 */
  readonly selected = signal<string[]>([]);

  /**
   * 已经在这个空间里的设备。
   *
   * 走 {@link devicesInSpace} 而不是就地 filter：「哪个设备算在这个空间里」全项目
   * 只有那一份实现，这张表要和空间角标、菜单的「设备 N 台」、悬停面板的数字对得上。
   */
  readonly current = computed(() => devicesInSpace(this.data.devices, this.data.spaceId));

  /**
   * 候选 = 项目里其他空间的设备。
   *
   * 已经在**本空间**的不列（绑了也是原地不动），但**子空间**的设备要留着 ——
   * 设备挂在哪一层是用户自己的安排，把「挪到上一层」这个动作也堵掉没必要。
   *
   * ⚠️ 这条判据是上面 `current` 的**反面**，必须与 {@link devicesInSpace} 严格互补：
   * 两处一旦对不齐（比如一边认空 `spaceId`、一边不认），就会出现「既不在『已有』里、
   * 也不在候选里」的设备 —— 在弹窗上就是凭空少了几台，没有任何提示。
   */
  readonly candidates = computed(() =>
    this.data.devices
      .filter((device) => device.space?.spaceId !== this.data.spaceId)
      .map((device) => ({ value: device.did, label: this.label(device) })),
  );

  label(device: DeviceEntity): string {
    return this.display.name(device);
  }

  cancel(): void {
    this.modal.destroy(undefined);
  }

  ok(): void {
    const dids = this.selected();
    if (dids.length === 0) {
      return;
    }
    this.modal.destroy({ dids } satisfies SpaceDevicesResult);
  }
}
