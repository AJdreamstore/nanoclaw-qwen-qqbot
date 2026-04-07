/**
 * Database abstraction that automatically uses the available database engine.
 * Respects DB_ENGINE environment variable if set, otherwise auto-detect.
 */
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { logger } from '../src/logger.js';
import { createSchema } from '../src/db.js';

let useBetterSqlite3: boolean | null = null;
let BetterSqlite3Class: any = null;
let SqlJsInstance: any = null;

/**
 * Read DB_ENGINE from .env file
 */
function getDbEngineFromEnv(): 'better-sqlite3' | 'sql.js' | null {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return null;
  }
  
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^DB_ENGINE\s*=\s*(.+)$/m);
  if (match) {
    const engine = match[1].trim().toLowerCase();
    if (engine === 'better-sqlite3') {
      return 'better-sqlite3';
    } else if (engine === 'sql.js') {
      return 'sql.js';
    }
  }
  return null;
}

/**
 * Initialize database engine based on .env config or auto-detect
 */
async function initEngine(): Promise<void> {
  if (useBetterSqlite3 !== null) {
    return; // Already initialized
  }

  // Check .env configuration first
  const envEngine = getDbEngineFromEnv();
  if (envEngine) {
    logger.info(`Using database engine from .env: ${envEngine}`);
    
    if (envEngine === 'better-sqlite3') {
      try {
        const { default: Database } = await import('better-sqlite3');
        BetterSqlite3Class = Database;
        useBetterSqlite3 = true;
        logger.info('better-sqlite3 loaded successfully');
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to load better-sqlite3: ${errMsg}`);
        throw new Error(`DB_ENGINE is set to better-sqlite3 but failed to load it. Please install it: npm install better-sqlite3. Error: ${errMsg}`);
      }
    } else {
      // envEngine === 'sql.js'
      try {
        SqlJsInstance = await initSqlJs();
        useBetterSqlite3 = false;
        logger.info('sql.js loaded successfully');
        return;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to load sql.js: ${errMsg}`);
        throw new Error(`DB_ENGINE is set to sql.js but failed to load it. Please install it: npm install sql.js. Error: ${errMsg}`);
      }
    }
  }

  // No .env config, auto-detect
  logger.info('No DB_ENGINE in .env, auto-detecting...');
  
  // Try better-sqlite3 first
  try {
    const { default: Database } = await import('better-sqlite3');
    BetterSqlite3Class = Database;
    useBetterSqlite3 = true;
    logger.info('Using better-sqlite3 database engine (auto-detected)');
    return;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.info(`better-sqlite3 not available (${errMsg}), trying sql.js`);
  }

  // Fall back to sql.js
  try {
    SqlJsInstance = await initSqlJs();
    useBetterSqlite3 = false;
    logger.info('Using sql.js database engine (auto-detected)');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`sql.js also not available: ${errMsg}`);
    throw new Error(`No database engine available. Please install better-sqlite3 or sql.js. Error: ${errMsg}`);
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

  constructor(dbPath: string, options?: { readonly?: boolean; create?: boolean }) {
    this.dbPath = dbPath;
    this.readonlyMode = options?.readonly || false;

    if (!fs.existsSync(dbPath)) {
      if (options?.create) {
        // Create directory if it doesn't exist
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        // Create empty database file
        fs.writeFileSync(dbPath, Buffer.from([]));
      } else {
        throw new Error(`Database not found: ${dbPath}`);
      }
    }
  }

  async initialize(): Promise<void> {
    await initEngine();

    if (useBetterSqlite3!) {
      // Use better-sqlite3
      this.engine = 'better-sqlite3';
      this.db = new BetterSqlite3Class(this.dbPath, {
        readonly: this.readonlyMode,
      });
    } else {
      // Use sql.js
      this.engine = 'sql.js';
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SqlJsInstance.Database(fileBuffer);
    }

    logger.info({ path: this.dbPath, engine: this.engine }, 'Loaded database');
    
    // Create schema if it doesn't exist
    createSchema(this.db);
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
