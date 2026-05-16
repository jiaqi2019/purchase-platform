export const PAGE_SIZE = 20;

/** Arco Table 无 total 时用 hasMore 推算，以启用「下一页」 */
export function paginationTotal(page: number, pageSize: number, itemCount: number, hasMore: boolean): number {
  if (hasMore) return page * pageSize + 1;
  return (page - 1) * pageSize + itemCount;
}
