/**
 * Database abstraction that automatically uses the available database engine.
 * Tries better-sqlite3 first (better performance), falls back to sql.js.
 */
import fs from 'fs';
import { logger } from '../src/logger.js';

let useBetterSqlite3: boolean | null = null;
let BetterSqlite3Class: any = null;
let SqlJsInstance: any = null;

/**
 * Initialize database engine based on what's available
 */
function initEngine() {
  if (useBetterSqlite3 !== null) {
    return; // Already initialized
  }

  // Try better-sqlite3 first
  try {
    const { default: Database } = require('better-sqlite3');
    BetterSqlite3Class = Database;
    useBetterSqlite3 = true;
    logger.info('Using better-sqlite3 database engine');
    return;
  } catch (err) {
    logger.info('better-sqlite3 not available, trying sql.js');
  }

  // Fall back to sql.js
  try {
    const initSqlJs = require('sql.js').default;
    SqlJsInstance = initSqlJs();
    useBetterSqlite3 = false;
    logger.info('Using sql.js database engine');
  } catch (err) {
    throw new Error('No database engine available. Please install better-sqlite3 or sql.js');
  }
}

/**
 * Database class that works with either better-sqlite3 or sql.js
 */
export class Database {
  private db: any;
  private dbPath: string;
  private readonlyMode: boolean;
  private engine: 'better-sqlite3' | 'sql.js';

  constructor(dbPath: string, options?: { readonly?: boolean }) {
    initEngine();
    this.dbPath = dbPath;
    this.readonlyMode = options?.readonly || false;

    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database not found: ${dbPath}`);
    }

    if (useBetterSqlite3!) {
      // Use better-sqlite3
      this.engine = 'better-sqlite3';
      this.db = new BetterSqlite3Class(dbPath, {
        readonly: this.readonlyMode,
      });
    } else {
      // Use sql.js
      this.engine = 'sql.js';
      const fileBuffer = fs.readFileSync(dbPath);
      this.db = new SqlJsInstance.Database(fileBuffer);
    }

    logger.info({ path: dbPath, engine: this.engine }, 'Loaded database');
  }

  prepare(sql: string) {
    if (this.engine === 'better-sqlite3') {
      return this.db.prepare(sql);
    } else {
      // sql.js wrapper
      return {
        run: (...params: any[]) => {
          this.db.run(sql, params);
          return { changes: this.db.getRowsModified() };
        },
        get: (...params: any[]) => {
          const stmt = this.db.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return undefined;
        },
        all: (...params: any[]) => {
          const stmt = this.db.prepare(sql);
          stmt.bind(params);
          const results: any[] = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        },
      };
    }
  }

  exec(sql: string) {
    return this.db.exec(sql);
  }

  run(sql: string, params: any[] = []) {
    if (this.engine === 'better-sqlite3') {
      this.db.run(sql, params);
      return { changes: this.db.changes };
    } else {
      this.db.run(sql, params);
      return { changes: this.db.getRowsModified() };
    }
  }

  close() {
    if (!this.readonlyMode && this.engine === 'sql.js') {
      this.save();
    }
    this.db.close();
  }

  private save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
    logger.debug({ path: this.dbPath }, 'Database saved');
  }
}
