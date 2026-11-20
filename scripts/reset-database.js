import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db/openDatabase.js';
import { seedWorkshopStructure } from '../server/db/seed.js';

const file = resolve(process.env.WORKSHOP_DB || fileURLToPath(new URL('../data/workshop.sqlite', import.meta.url)));
try {
  if (process.env.WORKSHOP_DB === ':memory:') throw new Error('База в памяти очищается при перезапуске приложения.');
  mkdirSync(dirname(file), { recursive: true });
  const databaseExists = existsSync(file);
  if (databaseExists) {
    const database = new DatabaseSync(file, { readOnly: true });
    try {
      const { count } = database.prepare(`SELECT count(*) AS count FROM sqlite_schema
        WHERE type='table' AND name IN ('accounts','service_requests','bays')`).get();
      if (count !== 3) throw new Error('В указанном файле нет базы «Мастерской».');
    } finally {
      database.close();
    }
  }

  const database = openDatabase(file);
  let backupFile;
  try {
    database.transaction(() => {
      if (databaseExists) {
        const reader = new DatabaseSync(file, { readOnly: true });
        try {
          backupFile = file + '.' + new Date().toISOString().replace(/[:.]/g, '-') + '.bak';
          reader.prepare('VACUUM INTO ?').run(backupFile);
          chmodSync(backupFile, 0o600);
        } finally {
          reader.close();
        }
      }

      database.exec('PRAGMA defer_foreign_keys=ON');
      const tables = database.all("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      for (const { name } of tables) database.exec('DELETE FROM "' + name.replaceAll('"', '""') + '"');
      database.exec('DELETE FROM sqlite_sequence');
      seedWorkshopStructure(database);
    });
  } finally {
    database.close();
  }

  if (backupFile) console.log('Резервная копия: ' + backupFile);
  console.log('Рабочие данные очищены. Профили и схема цеха готовы к запуску.');
} catch (error) {
  console.error('Не удалось очистить базу: ' + error.message);
  process.exitCode = 1;
}
