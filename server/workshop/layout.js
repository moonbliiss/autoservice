import { integer, requireValue, str } from './validation.js';

const kinds = ['workshop', 'service', 'arrival', 'warehouse', 'reception'];
const kindsWithSlots = ['workshop', 'service', 'arrival'];
const maxAreas = 14;

function validateAreas(value) {
  requireValue(Array.isArray(value) && value.length > 0 && value.length <= maxAreas, 'Добавьте до 14 зон.');
  const areas = value.map(area => {
    requireValue(area && kinds.includes(area.kind), 'Выберите тип зоны.');
    const { kind } = area;
    const id = str(area.id, 'Идентификатор зоны', { limit: 64 });
    const name = str(area.name, 'Название зоны', { limit: 75 });
    const dimensions = {};
    for (const [key, label] of [['x', 'X'], ['z', 'Z'], ['width', 'Ширина'], ['depth', 'Глубина']]) {
      const n = area[key];
      requireValue(typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 120
        && (key === 'x' || key === 'z' || n >= 3), 'Проверьте координаты и размеры зоны «' + name + '», поле «' + label + '».');
      dimensions[key] = Math.round(n * 100) / 100;
    }
    const hasSlots = kindsWithSlots.includes(kind);
    requireValue(Array.isArray(area.slots) && area.slots.length >= Number(hasSlots)
      && area.slots.length <= (hasSlots ? 12 : 0), 'В зоне «' + name + '» должно быть от 1 до 12 мест или постов.');
    const slots = area.slots.map(slot => ({
      id: integer(slot?.id, 'Номер места', 1, 999),
      ...(kind === 'workshop' ? { name: str(slot.name, 'Название поста', { limit: 75 }) } : {}),
    }));
    const minWidth = kind === 'workshop' ? slots.length * 6.05 + 2 : hasSlots ? slots.length * 3.25 + .5 : 3;
    const minDepth = kind === 'workshop' ? 14 : hasSlots ? 8 : 3;
    requireValue(dimensions.width >= minWidth && dimensions.depth >= minDepth,
      'Увеличьте зону «' + name + '» до ' + minWidth.toFixed(2) + ' × ' + minDepth + '.');
    return { id, kind, name, ...dimensions, slots };
  });
  requireValue(new Set(areas.map(area => area.id)).size === areas.length, 'У зон должны быть разные идентификаторы.');
  requireValue(areas.filter(area => area.kind === 'workshop').length === 1, 'Добавьте один цех с подъёмниками.');
  for (const kind of ['warehouse', 'reception']) {
    requireValue(areas.filter(area => area.kind === kind).length <= 1, 'Склад и приёмку можно добавить по одному разу.');
  }
  for (const kind of kindsWithSlots) {
    const ids = areas.filter(area => area.kind === kind).flatMap(area => area.slots.map(slot => slot.id));
    requireValue(new Set(ids).size === ids.length, 'У мест одного типа должны быть разные номера.');
  }
  for (const [index, area] of areas.entries()) {
    const back = area.kind === 'workshop' ? area.z + area.depth - 3 : area.z + area.depth - 1.9;
    for (const other of areas.slice(index + 1)) {
      requireValue(area.x + area.width <= other.x || other.x + other.width <= area.x
        || area.z + area.depth <= other.z || other.z + other.depth <= area.z,
      'Разведите зоны «' + area.name + '» и «' + other.name + '»: они накладываются.');
    }
    if (!kindsWithSlots.includes(area.kind)) continue;
    const blocker = areas.find(other => other !== area && other.x + other.width > area.x + area.width &&
      other.z < back + 1.2 && other.z + other.depth > back - 1.2);
    requireValue(!blocker, 'Проезд справа от зоны «' + area.name + '» перекрыт зоной «' + blocker?.name + '».');
  }
  return areas;
}

export function createLayoutStore({ get, all, run, transaction }) {
  function read() {
    const row = get('SELECT revision,configuration FROM workshop_layout WHERE id=1');
    return row ? { revision: row.revision, areas: row.configuration ? JSON.parse(row.configuration) : null } : null;
  }

  function save(user, input) {
    requireValue(user.role === 'manager', 'Схему может менять управляющий.', 403);
    const revision = integer(input.revision, 'Версия схемы', 0);
    requireValue(input.areas === null || Array.isArray(input.areas), 'Выберите шаблон или нарисуйте схему.');
    const areas = input.areas === null ? null : validateAreas(input.areas);
    return transaction(() => {
      const current = read();
      requireValue((current?.revision ?? 0) === revision, 'Схему уже изменили в другом окне. Откройте сохранённую схему заново.', 409);
      const slots = kind => areas.filter(area => area.kind === kind).flatMap(area => area.slots);
      if (areas) {
        const postIds = new Set(slots('workshop').map(slot => slot.id));
        const parkingIds = new Set(slots('service').map(slot => slot.id));
        const arrivalIds = new Set(slots('arrival').map(slot => slot.id));
        for (const { bay_id } of all('SELECT bay_id FROM orders WHERE bay_id IS NOT NULL UNION SELECT bay_id FROM parking_transfers')) {
          requireValue(postIds.has(bay_id), 'Пост ' + bay_id + ' занят или зарезервирован. Сначала освободите его.', 409);
        }
        for (const { space_id } of all('SELECT space_id FROM parking_assignments')) {
          requireValue(parkingIds.has(space_id), 'Место ' + space_id + ' на сервисной парковке занято.', 409);
        }
        for (const { space_id } of all('SELECT space_id FROM arrival_parking')) {
          requireValue(arrivalIds.has(space_id), 'Место К' + space_id + ' на клиентской парковке занято.', 409);
        }
        for (const { id, name } of slots('workshop')) {
          run('INSERT INTO bays(id,name) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name', id, name);
        }
        for (const { id } of all('SELECT id FROM bays')) if (!postIds.has(id)) run('DELETE FROM bays WHERE id=?', id);
        for (const { id } of slots('service')) run('INSERT OR IGNORE INTO parking_spaces(id) VALUES (?)', id);
        for (const { id } of all('SELECT id FROM parking_spaces')) if (!parkingIds.has(id)) run('DELETE FROM parking_spaces WHERE id=?', id);
      } else {
        requireValue(current?.areas == null, 'Чтобы заменить схему шаблоном, откройте его в конструкторе и сохраните.', 409);
      }
      run(`INSERT INTO workshop_layout(id,revision,configuration) VALUES (1,?,?)
        ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, configuration=excluded.configuration`,
      revision + 1, areas ? JSON.stringify(areas) : null);
      return { revision: revision + 1, areas };
    });
  }

  return { read, save };
}
