import "server-only";
import { Pool, type PoolClient, type QueryResult } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

let pool: Pool | undefined;

function connectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}

export function databasePool() {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionString(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

function postgresSql(source: string) {
  let parameter = 0;
  const ignoredInsert = /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(source);
  let sql = source.trim().replace(/;\s*$/, "").replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO");
  sql = sql.replace(/\?/g, () => `$${++parameter}`);
  if (ignoredInsert) sql += " ON CONFLICT DO NOTHING";
  return sql;
}

function d1Result<T>(result: QueryResult) {
  return {
    success: true,
    results: result.rows as T[],
    meta: { changes: result.rowCount ?? 0 },
  } as unknown as D1Result<T>;
}

class PostgresPreparedStatement {
  constructor(
    public readonly sql: string,
    public readonly values: unknown[] = [],
    private readonly client?: Queryable,
  ) {}

  bind(...values: unknown[]) {
    return new PostgresPreparedStatement(this.sql, values, this.client);
  }

  async execute(client: Queryable = this.client ?? databasePool()) {
    return client.query(postgresSql(this.sql), this.values);
  }

  async run<T = Record<string, unknown>>() {
    return d1Result<T>(await this.execute());
  }

  async all<T = Record<string, unknown>>() {
    return d1Result<T>(await this.execute());
  }

  async first<T = Record<string, unknown>>() {
    const result = await this.execute();
    return (result.rows[0] as T | undefined) ?? null;
  }
}

class PostgresD1Adapter {
  constructor(private readonly client?: Queryable) {}

  prepare(sql: string) {
    return new PostgresPreparedStatement(sql, [], this.client);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]) {
    if (this.client) {
      const results = [];
      for (const statement of statements) {
        const prepared = statement as unknown as PostgresPreparedStatement;
        results.push(d1Result(await prepared.execute(this.client)));
      }
      return results as D1Result<T>[];
    }

    const client = await databasePool().connect();
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements) {
        const prepared = statement as unknown as PostgresPreparedStatement;
        results.push(d1Result(await prepared.execute(client)));
      }
      await client.query("COMMIT");
      return results as D1Result<T>[];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

const adapter = new PostgresD1Adapter();

export function db() {
  return adapter as unknown as D1Database;
}

export async function withDatabaseTransaction<T>(work: (database: D1Database) => Promise<T>) {
  const client = await databasePool().connect();
  try {
    await client.query("BEGIN");
    const database = new PostgresD1Adapter(client) as unknown as D1Database;
    const result = await work(database);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
