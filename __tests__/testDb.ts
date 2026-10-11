import initSqlJs from 'sql.js';
import type { SqlDriver, SqlParam } from '../src/db/driver';
import { migrate } from '../src/db/schema';

/** Real SQLite (compiled to WebAssembly) running in Node: the same SQL as the iPhone. */
export async function createTestDb(): Promise<SqlDriver> {
  const SQL = await initSqlJs();
  const raw = new SQL.Database();
  let depth = 0;
  const driver: SqlDriver = {
    exec(sql: string): void {
      raw.exec(sql);
    },
    run(sql: string, params: SqlParam[] = []) {
      raw.run(sql, params);
      return { changes: raw.getRowsModified() };
    },
    all<T>(sql: string, params: SqlParam[] = []): T[] {
      const st = raw.prepare(sql);
      try {
        st.bind(params);
        const out: T[] = [];
        while (st.step()) out.push(st.getAsObject() as unknown as T);
        return out;
      } finally {
        st.free();
      }
    },
    first<T>(sql: string, params: SqlParam[] = []): T | null {
      return driver.all<T>(sql, params)[0] ?? null;
    },
    transaction<T>(fn: () => T): T {
      if (depth > 0) return fn();
      depth++;
      raw.exec('BEGIN');
      try {
        const r = fn();
        raw.exec('COMMIT');
        return r;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  migrate(driver);
  return driver;
}

/** The 20 illustrative rows from your spreadsheet, in its six-column format. */
export const LEGACY_CSV = [
  'Title,Date,Use,Amount,Mode,Remark',
  'Haircut,19/04/2026,Misc.,₹70.00,Online,',
  'Paint,19/04/2026,Home,₹175.00,Online,',
  'Auto,20/04/2026,Transport,₹80.00,Cash,',
  'Coffee,22/04/2026,Food,₹60.00,Online,',
  'Tattoo,10/05/2026,Shopping,"₹3,700.00",Online,',
  'Self Recharge,11/05/2026,Bills,"₹4,099.00",Online,',
  'Medicine,25/05/2026,Essentials,"₹1,860.00",Online,',
  'Slice,03/06/2026,Bills,₹149.28,Online,',
  'Butter Chicken,07/06/2026,Food,₹690.00,Online,',
  'Stocks,02/07/2026,Invest,"₹1,000.00",Online,pc',
  'Clothes,03/07/2026,Shopping,₹350.00,Cash,"200,150"',
  'Doctor,15/07/2026,Medicine,₹300.00,Cash,fees',
  'Stocks,17/07/2026,Invest,"₹1,000.00",Online,ncc',
  'Movie,02/08/2026,Misc.,₹448.56,Online,',
  'Stocks,14/08/2026,Invest,"₹2,000.00",Online,',
  'Rakshbandhan,28/08/2026,Gifts,"₹2,000.00",Online,',
  'Stocks,01/09/2026,Invest,"₹2,000.00",Online,',
  'Samosa,04/09/2026,Food,₹90.03,Online,',
  'Bank,09/09/2026,Bills,₹46.00,Online,',
  'Biryani,20/09/2026,Food,₹100.00,Online,',
].join('\r\n');