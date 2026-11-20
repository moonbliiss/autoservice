import { openDatabase } from '../db/openDatabase.js';
import { seedWorkshop } from '../db/seed.js';
import { createWorkshopQueries } from './queries.js';
import { createWorkshopMutations } from './mutations.js';
import { createInventory } from './inventory.js';
import { createWorkTime } from './workTime.js';

const accounts = { advisor: 1, mechanic: 2, client: 3, client2: 4, mechanic2: 5 };

export function openWorkshop(file, { now = Date.now } = {}) {
  const database = openDatabase(file);
  const account = id => database.get('SELECT * FROM accounts WHERE id = ?', id);
  const profile = key => {
    if (Object.hasOwn(accounts, key)) return account(accounts[key]);
    if (key === 'stockkeeper' || key === 'manager') {
      return database.get('SELECT * FROM accounts WHERE role=? ORDER BY id LIMIT 1', key);
    }
    return null;
  };
  const inventory = createInventory(database);
  const workTime = createWorkTime(database, now);
  const queries = createWorkshopQueries(database, inventory, workTime);
  const mutations = createWorkshopMutations(database, queries, account, workTime);
  database.transaction(() => {
    seedWorkshop(database, { account, ...mutations });
    workTime.restoreRunning();
    for (const [role, name] of [['stockkeeper', 'Олег Смирнов'], ['manager', 'Елена Сергеева']]) {
      database.run('INSERT INTO accounts(role,name) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE role=?)', role, name, role);
    }
  });

  const { list, details, dashboard, tracking } = queries;
  const { restock, orderSupply, receiveSupply, issueParts } = inventory;
  return { profile, list, details, dashboard, tracking, ...mutations, restock, orderSupply, receiveSupply, issueParts, close: database.close };
}
