export function areMapsEqual<K, V>(map1: Map<K, V>, map2: Map<K, V>): boolean {
  // 检查大小是否相同
  if (map1.size !== map2.size) {
    return false;
  }

  // 遍历第一个 Map 的所有条目
  for (const [key, value] of map1) {
    // 检查第二个 Map 是否有相同的键
    if (!map2.has(key)) {
      return false;
    }
    // 比较对应的值
    const val2 = map2.get(key);
    if (value !== val2) {
      // 如果需要深度比较对象，可以使用 JSON.stringify 或其他深度比较方法
      return false;
    }
  }

  return true;
}
