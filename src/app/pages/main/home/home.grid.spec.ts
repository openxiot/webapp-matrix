import {
  DashboardWidget,
  GRID_GAP,
  GRID_ROW_HEIGHT,
  WidgetSize,
  WIDGET_SIZES,
} from '../../../typedef/define/dashboard/DashboardLayout';
import { cardHeight, sizeOf } from './home.grid';

/**
 * 档位换算。**顺序即位置之后这一层只剩这两件事**，要钉住的是：
 *
 * - 档位表与像素高度**只有一个来源**：卡片高度与它占的行数对不上时，一行里矮的那张卡下面
 *   会空出一条，而「空出一条」看着像是布局排错了。
 * - **不认识的档位退回 S**，不是撑满一屏的 XL：库里存着将来某个版本写的档位时，
 *   一张占满屏幕的卡会把整页都毁了。
 */
describe('home.grid', () => {
  describe('sizeOf', () => {
    it('按档位给占格', () => {
      expect(sizeOf(widget('S')).w).toBe(6);
      expect(sizeOf(widget('M'))).toEqual({ w: 12, h: 4 });
      expect(sizeOf(widget('L'))).toEqual({ w: 12, h: 8 });
      expect(sizeOf(widget('XL'))).toEqual({ w: 24, h: 8 });
    });

    it('不认识的档位退回 S（不是撑满一屏的 XL）', () => {
      const odd = widget('S');
      odd.size = 'Huge' as WidgetSize;

      expect(sizeOf(odd)).toEqual({ w: 6, h: 4 });
    });

    it('档位表里每一档都落在 24 列之内（越界的卡会被挤到下一行，看着像自己跳了）', () => {
      for (const size of Object.keys(WIDGET_SIZES) as WidgetSize[]) {
        expect(WIDGET_SIZES[size].w).toBeLessThanOrEqual(24);
        expect(WIDGET_SIZES[size].w).toBeGreaterThan(0);
        expect(WIDGET_SIZES[size].h).toBeGreaterThan(0);
      }
    });
  });

  describe('cardHeight', () => {
    it('h 个行高、中间 h − 1 道缝', () => {
      // 写成 h × 38 会少掉缝，卡片比它占的格子矮一截；写成 (h+1) × 38 则溢出到下一张卡上
      expect(cardHeight(1)).toBe(GRID_ROW_HEIGHT);
      expect(cardHeight(4)).toBe(4 * GRID_ROW_HEIGHT + 3 * GRID_GAP);
      expect(cardHeight(8)).toBe(8 * GRID_ROW_HEIGHT + 7 * GRID_GAP);
    });

    it('与档位表对得上（S 是四行、L 是八行）', () => {
      expect(cardHeight(WIDGET_SIZES.S.h)).toBe(cardHeight(4));
      expect(cardHeight(WIDGET_SIZES.L.h)).toBe(cardHeight(8));
    });

    it('同一档位算两次是同一个数（模板每轮变更检测都会调它）', () => {
      expect(cardHeight(sizeOf(widget('XL')).h)).toBe(cardHeight(8));
    });
  });
});

/** 一张卡片。顺序进线之后卡片只剩档位可设 —— 位置是它在数组里的下标 */
function widget(size: WidgetSize): DashboardWidget {
  const w = new DashboardWidget();
  w.id = 'w1';
  w.size = size;
  return w;
}
