import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterRenderEffect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/** 菜单里的一项。`id` 由调用方定义，回传时原样带回 */
export interface Home3dMenuItem {
  id: string;
  label: string;
  /** 破坏性动作（取消标注）画成红色 */
  danger?: boolean;
}

/**
 * 3D 场景上的右键式菜单。**自研绝对定位，不用 `nz-dropdown`** ——
 * 后者走 CdkOverlay 的 connected position，必须有个 origin 元素；
 * 要在鼠标处弹就得动态造一个 1×1 隐形元素，别扭且脆。
 *
 * 宿主就是 `.scene-wrap`（`position: relative`），坐标系与
 * `PickResult.screen` / 标记点击位置天然对齐，不需要 portal。
 */
@Component({
  selector: 'main-home3d-menu',
  standalone: true,
  templateUrl: './home3d.menu.component.html',
  styleUrl: './home3d.menu.component.less',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class Home3dMenuComponent implements AfterViewInit, OnDestroy {
  /** 相对 `.scene-wrap` 左上角的像素坐标 */
  readonly x = input.required<number>();
  readonly y = input.required<number>();
  readonly items = input.required<Home3dMenuItem[]>();
  /** 标题，如空间名。空则不显示标题区 */
  readonly title = input('');
  /** 副标题，如空间路径 `园区 / A栋 / 3层` */
  readonly subtitle = input('');

  readonly picked = output<string>();
  readonly dismissed = output<void>();

  private readonly menu = viewChild.required<ElementRef<HTMLElement>>('menu');

  /** 照 @Input 的 x/y 量完尺寸、贴边翻转之后真正用的坐标 */
  protected readonly left = signal(0);
  protected readonly top = signal(0);

  constructor() {
    // 量尺寸要在 DOM 更新之后。读 x/y/items 建依赖：换位置或换条目都要重新量
    afterRenderEffect(() => {
      const x = this.x();
      const y = this.y();
      this.items();
      const el = this.menu().nativeElement;
      // offsetParent 就是 .scene-wrap，省掉一个容器尺寸的入参
      const parent = el.offsetParent as HTMLElement | null;
      const maxX = parent ? parent.clientWidth : Number.POSITIVE_INFINITY;
      const maxY = parent ? parent.clientHeight : Number.POSITIVE_INFINITY;
      const width = el.offsetWidth;
      const height = el.offsetHeight;

      // 贴右/下边缘时翻到光标另一侧。夹一下 0，别翻出画布外
      this.left.set(x + width > maxX ? Math.max(x - width, 0) : x);
      this.top.set(y + height > maxY ? Math.max(y - height, 0) : y);
    });
  }

  ngAfterViewInit(): void {
    // 挂 document 的 **capture** 阶段：否则 OrbitControls 挂在 canvas 上的
    // pointerdown（冒泡阶段）先跑，场景先转起来才关菜单，手感是「点一下先抖一下」。
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    // 打开就把焦点送进第一项，键盘用户不用先 Tab
    this.menu().nativeElement.querySelector('button')?.focus();
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
  }

  /**
   * 点在菜单自己身上就放行 —— 否则按下瞬间菜单已被摘掉，`click` 根本不会触发，
   * 菜单项变成点不动的。**这里不 `stopPropagation`**：让「点空白 = 关菜单 +
   * 立刻开始拖拽旋转」成立。
   */
  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    const el = this.menu().nativeElement;
    if (event.target instanceof Node && el.contains(event.target)) {
      return;
    }
    this.dismissed.emit();
  };

  /** Esc 关闭，上下键在条目间移动焦点 */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dismissed.emit();
      return;
    }

    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();

    const buttons = [...this.menu().nativeElement.querySelectorAll('button')];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    // 首尾循环：从最后一项按向下回到第一项
    const next = (current + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
}
