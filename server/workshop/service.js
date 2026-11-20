import { openDatabase } from '../db/openDatabase.js';
import { seedWorkshop } from '../db/seed.js';
import { createWorkshopQueries } from './queries.js';
import { createWorkshopMutations } from './mutations.js';

const accounts = { advisor: 1, mechanic: 2, client: 3, client2: 4, mechanic2: 5 };

export function openWorkshop(file) {
  const database = openDatabase(file);
  const account = id => database.get('SELECT * FROM accounts WHERE id = ?', id);
  const profile = key => Object.hasOwn(accounts, key) ? account(accounts[key]) : null;
  const queries = createWorkshopQueries(database);
  const mutations = createWorkshopMutations(database, queries, account);
  database.transaction(() => seedWorkshop(database, { account, ...mutations }));

  const { list, details, dashboard, tracking } = queries;
  return { profile, list, details, dashboard, tracking, ...mutations, close: database.close };
}
