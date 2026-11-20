const $ = selector => document.querySelector(selector);
const content = $('#content');
const dialog = $('#dialog');
const profileSelect = $('#profile');
const navigation = $('#navigation');
const profiles = { 1: 'advisor', 2: 'mechanic', 3: 'client', 4: 'client2', 5: 'mechanic2' };
const labels = {
  new: 'Новая', scheduled: 'Визит назначен', cancelled: 'Отменена', received: 'Автомобиль принят',
  diagnosis_assigned: 'Назначена диагностика', diagnosing: 'Диагностика', awaiting_estimate: 'Подготовка сметы',
  awaiting_approval: 'На согласовании', declined: 'Смета отклонена', approved: 'Смета согласована',
  repair_assigned: 'Работы назначены', repairing: 'В ремонте', paused: 'Работы приостановлены',
  inspection: 'Контроль качества', ready: 'Готов к выдаче', issued: 'Автомобиль выдан',
};
const end = new Set(['issued', 'cancelled']);
const workshopStates = new Set(['diagnosis_assigned', 'diagnosing', 'repair_assigned', 'repairing', 'paused', 'inspection']);
const navByRole = {
  advisor: [['overview', '▦', 'Обзор'], ['requests', '▤', 'Заказы и заявки'], ['stock', '▥', 'Склад']],
  mechanic: [['overview', '▦', 'Моя смена'], ['requests', '▤', 'Мои задачи']],
  client: [['overview', '▤', 'Мои заявки'], ['cars', '▥', 'Автомобили']],
};
const actionLabels = {
  schedule: 'Назначить визит', cancel: 'Отменить заявку', receive: 'Принять автомобиль',
  diagnose: 'Назначить диагностику', startDiagnosis: 'Начать диагностику', diagnosisReport: 'Сдать диагностику',
  estimate: 'Подготовить смету', approve: 'Согласовать смету', decline: 'Отклонить смету',
  assign: 'Назначить ремонт', startRepair: 'Начать ремонт', pause: 'Приостановить', resume: 'Возобновить',
  repairReport: 'Передать на проверку', ready: 'Подтвердить готовность', rework: 'Вернуть на доработку', release: 'Освободить пост',
  returnCar: 'Подготовить возврат', payment: 'Зарегистрировать оплату', issue: 'Выдать автомобиль',
  newRequest: 'Новая заявка', restock: 'Пополнить склад',
};
const actionOrder = ['receive', 'schedule', 'cancel', 'diagnose', 'startDiagnosis', 'diagnosisReport', 'estimate',
  'approve', 'decline', 'assign', 'startRepair', 'resume', 'repairReport', 'pause', 'release', 'ready', 'rework', 'returnCar', 'payment', 'issue'];
const roleLabels = { advisor: 'Мастер-приёмщик', mechanic: 'Механик', client: 'Клиент' };
const paymentLabels = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод' };
const money = amount => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(amount) + ' ₽';
const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const number = value => Number(value).toLocaleString('ru-RU');
const dateOnly = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('ru-RU') : '';
function dateTime(value) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const code = id => '#' + String(id).padStart(4, '0');
const button = (label, command, value = '', className = 'secondary') =>
  `<button type="button" class="${className}" data-command="${command}" data-value="${safe(value)}">${safe(label)}</button>`;
const status = state => `<span class="tag ${['new', 'awaiting_estimate', 'awaiting_approval', 'paused'].includes(state) ? 'wait'
  : ['declined', 'cancelled'].includes(state) ? 'alert' : workshopStates.has(state) || state === 'ready' ? 'active' : ''}">${labels[state] || 'Свободен'}</span>`;
const option = (value, label, selected) => `<option value="${safe(value)}"${String(selected ?? '') === String(value) ? ' selected' : ''}>${safe(label)}</option>`;
const panel = (title, body) => `<section class="panel inset"><h2>${safe(title)}</h2>${body}</section>`;

let dash;
let current = 'overview';
let detail;
let backTo = 'overview';
let selectedBay = 1;
let search = '';
let filter = 'all';
let activeAction;
let switching = false;
let submitting = false;
let notificationTimer;

async function api(path, payload) {
  const response = await fetch('/api/' + path, payload === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Не удалось загрузить данные.'), { status: response.status });
  return data;
}

function notify(message, error = false) {
  const notice = $('#notice');
  notice.textContent = message;
  notice.classList.toggle('error', error);
  notice.hidden = false;
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => { notice.hidden = true; }, error ? 11000 : 4500);
}

async function getDashboard() {
  return api('dashboard');
}

async function chooseProfile(key) {
  switching = true;
  profileSelect.disabled = true;
  try {
    await api('session', { profile: key });
    dash = await getDashboard();
    const previousId = detail?.id;
    detail = null;
    current = 'overview';
    backTo = 'overview';
    if (previousId && dash.requests.some(row => row.id === previousId)) {
      detail = await api('requests/' + previousId);
      current = 'detail';
    }
    selectedBay = dash.bays?.find(bay => dash.requests.some(row => row.id === bay.request_id))?.id || 1;
    search = '';
    filter = 'all';
    $('#notice').hidden = true;
    render();
  } finally {
    switching = false;
    profileSelect.disabled = false;
  }
}

function heading(title, subtitle, action = '', eyebrow = '') {
  return `<div class="title-row"><div>
    ${eyebrow ? `<p class="overline">${safe(eyebrow)}</p>` : ''}
    <h1>${safe(title)}</h1>${subtitle ? `<p class="subtitle">${safe(subtitle)}</p>` : ''}</div>${action}</div>`;
}

function metrics(items) {
  return `<div class="metrics">${items.map(([label, value]) =>
    `<div class="metric"><span>${safe(label)}</span><strong>${safe(value)}</strong></div>`).join('')}</div>`;
}

function table(headings, rows, empty = 'Здесь пока ничего нет.') {
  return rows.length
    ? `<div class="table-wrap"><table><thead><tr>${headings.map(label => `<th scope="col">${safe(label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : `<p class="empty">${safe(empty)}</p>`;
}

function requestRows(requests) {
  const advisor = dash.user.role === 'advisor';
  const mechanic = dash.user.role === 'mechanic';
  return table(['Заявка', 'Автомобиль', ...(advisor ? ['Клиент'] : []), 'Статус', mechanic ? 'Пост' : 'Визит'],
    requests.map(row => [
      button(code(row.id), 'detail', row.id, 'table-link'),
      `<strong>${safe(row.model)}</strong><br><span class="meta">${safe(row.plate)}</span>`,
      ...(advisor ? [safe(row.client_name)] : []),
      status(row.status) + (row.priority === 'urgent' ? ' <span class="tag alert">Срочно</span>' : ''),
      mechanic ? row.bay_id ? `Пост ${row.bay_id}` : '—' : safe(dateTime(row.appointment) || '—'),
    ]), 'Нет заявок по выбранным условиям.');
}

function sendMapState() {
  $('#garage-frame')?.contentWindow.postMessage({ type: 'workshop-bays', bays: dash.bays, selected: selectedBay }, location.origin);
}

function bayDetails() {
  const bays = dash.bays;
  const selected = bays.find(bay => bay.id === selectedBay) || bays[0];
  const own = dash.requests.some(row => row.id === selected.request_id);
  return `<div class="bay-list">${bays.map(bay => `<button type="button" class="bay" data-command="bay" data-value="${bay.id}" aria-pressed="${bay.id === selected.id}">
    <span class="number">${String(bay.number).padStart(2, '0')}</span><span><strong>${safe(bay.name)}</strong>
    <small>${bay.status ? safe(bay.model) : 'Свободен'}</small></span></button>`).join('')}</div>
    <div class="bay-detail">${status(selected.status)}<p class="muted">${selected.status ? safe(selected.mechanic) : 'Пост доступен для назначения.'}</p>
    ${own ? button('Открыть ' + code(selected.request_id), 'detail', selected.request_id, 'text-button') : ''}</div>`;
}

function floor() {
  return `<div class="map-grid"><section class="panel map-panel"><div class="panel-head"><h2>Карта цеха</h2>
    <p class="muted">3D · ${dash.bays.length} поста</p></div><iframe id="garage-frame" src="./garage-map.html" title="Интерактивная 3D-карта цеха"></iframe></section>
    <section class="panel"><div class="panel-head"><h2>Посты сервиса</h2></div><div id="bay-list">${bayDetails()}</div></section></div>`;
}

function floorSelection(id, restoreFocus = false) {
  if (!dash.bays?.some(bay => bay.id === id)) return;
  selectedBay = id;
  const list = $('#bay-list');
  if (list) list.innerHTML = bayDetails();
  if (restoreFocus) list?.querySelector('[aria-pressed=true]')?.focus();
  sendMapState();
}

function overview() {
  const { requests, user } = dash;
  if (user.role === 'client') {
    return heading('Мои заявки', 'Следите за визитом, согласованием сметы и готовностью автомобиля.',
      button('Новая заявка', 'action', 'newRequest', 'primary'), 'КАБИНЕТ КЛИЕНТА')
      + metrics([['Открытые заявки', requests.filter(row => !end.has(row.status)).length],
        ['На согласовании', requests.filter(row => row.status === 'awaiting_approval').length],
        ['Готовы к выдаче', requests.filter(row => row.status === 'ready').length]])
      + `<section class="panel"><div class="panel-head"><h2>История обслуживания</h2></div>${requestRows(requests)}</section>`;
  }
  if (user.role === 'mechanic') {
    const jobs = requests.filter(row => workshopStates.has(row.status) && row.bay_id && row.assigned_to_me);
    const active = jobs[0];
    return heading('Моя смена', 'Текущий пост, задача и результаты работы.', '', 'КАБИНЕТ МЕХАНИКА')
      + (active ? panel(`Ваш пост ${String(active.bay_id).padStart(2, '0')} · ${dash.bays.find(bay => bay.id === active.bay_id)?.name || ''}`,
        `<div class="split"><div><strong>${safe(active.model)}</strong><p class="muted">${safe(active.plate)}</p></div>${status(active.status)}</div>
        <div class="actions">${button('Открыть задачу', 'detail', active.id, 'primary')}</div>`) : panel('Текущий пост', '<p class="muted">Активного назначения пока нет.</p>'))
      + '<div class="section-gap"></div>' + floor()
      + `<section class="panel"><div class="panel-head"><h2>Задачи смены</h2></div>${requestRows(requests)}</section>`;
  }
  const occupied = dash.bays.filter(bay => bay.status).length;
  return heading('Карта сервиса', 'Загрузка цеха и движение заказов', '', 'РАБОЧЕЕ МЕСТО ПРИЁМЩИКА')
    + metrics([['Новые заявки', requests.filter(row => row.status === 'new').length],
      ['Занятые посты', `${occupied} / ${dash.bays.length}`],
      ['Готовы к выдаче', requests.filter(row => row.status === 'ready').length]])
    + floor() + `<section class="panel"><div class="panel-head"><h2>Недавние заявки</h2>
      ${button('Все заявки', 'nav', 'requests', 'text-button')}</div>${requestRows(requests.slice(0, 5))}</section>`;
}

function filteredRows() {
  const needle = search.trim().toLocaleLowerCase('ru');
  return requestRows(dash.requests.filter(row => (filter === 'all' || filter === 'open' && !end.has(row.status)
    || filter === 'closed' && end.has(row.status) || filter === row.status)
    && [row.model, row.plate, code(row.id), row.client_name].some(value => value?.toLocaleLowerCase('ru').includes(needle))));
}

function requestList() {
  return heading(dash.user.role === 'mechanic' ? 'Мои задачи' : 'Заказы и заявки', 'Найдите заявку по автомобилю, номеру или этапу.')
    + `<section class="panel"><div class="panel-head"><h2>Журнал</h2></div>
      <div class="tool-row"><input id="search" type="search" aria-label="Поиск по заявкам" placeholder="Поиск по заявкам" value="${safe(search)}">
      <select id="request-filter" aria-label="Этап заявки">${Object.entries({ all: 'Все статусы', open: 'Открытые', closed: 'Завершённые', ...labels })
        .map(([key, label]) => option(key, label, filter)).join('')}</select></div>
      <div id="results">${filteredRows()}</div></section>`;
}

function stockView() {
  return heading('Склад запчастей', 'Остатки, поступления и расход по заказ-нарядам.',
    button('Пополнить склад', 'action', 'restock', 'primary'))
    + `<div class="column"><section class="panel"><div class="panel-head"><h2>Остатки</h2></div>${table(['Артикул', 'Запчасть', 'В наличии', 'Цена'],
      dash.parts.map(part => [safe(part.sku), safe(part.name), part.stock, money(part.price)]))}</section>
      <section class="panel"><div class="panel-head"><h2>Последние движения</h2></div>${table(['Дата', 'Запчасть', 'Количество', 'Сотрудник', 'Документ'],
      dash.movements.map(row => [dateTime(row.created_at), safe(row.name), row.quantity > 0 ? '+' + row.quantity : row.quantity,
        safe(row.employee), safe(row.note || 'Отчёт механика')]), 'Движений пока нет.')}</section></div>`;
}

function carsView() {
  return heading('Мои автомобили', 'Выберите автомобиль, чтобы отправить заявку в сервис.',
    button('Новая заявка', 'action', 'newRequest', 'primary'))
    + `<div class="profile-cars">${dash.vehicles.map(car => `<section class="panel inset car-card"><h2>${safe(car.model)}</h2>
      <p>${safe(car.plate)}</p><p class="muted">${car.mileage == null ? 'Пробег не указан' : number(car.mileage) + ' км'}</p>
      <div class="actions">${button('Записаться', 'new-car-request', car.id)}</div></section>`).join('')}</div>`;
}

function estimatePanel(row) {
  if (!row.estimate.length) return '';
  if (dash.user.role === 'mechanic') {
    return panel('Согласованные позиции', row.estimate.map(line => `<p class="split line-item"><span>${safe(line.name)}</span>
      <strong>× ${line.quantity}</strong></p>`).join(''));
  }
  return panel('Смета · версия ' + row.estimate_version,
    row.estimate.map(line => `<p class="split line-item"><span>${safe(line.name)} <small class="meta">× ${line.quantity}</small></span>
    <strong>${money(line.quantity * line.unit_price)}</strong></p>`).join('')
    + `<p class="split line-item"><strong>${row.status === 'declined' ? 'Отклонена клиентом' : 'По смете'}</strong>
       <strong>${money(row.estimate.reduce((sum, line) => sum + line.quantity * line.unit_price, 0))}</strong></p>`);
}

function paymentPanel(row) {
  if (dash.user.role === 'mechanic' || !['ready', 'issued'].includes(row.status)) return '';
  return panel('Оплата', `<p class="split"><span>Оплачено</span><strong>${money(row.paid)}</strong></p>
    <p class="split"><span>Осталось</span><strong>${money(row.total - row.paid)}</strong></p>`
    + row.payments.map(payment => `<p class="split line-item"><span>${paymentLabels[payment.method]} · ${dateTime(payment.created_at)}</span>
      <strong>${money(payment.amount)}</strong></p>`).join(''));
}

function reportsPanel(row) {
  if (!row.reports.length) return '';
  return panel('Отчёты механиков', row.reports.map(report => `<article class="report"><h3>${report.kind === 'diagnosis' ? 'Диагностика' : 'Ремонт'}</h3>
    <p class="meta">${safe(report.mechanic)} · ${report.minutes} мин · ${dateTime(report.created_at)}</p>
    <p class="request-text">${safe(report.result)}</p>
    ${report.recommendations ? `<p class="request-text">Рекомендации: ${safe(report.recommendations)}</p>` : ''}
    ${report.parts ? `<p class="request-text">Израсходовано: ${safe(report.parts)}</p>` : ''}</article>`).join(''));
}

function facts(values) {
  return `<dl class="facts">${values.filter(([, value]) => value != null && value !== '').map(([label, value]) =>
    `<div><dt>${safe(label)}</dt><dd>${safe(value)}</dd></div>`).join('')}</dl>`;
}

function detailsView(row) {
  const options = actionOrder.filter(key => row.actions.includes(key));
  const actions = options.map((key, index) => button(
    key === 'schedule' && row.appointment ? 'Перенести визит'
      : key === 'estimate' && row.estimate_version ? 'Пересмотреть смету'
      : key === 'assign' && row.status === 'repair_assigned' ? 'Изменить назначение'
      : actionLabels[key], 'action', key, index === 0 ? 'primary' : 'secondary')).join('');
  const data = facts([['Пробег', row.mileage != null ? number(row.mileage) + ' км' : null],
    ['Желаемая дата', dateOnly(row.preferred_date)], ['Визит', dateTime(row.appointment)], ['Ожидаемая готовность', dateTime(row.eta)],
    ['Клиент', row.client_name], ['Телефон', row.client_phone], ['VIN', row.vin], ['Исполнитель', row.mechanic_name]]);
  const expected = row.assigned_to_me && ['diagnosis_assigned', 'diagnosing'].includes(row.status)
    ? 'В отчёте укажите результаты проверки, причину неисправности, время и рекомендации.'
    : row.assigned_to_me && ['repair_assigned', 'repairing', 'paused'].includes(row.status)
      ? 'В отчёте укажите выполненные работы, результаты проверки, время и фактически использованные запчасти.'
      : '';
  const job = row.work_instructions && dash.user.role !== 'client'
    ? panel(row.bay_id ? `Пост ${row.bay_id} · ${row.bay_name}` : 'Последнее задание',
      `<p class="request-text">${safe(row.work_instructions)}</p>
      ${expected ? `<p class="job-output muted">${expected}</p>` : ''}
      ${row.pause_reason ? `<p class="muted request-text">Пауза: ${safe(row.pause_reason)}</p>` : ''}`) : '';
  const history = panel('История заявки', `<ol class="timeline">${row.history.map(event => `<li><h3>${safe(event.title)}</h3>
    <time class="muted">${dateTime(event.created_at)}</time>${event.note ? `<p class="request-text">${safe(event.note)}</p>` : ''}</li>`).join('')}</ol>`);
  return `<div class="back">${button('К списку', 'back', '', 'text-button')}</div>`
    + heading(row.model, [row.plate, 'Заявка ' + code(row.id), row.order_id ? 'Заказ-наряд ' + code(row.order_id) : null].filter(Boolean).join(' · '), status(row.status))
    + `<div class="detail-grid"><div class="column">${job}${panel('Обращение', `<p class="request-text">${safe(row.description)}</p>${data}
      ${row.intake_note ? `<p class="request-text meta">Приёмка: ${safe(row.intake_note)}</p>` : ''}
      ${row.inspection_note ? `<p class="request-text meta">Контроль качества: ${safe(row.inspection_note)}</p>` : ''}
      ${actions ? `<div class="actions">${actions}</div>` : ''}`)}
      ${estimatePanel(row)}${reportsPanel(row)}</div><div class="column">${paymentPanel(row)}${history}</div></div>`;
}

function render() {
  const { user } = dash;
  const nav = navByRole[user.role];
  const active = current === 'detail' ? backTo : current;
  navigation.innerHTML = nav.map(([key, icon, title]) =>
    `<button type="button" class="nav-button" data-command="nav" data-value="${key}"${active === key ? ' aria-current="page"' : ''}>
      <span aria-hidden="true">${icon}</span>${title}</button>`).join('');
  $('#profile-name').textContent = user.name;
  $('#avatar').textContent = user.name.split(' ').map(part => part[0]).join('').slice(0, 2);
  profileSelect.value = profiles[user.id];
  $('#location-label').textContent = roleLabels[user.role];
  const views = { overview, requests: requestList, stock: stockView, cars: carsView, detail: () => detailsView(detail) };
  content.innerHTML = views[current]();
  content.setAttribute('aria-busy', 'false');
  $('#garage-frame')?.addEventListener('load', sendMapState, { once: true });
}

function field(label, name, type = 'text', value = '', attributes = 'required') {
  return `<label class="field"><span>${safe(label)}</span><input type="${type}" name="${name}" value="${safe(value)}" ${attributes}></label>`;
}

function select(label, name, options, attributes = 'required') {
  return `<label class="field"><span>${safe(label)}</span><select name="${name}" ${attributes}>${options}</select></label>`;
}

function textArea(label, name, required = true, value = '') {
  return `<label class="field"><span>${safe(label)}</span><textarea name="${name}" maxlength="1600" ${required ? 'required' : ''}>${safe(value)}</textarea></label>`;
}

function requestForm(carId) {
  return select('Автомобиль', 'vehicle_id', dash.vehicles.map(car => option(car.id, car.model + ' · ' + car.plate,
    carId || dash.vehicles[0]?.id)).join('') + option('new', 'Добавить автомобиль', dash.vehicles.length ? null : 'new'))
    + `<div id="new-car" class="field-stack"${dash.vehicles.length ? ' hidden' : ''}>
      <div class="fields-row">${field('Марка и модель', 'model', 'text', '', 'maxlength="80"')}
      ${field('Госномер', 'plate', 'text', '', 'maxlength="18"')}</div>${field('VIN (по желанию)', 'vin', 'text', '', 'maxlength="17"')}</div>`
    + textArea('Что нужно проверить или сделать?', 'description')
    + field('Желаемая дата (по желанию)', 'preferred_date', 'date', '', '');
}

function assignForm(row) {
  const usedBays = dash.bays.filter(bay => bay.status && bay.request_id !== row.id);
  const usedMechanics = new Set(usedBays.map(bay => bay.mechanic_id));
  const free = dash.bays.filter(bay => !usedBays.includes(bay));
  const workers = dash.mechanics.filter(mechanic => !usedMechanics.has(mechanic.id));
  return (free.length && workers.length ? '' : '<p class="muted">Для назначения нужен свободный пост и механик.</p>')
    + select('Пост', 'bay_id', option('', 'Выберите пост') + free.map(bay => option(bay.id, 'Пост ' + bay.id + ' · ' + bay.name, row.bay_id)).join(''))
    + select('Механик', 'mechanic_id', option('', 'Выберите механика') + workers.map(person => option(person.id, person.name, row.mechanic_id)).join(''))
    + textArea('Задача и ожидаемый результат', 'instructions', true, row.work_instructions || '');
}

function estimateLine(line = {}) {
  const current = line.part_id ? 'part:' + line.part_id : line.service_id ? 'service:' + line.service_id : 'custom';
  const items = option('custom', 'Своя позиция', current)
    + dash.services.map(item => option('service:' + item.id, item.name, current)).join('')
    + dash.parts.map(item => option('part:' + item.id, item.name + ' · запчасть', current)).join('');
  return `<div class="estimate-row">${select('Строка сметы', 'catalog', items)}
    <div class="custom-item"${current === 'custom' ? '' : ' hidden'}>${field('Название', 'name', 'text', current === 'custom' ? line.name || '' : '',
      current === 'custom' ? 'required maxlength="100"' : 'maxlength="100"')}</div>
    <div class="fields-row">${field('Количество', 'quantity', 'number', line.quantity || 1, 'required min="1" max="100"')}
    ${field('Цена за единицу, ₽', 'price', 'number', line.unit_price ?? '', 'required min="0" max="1000000"')}</div>
    ${button('Удалить позицию', 'remove-line', '', 'text-button')}</div>`;
}

function reportForm(key, row) {
  const partLines = row.estimate.filter(line => line.part_id);
  const approved = new Map();
  for (const line of partLines) approved.set(line.part_id, (approved.get(line.part_id) || 0) + line.quantity);
  const parts = [...approved].map(([id, quantity]) => {
    const part = dash.parts.find(item => item.id === id);
    if (!part) return '';
    const remaining = row.parts_remaining?.[id] ?? quantity;
    return field(`${part.name} · осталось по смете ${remaining}, на складе ${part.stock}`,
      'part_' + id, 'number', 0, `min="0" max="${Math.min(remaining, part.stock)}"`);
  }).join('');
  return textArea(key === 'diagnosisReport' ? 'Что проверили и какую неисправность нашли?' : 'Что выполнено и как проверен результат?', 'result')
    + field('Затрачено минут', 'minutes', 'number', '', 'required min="1" max="20000"')
    + textArea('Рекомендации или замечания', 'recommendations', false)
    + (key === 'repairReport' && parts ? '<h3>Фактический расход запчастей</h3>' + parts : '');
}

function formFor(key, row, value) {
  switch (key) {
    case 'newRequest': return requestForm(value);
    case 'schedule': return field('Время визита', 'appointment', 'datetime-local', row.appointment || '');
    case 'receive': return field('Пробег, км', 'mileage', 'number', row.mileage ?? '', 'required min="0" max="5000000"')
      + select('Приоритет', 'priority', option('normal', 'Обычный') + option('urgent', 'Срочный'))
      + textArea('Состояние при приёмке и комплектность', 'note', false);
    case 'diagnose':
    case 'assign': return assignForm(row);
    case 'estimate': return `<div id="estimate-rows" class="field-stack">${(row.estimate.length ? row.estimate : [{}]).map(estimateLine).join('')}</div>
      ${button('Добавить позицию', 'add-line', '', 'text-button')}
      <p class="split"><strong>Итого</strong><strong id="estimate-total">${money(0)}</strong></p>`
      + field('Ожидаемая готовность', 'eta', 'datetime-local', row.eta || '', '')
      + textArea('Сообщение клиенту', 'note', false);
    case 'approve': return `<p>Подтвердите смету версии ${row.estimate_version} на сумму <strong>${money(row.total)}</strong>.</p>`;
    case 'decline': return textArea('Причина отказа или что нужно изменить', 'note');
    case 'startDiagnosis': return '<p>Зафиксировать начало диагностики на назначенном посту?</p>';
    case 'startRepair': return '<p>Зафиксировать начало работы на назначенном посту?</p>';
    case 'resume': return '<p>Вернуть заказ в работу?</p>';
    case 'diagnosisReport':
    case 'repairReport': return reportForm(key, row);
    case 'pause': return textArea('Причина паузы', 'note');
    case 'release': return '<p>Пост станет доступен для других работ. Чтобы продолжить ремонт, назначьте пост заново.</p>';
    case 'rework': return textArea('Что нужно исправить', 'note');
    case 'ready': return textArea('Итог проверки для сотрудников', 'note') + textArea('Сообщение клиенту', 'public_note', false);
    case 'returnCar': return textArea('Причина возврата и инструкции клиенту', 'note');
    case 'cancel': return textArea('Причина отмены (по желанию)', 'note', false);
    case 'payment': return field('Сумма, ₽', 'amount', 'number', row.total - row.paid, `required min="1" max="${row.total - row.paid}"`)
      + select('Способ оплаты', 'method', Object.entries(paymentLabels).map(([name, label]) => option(name, label)).join(''));
    case 'issue': return '<p>Подтвердите передачу автомобиля клиенту. Заказ перейдёт в историю.</p>';
    case 'restock': return select('Запчасть', 'part_id', dash.parts.map(part => option(part.id, part.name)).join(''))
      + field('Количество', 'quantity', 'number', 1, 'required min="1" max="10000"')
      + textArea('Поставщик или номер накладной', 'note');
  }
}

function estimateTotal() {
  const total = [...document.querySelectorAll('.estimate-row')].reduce((sum, row) =>
    sum + Number(row.querySelector('[name=quantity]').value) * Number(row.querySelector('[name=price]').value), 0);
  $('#estimate-total').textContent = money(total);
}

function showForm(key, value) {
  const title = actionLabels[key];
  if (!title) return;
  activeAction = { key, row: detail };
  $('#dialog-title').textContent = title;
  $('#submit').textContent = key === 'newRequest' ? 'Отправить заявку' : key === 'estimate' ? 'Отправить смету'
    : ['diagnosisReport', 'repairReport'].includes(key) ? 'Отправить отчёт' : 'Подтвердить';
  $('#fields').innerHTML = formFor(key, detail, value);
  $('#form-error').hidden = true;
  dialog.showModal();
  if (key === 'estimate') estimateTotal();
  if (key === 'newRequest') updateVehicleForm();
}

function updateVehicleForm() {
  const isNew = $('#fields [name=vehicle_id]').value === 'new';
  $('#new-car').hidden = !isNew;
  for (const input of $('#new-car').querySelectorAll('input')) {
    input.disabled = !isNew;
    input.required = isNew && input.name !== 'vin';
  }
}

function dataFor(key, row) {
  const data = Object.fromEntries(new FormData($('#form')));
  if (key === 'newRequest' && data.vehicle_id === 'new') delete data.vehicle_id;
  if (['estimate', 'approve', 'decline'].includes(key)) data.version = row.estimate_version;
  if (key === 'estimate') {
    data.lines = [...document.querySelectorAll('.estimate-row')].map(group => {
      const values = Object.fromEntries([...group.querySelectorAll('input,select')].map(input => [input.name, input.value]));
      const [kind, catalog_id] = values.catalog.split(':');
      return { kind, catalog_id, name: values.name, quantity: values.quantity, price: values.price };
    });
  }
  if (key === 'repairReport') {
    data.parts = Object.entries(data).filter(([name, value]) => name.startsWith('part_') && Number(value) > 0)
      .map(([name, quantity]) => ({ id: name.slice(5), quantity }));
  }
  return data;
}

$('#form').addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting) return;
  const { key, row } = activeAction;
  const errorBox = $('#form-error');
  errorBox.hidden = true;
  submitting = true;
  $('#submit').disabled = true;
  try {
    const route = key === 'newRequest' ? 'requests' : key === 'restock' ? 'stock' : `requests/${row.id}/${key}`;
    const result = await api(route, dataFor(key, row));
    dialog.close();
    if (key !== 'restock') {
      if (current !== 'detail') backTo = current;
      detail = result;
      current = 'detail';
    }
    dash = await getDashboard();
    render();
    notify(key === 'newRequest' ? 'Заявка отправлена.' : key === 'estimate' ? 'Смета отправлена клиенту.' : 'Изменения сохранены.');
  } catch (error) {
    if (dialog.open) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      errorBox.scrollIntoView({ block: 'nearest' });
    } else notify(error.message, true);
  } finally {
    submitting = false;
    $('#submit').disabled = false;
  }
});

dialog.addEventListener('cancel', event => {
  if (submitting) event.preventDefault();
});

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-command]');
  if (!target || switching || submitting) return;
  const { command, value } = target.dataset;
  try {
    if (command === 'nav' || command === 'back') {
      current = command === 'back' ? backTo : value;
      detail = null;
      render();
      window.scrollTo(0, 0);
    }
    if (command === 'detail') {
      const row = await api('requests/' + value);
      if (current !== 'detail') backTo = current;
      detail = row;
      current = 'detail';
      render();
      window.scrollTo(0, 0);
    }
    if (command === 'bay') floorSelection(Number(value), true);
    if (command === 'action') showForm(value);
    if (command === 'new-car-request') showForm('newRequest', value);
    if (command === 'close') dialog.close();
    if (command === 'add-line' && $('#estimate-rows').children.length < 20) {
      $('#estimate-rows').insertAdjacentHTML('beforeend', estimateLine());
      $('#estimate-rows').lastElementChild.querySelector('select').focus();
      estimateTotal();
    }
    if (command === 'remove-line' && $('#estimate-rows').children.length > 1) {
      target.closest('.estimate-row').remove();
      estimateTotal();
    }
  } catch (error) {
    notify(error.message, true);
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'search') {
    search = event.target.value;
    $('#results').innerHTML = filteredRows();
  }
  if (dialog.open && activeAction?.key === 'estimate' && ['price', 'quantity'].includes(event.target.name)) estimateTotal();
});

document.addEventListener('change', async event => {
  const input = event.target;
  if (input === profileSelect) {
    try { await chooseProfile(input.value); } catch (error) { notify(error.message, true); if (dash) render(); }
  }
  if (input.id === 'request-filter') {
    filter = input.value;
    $('#results').innerHTML = filteredRows();
  }
  if (input.name === 'vehicle_id') updateVehicleForm();
  if (input.name === 'catalog') {
    const [kind, id] = input.value.split(':');
    const row = input.closest('.estimate-row');
    const custom = row.querySelector('.custom-item');
    const price = row.querySelector('[name=price]');
    custom.hidden = kind !== 'custom';
    custom.querySelector('input').required = kind === 'custom';
    price.value = kind === 'custom' ? '' : (kind === 'part' ? dash.parts : dash.services).find(item => item.id === Number(id)).price;
    estimateTotal();
  }
});

window.addEventListener('message', event => {
  const frame = $('#garage-frame');
  if (frame && event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'bay-selected') {
    floorSelection(event.data.id);
  }
});

setInterval(async () => {
  if (!dash || switching || submitting || dialog.open || document.hidden || document.activeElement?.id === 'search') return;
  const base = dash;
  const previous = detail;
  const view = current;
  try {
    const next = await getDashboard();
    if (base !== dash || previous !== detail || view !== current || switching || submitting || dialog.open) return;
    if (next.user.id !== base.user.id) {
      current = 'overview';
      detail = null;
      selectedBay = 1;
      search = '';
      filter = 'all';
    } else if (current === 'detail') {
      if (!next.requests.some(row => row.id === detail.id)) {
        current = backTo;
        detail = null;
      } else {
        const updated = await api('requests/' + detail.id);
        if (base !== dash || previous !== detail || view !== current || switching || submitting || dialog.open) return;
        detail = updated;
        if (JSON.stringify(previous) === JSON.stringify(updated) && JSON.stringify(base) === JSON.stringify(next)) return;
      }
    } else if (JSON.stringify(base) === JSON.stringify(next)) return;
    dash = next;
    render();
  } catch (error) {
    if (error.status === 401 && !switching && !submitting && !dialog.open) {
      await chooseProfile(profiles[dash.user.id]).catch(() => {});
    }
  }
}, 12000);

async function start() {
  try {
    dash = await getDashboard();
    render();
  } catch (error) {
    if (error.status === 401) {
      try { await chooseProfile('advisor'); return; } catch (sessionError) { error = sessionError; }
    }
    content.setAttribute('aria-busy', 'false');
    notify(error.message || 'Запустите приложение через npm start.', true);
    content.innerHTML = '<p>Не удалось подключиться к мастерской. Проверьте запуск сервера и обновите страницу.</p>';
  }
}

start();
