/**
 * 设备类型 URN 格式：
 *   urn:<ns>:device:<name>:<value>:<org>:<model>:<version>
 *   index  0     1    2       3      4       5     6       7
 */
export class UrnUtils {
  /** 提取人类可读的类型名（索引 3） */
  static extractTypeName(urn: string): string {
    const parts = urn.split(':');
    return parts.length > 3 ? parts[3] : urn;
  }

  /** 提取组织编码（索引 5）与型号（索引 6），用于查找产品信息 */
  static extractOrgModel(urn: string): { org: string; model: string } {
    const parts = urn.split(':');
    const org = parts.length > 5 ? parts[5] : '';
    const model = parts.length > 6 ? parts[6] : '';
    return { org, model };
  }
}
