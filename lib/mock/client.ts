// ============================================================
// Mock Supabase Client — NEXT_PUBLIC_MOCK_MODE=true 에서만 사용
// ============================================================
import {
  MOCK_ORGS, MOCK_MEMBERS, MOCK_ADMINS, MOCK_SERVICES, MOCK_ACCOUNTS,
  MOCK_VCNS, MOCK_TRANSACTIONS, MOCK_INVOICES, MOCK_CREDIT_BACKS,
  MOCK_REQUESTS, MOCK_MESSAGES, MOCK_EVENTS, MOCK_AUDIT_LOGS,
  MOCK_NOTIFICATION_DEFAULTS, MOCK_NOTIFICATION_PREFERENCES,
  MOCK_EXPORT_JOBS, MOCK_ANOMALY_EVENTS,
  MOCK_USERS, type MockUser,
} from './fixtures'

// ─── In-memory store (라우트 간 공유) ─────────────────────
const store: Record<string, unknown[]> = {
  orgs:                     [...MOCK_ORGS],
  members:                  [...MOCK_MEMBERS],
  admin_users:              [...MOCK_ADMINS],
  org_contracts:            [],
  services:                 [...MOCK_SERVICES],
  accounts:                 [...MOCK_ACCOUNTS],
  virtual_cards:            [...MOCK_VCNS],
  transactions:             [...MOCK_TRANSACTIONS],
  invoices:                 [...MOCK_INVOICES],
  credit_backs:             [...MOCK_CREDIT_BACKS],
  action_requests:          [...MOCK_REQUESTS],
  request_messages:         [...MOCK_MESSAGES],
  request_events:           [...MOCK_EVENTS],
  audit_logs:               [...MOCK_AUDIT_LOGS],
  notification_preferences: [...MOCK_NOTIFICATION_PREFERENCES],
  v_notification_defaults:  [...MOCK_NOTIFICATION_DEFAULTS],
  v_transaction_customer:   MOCK_TRANSACTIONS.map(t => ({
    id: t.id, org_id: t.org_id, account_id: t.account_id, virtual_card_id: t.virtual_card_id,
    service_id: t.service_id, amount_krw: t.customer_charge_krw, status: t.status,
    currency: t.currency, merchant_name: t.merchant_name, billing_month: t.billing_month,
    transacted_at: t.transacted_at, settled_at: t.settled_at, created_at: t.created_at,
  })),
  export_jobs:              [...MOCK_EXPORT_JOBS],
  anomaly_events:           [...MOCK_ANOMALY_EVENTS],
  offboarding_events:       [],
}

type Row = Record<string, unknown>

interface JoinSpec {
  alias: string
  table: string
  fk: string
  cols: string[] | '*'
}

function parseSelect(selectStr: string): { cols: string[] | '*'; joins: JoinSpec[] } {
  // Supabase select 문법: "col1, col2, alias:fk_table!fk_col(sub1, sub2)"
  const joins: JoinSpec[] = []
  let working = selectStr.trim()
  const cols: string[] = []

  // 조인 추출
  const joinRegex = /(\w+):(\w+)!(\w+)\(([^)]+)\)/g
  let match
  while ((match = joinRegex.exec(working))) {
    const [, alias, table, fk, subCols] = match
    const sc = subCols.split(',').map(s => s.trim())
    joins.push({ alias, table, fk, cols: sc.includes('*') ? '*' : sc })
  }
  working = working.replace(joinRegex, '').replace(/,\s*,/g, ',').replace(/,\s*$/, '').replace(/^\s*,/, '')

  // 컬럼 추출
  for (const c of working.split(',')) {
    const t = c.trim()
    if (!t) continue
    if (t === '*') return { cols: '*', joins }
    cols.push(t)
  }
  return { cols: cols.length > 0 ? cols : '*', joins }
}

function pickRowCols(row: Row, cols: string[] | '*'): Row {
  if (cols === '*') return { ...row }
  const picked: Row = {}
  for (const c of cols) picked[c] = row[c]
  return picked
}

function applyJoins(row: Row, joins: JoinSpec[]): Row {
  const result = { ...row }
  for (const j of joins) {
    const fkVal = row[j.fk]
    const targetTable = store[j.table] as Row[] | undefined
    if (!targetTable || fkVal == null) { result[j.alias] = null; continue }
    const found = targetTable.find(r => r.id === fkVal)
    result[j.alias] = found ? pickRowCols(found, j.cols) : null
  }
  return result
}

// ─── Query Builder ────────────────────────────────────────
type Filter = { op: string; col: string; val: unknown }

class MockQuery<T = Row> implements PromiseLike<{ data: T | T[] | null; error: null; count?: number }> {
  private rows: Row[]
  private filters: Filter[] = []
  private orderBy: { col: string; asc: boolean }[] = []
  private limitN: number | null = null
  private singleMode: 'none' | 'single' | 'maybe' = 'none'
  private selectSpec: { cols: string[] | '*'; joins: JoinSpec[] } = { cols: '*', joins: [] }
  private countMode: 'exact' | null = null
  private headOnly = false

  constructor(private tableName: string, private mutation?: 'insert' | 'update' | 'upsert' | 'delete', private mutData?: Row | Row[], private upsertConflict?: string) {
    const bag = store[tableName]
    this.rows = bag ? [...(bag as Row[])] : []
  }

  select(cols: string = '*', opts?: { count?: 'exact'; head?: boolean }): this {
    if (cols) this.selectSpec = parseSelect(cols)
    if (opts?.count) this.countMode = opts.count
    if (opts?.head) this.headOnly = true
    return this
  }

  eq(col: string, val: unknown): this { this.filters.push({ op: 'eq',  col, val }); return this }
  neq(col: string, val: unknown): this { this.filters.push({ op: 'neq', col, val }); return this }
  in(col: string, vals: unknown[]): this { this.filters.push({ op: 'in', col, val: vals }); return this }
  is(col: string, val: unknown): this { this.filters.push({ op: 'is',  col, val }); return this }
  gt(col: string, val: unknown): this { this.filters.push({ op: 'gt',  col, val }); return this }
  gte(col: string, val: unknown): this { this.filters.push({ op: 'gte', col, val }); return this }
  lt(col: string, val: unknown): this { this.filters.push({ op: 'lt',  col, val }); return this }
  lte(col: string, val: unknown): this { this.filters.push({ op: 'lte', col, val }); return this }
  not(col: string, op: string, val: unknown): this { this.filters.push({ op: `not.${op}`, col, val }); return this }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orderBy.push({ col, asc: opts?.ascending !== false })
    return this
  }
  limit(n: number): this { this.limitN = n; return this }
  single(): this { this.singleMode = 'single'; return this }
  maybeSingle(): this { this.singleMode = 'maybe'; return this }

  private applyFilters(rows: Row[]): Row[] {
    return rows.filter(r => this.filters.every(f => {
      const v = r[f.col]
      switch (f.op) {
        case 'eq':  return v === f.val
        case 'neq': return v !== f.val
        case 'in':  return (f.val as unknown[]).includes(v)
        case 'is':  return v === f.val || (f.val === null && v == null)
        case 'gt':  return v != null && (v as number) > (f.val as number)
        case 'gte': return v != null && (v as number) >= (f.val as number)
        case 'lt':  return v != null && (v as number) < (f.val as number)
        case 'lte': return v != null && (v as number) <= (f.val as number)
        default:    return true
      }
    }))
  }

  private execute(): { data: T | T[] | null; error: null; count?: number } {
    // Mutation
    if (this.mutation === 'insert' && this.mutData) {
      const toInsert = Array.isArray(this.mutData) ? this.mutData : [this.mutData]
      const now = new Date().toISOString()
      const inserted = toInsert.map((d, i) => ({
        idx: (store[this.tableName]?.length ?? 0) + i + 1,
        id: d.id ?? crypto.randomUUID(),
        created_at: d.created_at ?? now,
        updated_at: d.updated_at ?? now,
        ...d,
      }))
      if (!store[this.tableName]) store[this.tableName] = []
      ;(store[this.tableName] as Row[]).push(...inserted)
      this.rows = inserted
    } else if (this.mutation === 'update' && this.mutData && !Array.isArray(this.mutData)) {
      const matches = this.applyFilters(this.rows)
      const patched = matches.map(r => {
        const idx = (store[this.tableName] as Row[]).findIndex(x => x.id === r.id)
        if (idx >= 0) {
          const merged = { ...(store[this.tableName] as Row[])[idx], ...(this.mutData as Row), updated_at: new Date().toISOString() }
          ;(store[this.tableName] as Row[])[idx] = merged
          return merged
        }
        return r
      })
      this.rows = patched
    } else if (this.mutation === 'upsert' && this.mutData) {
      const toUp = Array.isArray(this.mutData) ? this.mutData : [this.mutData]
      const conflictKeys = (this.upsertConflict ?? 'id').split(',').map(s => s.trim())
      const now = new Date().toISOString()
      if (!store[this.tableName]) store[this.tableName] = []
      const out: Row[] = []
      for (const d of toUp) {
        const bag = store[this.tableName] as Row[]
        const existingIdx = bag.findIndex(r => conflictKeys.every(k => r[k] === d[k]))
        if (existingIdx >= 0) {
          const merged = { ...bag[existingIdx], ...d, updated_at: now }
          bag[existingIdx] = merged
          out.push(merged)
        } else {
          const added = { idx: bag.length + 1, id: d.id ?? crypto.randomUUID(), created_at: now, updated_at: now, ...d }
          bag.push(added)
          out.push(added)
        }
      }
      this.rows = out
    }

    // Filter
    let result = this.mutation ? this.rows : this.applyFilters(this.rows)

    // Order
    if (this.orderBy.length > 0) {
      result = [...result].sort((a, b) => {
        for (const o of this.orderBy) {
          const av = a[o.col], bv = b[o.col]
          if (av === bv) continue
          if (av == null) return 1
          if (bv == null) return -1
          return (av > bv ? 1 : -1) * (o.asc ? 1 : -1)
        }
        return 0
      })
    }

    // Count (head mode)
    const count = result.length

    // Limit
    if (this.limitN != null) result = result.slice(0, this.limitN)

    // Select projection + joins
    let projected = result.map(r => applyJoins(r, this.selectSpec.joins))
    if (this.selectSpec.cols !== '*') {
      projected = projected.map(r => {
        const picked = pickRowCols(r, this.selectSpec.cols)
        for (const j of this.selectSpec.joins) picked[j.alias] = r[j.alias]
        return picked
      })
    }

    if (this.headOnly) {
      return { data: null as unknown as T, error: null, count }
    }

    if (this.singleMode !== 'none') {
      if (projected.length === 0) return { data: null, error: null }
      return { data: projected[0] as unknown as T, error: null }
    }

    return { data: projected as unknown as T[], error: null, count: this.countMode ? count : undefined }
  }

  then<R1 = unknown, R2 = never>(
    onFulfilled?: ((value: { data: T | T[] | null; error: null; count?: number }) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    try {
      const result = this.execute()
      return Promise.resolve(onFulfilled ? onFulfilled(result) : result as unknown as R1)
    } catch (e) {
      return Promise.resolve(onRejected ? onRejected(e) : Promise.reject(e) as unknown as R2)
    }
  }
}

// ─── Mock client ──────────────────────────────────────────
export interface MockAuth {
  getUser: () => Promise<{ data: { user: { id: string; email: string; last_sign_in_at: string } | null }; error: null }>
  signInWithOtp: (params: { email: string }) => Promise<{ data: unknown; error: null }>
  signInWithPassword: (params: { email: string; password: string }) => Promise<{ data: unknown; error: { message: string } | null }>
  signOut: () => Promise<{ error: null }>
  exchangeCodeForSession: (code: string) => Promise<{ error: null }>
  verifyOtp: (params: unknown) => Promise<{ data: { user: unknown } | null; error: { message: string } | null }>
  mfa: {
    listFactors: () => Promise<{ data: { totp: unknown[] } | null; error: null }>
    enroll: (params: unknown) => Promise<{ data: unknown; error: null }>
    challenge: (params: unknown) => Promise<{ data: unknown; error: null }>
    verify: (params: unknown) => Promise<{ data: unknown; error: null }>
    unenroll: (params: unknown) => Promise<{ data: unknown; error: null }>
  }
}

export interface MockStorage {
  from: (bucket: string) => {
    upload: (path: string, data: unknown, opts?: unknown) => Promise<{ data: { path: string }; error: null }>
    createSignedUrl: (path: string, expires: number) => Promise<{ data: { signedUrl: string }; error: null }>
  }
}

export interface MockChannel {
  on: (event: string, cfg: unknown, cb: (payload: unknown) => void) => MockChannel
  subscribe: () => MockChannel
}

export function createMockClient(currentUserEmail: string | null) {
  const user: MockUser | null = currentUserEmail ? MOCK_USERS[currentUserEmail] ?? null : null

  const auth: MockAuth = {
    getUser: async () => ({
      data: {
        user: user ? { id: user.id, email: user.email, last_sign_in_at: user.last_sign_in_at } : null,
      },
      error: null,
    }),
    signInWithOtp: async () => ({ data: null, error: null }),
    signInWithPassword: async () => ({ data: null, error: null }),
    signOut: async () => ({ error: null }),
    exchangeCodeForSession: async () => ({ error: null }),
    verifyOtp: async () => ({ data: { user: null }, error: null }),
    mfa: {
      listFactors: async () => ({ data: { totp: [] }, error: null }),
      enroll: async () => ({ data: { id: 'mock-factor', totp: { qr_code: '<svg></svg>', secret: 'MOCK' } }, error: null }),
      challenge: async () => ({ data: { id: 'mock-challenge' }, error: null }),
      verify: async () => ({ data: null, error: null }),
      unenroll: async () => ({ data: null, error: null }),
    },
  }

  const storage: MockStorage = {
    from: () => ({
      upload: async () => ({ data: { path: 'mock' }, error: null }),
      createSignedUrl: async () => ({ data: { signedUrl: '#mock-download' }, error: null }),
    }),
  }

  return {
    auth,
    storage,
    from: (table: string) => new MockQuery(table),
    channel: (_name: string): MockChannel => {
      const ch: MockChannel = {
        on: () => ch,
        subscribe: () => ch,
      }
      return ch
    },
    removeChannel: () => undefined,
    // mutation helpers (Supabase-style)
    // PostgrestQueryBuilder returns a special object — we use the same class
  }
}

// override for mutations (called separately)
export function mockFromMutation(table: string, mutation: 'insert' | 'update' | 'upsert' | 'delete', data?: Row | Row[], upsertConflict?: string) {
  return new MockQuery(table, mutation, data, upsertConflict)
}

// PostgrestQueryBuilder-style: from(table).insert(data).select()
// 위 MockQuery는 select-only. Mutation은 MockQueryBuilder로 wrap.
export class MockQueryBuilder {
  constructor(private tableName: string) {}
  select(cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
    const q = new MockQuery(this.tableName)
    return q.select(cols ?? '*', opts)
  }
  insert(data: Row | Row[]) {
    const q = new MockQuery(this.tableName, 'insert', data)
    return new MockMutationChain(q)
  }
  update(data: Row) {
    const q = new MockQuery(this.tableName, 'update', data)
    return new MockMutationChain(q)
  }
  upsert(data: Row | Row[], opts?: { onConflict?: string }) {
    const q = new MockQuery(this.tableName, 'upsert', data, opts?.onConflict)
    return new MockMutationChain(q)
  }
  delete() {
    const q = new MockQuery(this.tableName, 'delete')
    return new MockMutationChain(q)
  }
  eq(col: string, val: unknown) { return new MockQuery(this.tableName).eq(col, val) }
  order(col: string, opts?: { ascending?: boolean }) { return new MockQuery(this.tableName).order(col, opts) }
}

class MockMutationChain {
  constructor(private q: MockQuery) {}
  eq(col: string, val: unknown) { this.q.eq(col, val); return this }
  neq(col: string, val: unknown) { this.q.neq(col, val); return this }
  in(col: string, vals: unknown[]) { this.q.in(col, vals); return this }
  select(cols?: string) { this.q.select(cols ?? '*'); return this }
  single() { this.q.single(); return this }
  maybeSingle() { this.q.maybeSingle(); return this }
  then<R1, R2>(r: (v: unknown) => R1 | PromiseLike<R1>, rj?: (e: unknown) => R2 | PromiseLike<R2>): Promise<R1 | R2> {
    return this.q.then(r, rj)
  }
}

export function createMockSupabase(currentUserEmail: string | null) {
  const base = createMockClient(currentUserEmail)
  return {
    ...base,
    from: (table: string) => new MockQueryBuilder(table),
  }
}
