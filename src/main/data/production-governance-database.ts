import type { DatabaseSync, SQLInputValue } from 'node:sqlite'

export interface GovernanceWatch {
  table: string
  keys: readonly string[]
  values?: readonly { column: string; json?: string }[]
}
export interface GovernanceObserver {
  /** Durably records an applied row before its SQL transaction can commit. No content is passed. */
  before(table: string, keys: SQLInputValue[], values: SQLInputValue[], deleted: boolean): string
  /** Reads committed state using the raw connection, never another writer's uncommitted state. */
  settle(database: DatabaseSync): void
}

/** Runtime-only guards cover all writes, including statements prepared before these guards existed. */
export function guardGovernanceDatabase(
  database: DatabaseSync,
  watches: readonly GovernanceWatch[],
  observer: GovernanceObserver
): { database: DatabaseSync; settle(): void } {
  let dirty = false
  let activeIterators = 0
  const names = new Map(watches.map((watch) => [watch.table, watch]))
  if (names.size !== watches.length) throw Error('GOVERNANCE_DUPLICATE_WATCH')
  for (const watch of watches)
    if (
      !/^[a-z_]+$/.test(watch.table) ||
      !watch.keys.length ||
      watch.keys.some((key) => !/^[a-z_]+$/.test(key))
    )
      throw Error('GOVERNANCE_INVALID_WATCH')
  database.function('mashiro_governance_before', { varargs: true }, (...args) => {
    const [table, deleted, ...data] = args
    const watch = typeof table === 'string' ? names.get(table) : undefined
    if (
      !watch ||
      ![0, 1].includes(Number(deleted)) ||
      data.length !== watch.keys.length + (watch.values?.length ?? 0)
    )
      throw Error('GOVERNANCE_INVALID_EVENT')
    dirty = true
    const token = observer.before(
      String(table),
      data.slice(0, watch.keys.length),
      data.slice(watch.keys.length),
      deleted === 1
    )
    if (!token || token.length > 200) throw Error('GOVERNANCE_INVALID_TOKEN')
    return token
  })
  for (const watch of watches) {
    const expression = (row: string, value: { column: string; json?: string }) =>
      value.json
        ? 'json_extract(' + row + '.' + value.column + ",'$." + value.json + "')"
        : row + '.' + value.column
    for (const value of watch.values ?? [])
      if (
        !/^[a-z_]+$/.test(value.column) ||
        (value.json !== undefined && !/^[A-Za-z_]+$/.test(value.json))
      )
        throw Error('GOVERNANCE_INVALID_PROJECTION')
    const insertion = (row: string, deleted: boolean, condition = '') =>
      "INSERT INTO production_governance_commits(token) SELECT mashiro_governance_before('" +
      watch.table +
      "'," +
      Number(deleted) +
      ',' +
      [
        ...watch.keys.map((key) => row + '.' + key),
        ...(watch.values ?? []).map((value) => expression(row, value))
      ].join(',') +
      ')' +
      condition +
      ';'
    for (const action of ['INSERT', 'UPDATE', 'DELETE']) {
      const row = action === 'DELETE' ? 'OLD' : 'NEW'
      const oldKey =
        action === 'UPDATE'
          ? insertion(
              'OLD',
              true,
              ' WHERE ' + watch.keys.map((key) => 'OLD.' + key + ' IS NOT NEW.' + key).join(' OR ')
            )
          : ''
      database.exec(
        'CREATE TEMP TRIGGER mashiro_governance_' +
          watch.table +
          '_' +
          action +
          ' AFTER ' +
          action +
          ' ON main.' +
          watch.table +
          ' BEGIN ' +
          oldKey +
          insertion(row, action === 'DELETE') +
          ' END'
      )
    }
  }
  const settle = () => {
    if (dirty && !database.isTransaction && activeIterators === 0) {
      observer.settle(database)
      dirty = false
    }
  }
  const finish = <T>(operation: () => T): T => {
    try {
      return operation()
    } finally {
      settle()
    }
  }
  const guarded = new Proxy(database, {
    get(target, name) {
      if (name === 'prepare')
        return (...args: Parameters<DatabaseSync['prepare']>) => {
          const statement = target.prepare(...args)
          return new Proxy(statement, {
            get(prepared, method) {
              const value = Reflect.get(prepared, method, prepared)
              if (typeof value !== 'function') return value
              if (method === 'run' || method === 'get' || method === 'all')
                return (...values: unknown[]) =>
                  finish(() => Reflect.apply(value, prepared, values))
              if (method === 'iterate')
                return (...values: unknown[]) => {
                  const iterator = Reflect.apply(value, prepared, values) as Iterator<unknown>
                  let active = true
                  activeIterators++
                  const complete = () => {
                    if (active) {
                      active = false
                      activeIterators--
                    }
                    settle()
                  }
                  return {
                    [Symbol.iterator]() {
                      return this
                    },
                    next() {
                      try {
                        const result = iterator.next()
                        if (result.done) complete()
                        return result
                      } catch (error) {
                        complete()
                        throw error
                      }
                    },
                    return() {
                      try {
                        return iterator.return?.() ?? { done: true, value: undefined }
                      } finally {
                        complete()
                      }
                    }
                  }
                }
              return value.bind(prepared)
            }
          })
        }
      if (name === 'exec') return (sql: string) => finish(() => target.exec(sql))
      if (name === 'close')
        return () => {
          settle()
          target.close()
        }
      const value = Reflect.get(target, name, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
  return { database: guarded, settle }
}
