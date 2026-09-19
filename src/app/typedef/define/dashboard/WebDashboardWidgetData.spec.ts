import { WebDashboardWidgetDataItem, deviceData, serviceData } from './WebDashboardWidgetData';

/**
 * 服务卡的读数读取。要钉住的是**「没有值」与「值是 0」分得开** —— 卡片上这两种都是要显示的东西，
 * 把它们合并成一个 `-`，看板就会把「这一轮没采到」说成「采到了，是 0」。
 *
 * 只断言读出来的形状，不看界面。
 */
describe('WebDashboardWidgetData', () => {
  function item(data: Record<string, unknown>): WebDashboardWidgetDataItem {
    const x = new WebDashboardWidgetDataItem();
    x.id = 'w1';
    x.success = true;
    x.data = data;
    return x;
  }

  describe('serviceData', () => {
    it('字段按服务端给的顺序读出来（配置顺序就是用户选的顺序）', () => {
      const data = serviceData(
        item({
          functionIndex: 1,
          fields: [{ field: '温度' }, { field: '湿度' }, { field: '压力' }],
        }),
      );
      expect(data.fields.map((row) => row.field)).toEqual(['温度', '湿度', '压力']);
    });

    it('值原样带出（数值、字符串、布尔都是有效读数）', () => {
      const data = serviceData(
        item({
          fields: [
            { field: '温度', value: 23.5 },
            { field: '状态', value: '停机' },
            { field: '阀门', value: 1 },
          ],
        }),
      );
      expect(data.fields.map((row) => row.value)).toEqual([23.5, '停机', 1]);
    });

    it('0 是有效读数（不是「没值」）', () => {
      const data = serviceData(item({ fields: [{ field: '计数', value: 0 }] }));
      expect(data.fields[0].value).toBe(0);
    });

    it('没带 value 键 = 这一轮没取到（值给 undefined）', () => {
      const data = serviceData(item({ fields: [{ field: '温度', unit: '℃' }] }));
      expect(data.fields[0].value).toBeUndefined();
      expect(data.fields[0].unit).toBe('℃');
    });

    it('显式的 null 也归到「没值」：一种状态不该有两种写法', () => {
      const data = serviceData(item({ fields: [{ field: '温度', value: null }] }));
      expect(data.fields[0].value).toBeUndefined();
    });

    it('unit / bit 从服务端带出来；缺省是空串与非位', () => {
      const data = serviceData(
        item({ fields: [{ field: '温度', unit: '℃' }, { field: '进水阀', unit: '', bit: true }] }),
      );
      expect(data.fields[0].unit).toBe('℃');
      expect(data.fields[0].bit).toBe(false);
      expect(data.fields[1].unit).toBe('');
      expect(data.fields[1].bit).toBe(true);
    });

    it('recordedAt / error / errorAt 只在服务端给了的时候才有', () => {
      const collected = serviceData(item({ functionIndex: 1, recordedAt: 1700000000000 }));
      expect(collected.recordedAt).toBe(1700000000000);
      expect(collected.error).toBeUndefined();

      const failed = serviceData(
        item({ functionIndex: 1, recordedAt: 1, error: 'modbus timeout', errorAt: 2 }),
      );
      // 值与失败**可以共存**：影子里的值是最后一次成功的那份，失败时服务端不动它
      expect(failed.error).toBe('modbus timeout');
      expect(failed.errorAt).toBe(2);
      expect(failed.recordedAt).toBe(1);
    });

    it('一条影子都没有时：只有 functionIndex，没有 fields', () => {
      const data = serviceData(item({ functionIndex: 3 }));
      expect(data.functionIndex).toBe(3);
      expect(data.fields).toEqual([]);
      expect(data.recordedAt).toBeUndefined();
    });

    it('坏行整行丢掉，好行照读（一行坏数据不该让整张卡空掉）', () => {
      const data = serviceData(
        item({ fields: [null, '温度', { field: '' }, { field: '湿度', value: 40 }, { value: 1 }] }),
      );
      expect(data.fields.map((row) => row.field)).toEqual(['湿度']);
    });

    it('fields 不是数组（旧配置 / 取数失败的空对象）时给空数组，不抛', () => {
      expect(serviceData(item({ fields: '温度' })).fields).toEqual([]);
      expect(serviceData(item({})).fields).toEqual([]);
    });

    it('recordedAt 是字符串数字时不收（线格式里时间戳就是数字）', () => {
      expect(serviceData(item({ recordedAt: '1700000000000' })).recordedAt).toBeUndefined();
    });

    it('functionIndex 缺失时给 0（调用方不必判空，0 是「没有方法序号」的既有空位）', () => {
      expect(serviceData(item({})).functionIndex).toBe(0);
    });
  });

  describe('deviceData', () => {
    const PID = 'did-1.1.1';

    it('正常：pid、值、型号都读出来', () => {
      const data = deviceData(item({ pid: PID, value: 23.5, type: 'tr_xxx' }));
      expect(data.pid).toBe(PID);
      expect(data.value).toBe(23.5);
      expect(data.type).toBe('tr_xxx');
      expect(data.error).toBeUndefined();
    });

    it('0 / false / 空串都是有效读数（只有「没有 value 键」才是没值）', () => {
      expect(deviceData(item({ pid: PID, value: 0 })).value).toBe(0);
      expect(deviceData(item({ pid: PID, value: false })).value).toBe(false);
      expect(deviceData(item({ pid: PID, value: '' })).value).toBe('');
    });

    it('没有 value 键 = 尚未上报（值给 undefined，卡片显示 `-`）', () => {
      expect(deviceData(item({ pid: PID, type: 'tr_xxx' })).value).toBeUndefined();
    });

    it('value 是 null 也归到「没值」（`undefined` 只有一种写法）', () => {
      expect(deviceData(item({ pid: PID, value: null })).value).toBeUndefined();
    });

    it('有 error = 读取失败，那句话原样带出', () => {
      const data = deviceData(item({ pid: PID, error: 'device offline', type: 'tr_xxx' }));
      expect(data.error).toBe('device offline');
      expect(data.value).toBeUndefined();
    });

    it('type 为空串时不留下（与「没有这个键」是同一件事：都查不到规格）', () => {
      expect(deviceData(item({ pid: PID, type: '' })).type).toBeUndefined();
    });

    it('pid 缺失时给空串，不抛（`deviceLine` 会退回 `-`）', () => {
      expect(deviceData(item({})).pid).toBe('');
    });
  });
});
