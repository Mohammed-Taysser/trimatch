import { PageMeta, PaginationQuery } from '@trimatch/shared';

// Marker returned by list services — the response interceptor lifts `items`
// into `data` and attaches `meta` to the envelope.
export class PagedResult<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: PageMeta,
  ) {}
}

export function pageMeta(query: PaginationQuery, total: number): PageMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

export function pageOffset(query: PaginationQuery): { limit: number; offset: number } {
  return { limit: query.pageSize, offset: (query.page - 1) * query.pageSize };
}
