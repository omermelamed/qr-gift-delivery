import { vi } from 'vitest'

/**
 * A chainable Supabase query-builder mock that is robust to call order.
 *
 * Every builder method (`select`, `insert`, `update`, `eq`, `in`, `is`, …)
 * returns the same builder, terminal methods (`single`, `maybeSingle`) resolve
 * to the configured result, and the builder is thenable so `await query` also
 * resolves to it. This means a route can issue any sequence of chained calls
 * against a table without the test having to model the exact order — which is
 * what made the old hand-rolled `fromCallCount` mocks break whenever a route
 * grew a new query (e.g. the credits flow).
 */
export type QueryResult = { data?: unknown; error?: unknown }

const CHAIN_METHODS = [
  'select', 'insert', 'update', 'upsert', 'delete',
  'eq', 'neq', 'in', 'is', 'not', 'match', 'filter',
  'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
  'order', 'limit', 'range', 'contains', 'overlaps', 'returns',
] as const

export function makeQueryBuilder(result: QueryResult = { data: null, error: null }) {
  const builder: Record<string, unknown> = {}
  for (const m of CHAIN_METHODS) builder[m] = vi.fn(() => builder)
  builder.single = vi.fn(() => Promise.resolve(result))
  builder.maybeSingle = vi.fn(() => Promise.resolve(result))
  // Thenable: `await builder` (and chains without a terminal) resolve to result.
  builder.then = (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

/**
 * Builds a `from(table)` implementation that returns a chainable builder per
 * table. The same builder instance is reused for repeated `from(table)` calls,
 * so tests can assert on its spies (e.g. `mock.builders.gift_tokens.update`).
 *
 * Usage:
 *   const from = makeServiceFrom({ campaigns: { data: {...}, error: null } })
 *   mockFromService.mockImplementation(from)
 *   expect(from.builders.credits.update).toHaveBeenCalled()
 */
export function makeServiceFrom(byTable: Record<string, QueryResult> = {}) {
  const builders: Record<string, ReturnType<typeof makeQueryBuilder>> = {}
  const fn = vi.fn((table: string) => {
    if (!builders[table]) builders[table] = makeQueryBuilder(byTable[table] ?? { data: null, error: null })
    return builders[table]
  })
  return Object.assign(fn, { builders })
}
