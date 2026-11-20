import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function migrateAccountRoles(db) {
  const definition = db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='accounts'").get();
  if (definition.sql.includes("'stockkeeper'")) return;

  // Keep account IDs and the referenced table name when replacing the old role constraint.
  db.exec('PRAGMA foreign_keys=OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE accounts_new (
        id INTEGER PRIMARY KEY,
        role TEXT NOT NULL CHECK (role IN ('advisor','mechanic','client','stockkeeper','manager')),
        name TEXT NOT NULL,
        phone TEXT
      ) STRICT;
      INSERT INTO accounts_new SELECT id,role,name,phone FROM accounts;
      DROP TABLE accounts;
      ALTER TABLE accounts_new RENAME TO accounts;`);
      if (db.prepare('PRAGMA foreign_key_check').get()) throw new Error('Нарушены связи с учётными записями.');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
}

export function openDatabase(file) {
  const db = new DatabaseSync(file);
  try {
    db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    migrateAccountRoles(db);
  } catch (error) {
    db.close();
    throw error;
  }
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
