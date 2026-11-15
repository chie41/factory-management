export type ApiList<T> = {
  items?: T[]
  data?: T[]
  total?: number
  meta?: { total?: number }
}

