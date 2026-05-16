function hashName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h.toString(36).toUpperCase();
}

function slugFromAscii(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

/** 根据分类名称动态生成唯一 code（不依赖写死的名称映射） */
export function generateCategoryCode(name: string, takenCodes: Iterable<string>): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('名称不能为空');

  const taken = new Set([...takenCodes].map((c) => c.toUpperCase()));

  const ascii = slugFromAscii(trimmed);
  const base = ascii.length >= 2 ? ascii.slice(0, 48) : `CAT_${hashName(trimmed)}`;

  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}_${n}`;
    n += 1;
  }
  return candidate;
}
