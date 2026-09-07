import { DatabaseSync } from 'node:sqlite'
import { initializeOrVerifySchema } from './schema.js'
import { attachProductionGovernance } from './production-governance-registry.js'

export class SqliteStore {
  readonly database: DatabaseSync

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath)
    try {
      this.database.exec('PRAGMA foreign_keys = ON')
      this.database.exec('PRAGMA busy_timeout = 5000')
      initializeOrVerifySchema(this.database)
      this.database = attachProductionGovernance(databasePath, this.database)
    } catch (error) {
      this.database.close()
      throw error
    }
  }

  transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const value = operation()
      this.database.exec('COMMIT')
      return value
    } catch (error) {
      try {
        this.database.exec('ROLLBACK')
      } catch {
        // Preserve the first storage error.
      }
      throw error
    }
  }

  close(): void {
    this.database.close()
  }
}
