import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bocardo';

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = {
  query: async <T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> => {
    const start = Date.now();
    try {
      const res = await pool.query<T>(text, params);
      const duration = Date.now() - start;
      if (process.env.NODE_ENV === 'development' && duration > 500) {
        console.warn(`[DB Slow Query] ${duration}ms: ${text.slice(0, 100)}`);
      }
      return res;
    } catch (error) {
      console.error('[DB Query Error]', { text, params, error });
      throw error;
    }
  },

  /**
   * Executes callback within a Serializable PostgreSQL Transaction.
   * Perfect for payment processing and sequential lock enforcement.
   */
  withTransaction: async <T>(
    callback: (client: PoolClient) => Promise<T>,
    isolationLevel: 'READ COMMITTED' | 'SERIALIZABLE' = 'SERIALIZABLE'
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  close: async () => {
    await pool.end();
  },
};
