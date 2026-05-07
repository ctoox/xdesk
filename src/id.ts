export function generateShortId(): string {
  // 生成 9 位数字 ID
  const id = Math.floor(100000000 + Math.random() * 900000000);
  return id.toString();
}

export function formatId(id: string): string {
  // 格式化为 xxx-xxx-xxx
  if (id.length === 9) {
    return id.substring(0, 3) + '-' + id.substring(3, 6) + '-' + id.substring(6, 9);
  }
  return id;
}

export function parseId(input: string): string {
  // 去除横杠，只保留数字
  return input.replace(/[^0-9]/g, '');
}
