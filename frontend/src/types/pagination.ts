export type PaginationMeta = { page: number; page_size: number; total: number; total_pages: number }
export type ListResponse<T> = { data: T[]; meta: PaginationMeta }
export type ListQuery = { page: number; page_size: number; q?: string }
