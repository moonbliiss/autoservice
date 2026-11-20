import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(file) {
  const db = new DatabaseSync(file);
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const run = (sql, ...values) => db.prepare(sql).run(...values);
  const all = (sql, ...values) => db.prepare(sql).all(...values);
  const get = (sql, ...values) => db.prepare(sql).get(...values);
  let inTransaction = false;
  const transaction = work => {
    if (inTransaction) return work();
    db.exec('BEGIN IMMEDIATE');
    inTransaction = true;
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      inTransaction = false;
    }
  };

  return { run, all, get, transaction, exec: sql => db.exec(sql), close: () => db.close() };
}
