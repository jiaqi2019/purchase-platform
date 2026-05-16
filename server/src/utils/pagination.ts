import type { Context } from 'koa';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  /** 多取 1 条用于判断 hasMore */
  take: number;
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
}

export function parsePageQuery(ctx: Context): PageParams {
  const page = Math.max(1, parseInt(String(ctx.query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(ctx.query.pageSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  );
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
  };
}

export function toPaginatedResult<T>(rows: T[], pageSize: number): PaginatedResult<T> {
  const hasMore = rows.length > pageSize;
  return {
    items: hasMore ? rows.slice(0, pageSize) : rows,
    hasMore,
  };
}
