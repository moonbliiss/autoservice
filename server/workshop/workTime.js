export function createWorkTime({ run, get, all }, now) {
  function restoreRunning() {
    run(`INSERT INTO work_periods(order_id,mechanic_id,kind,started_at)
      SELECT o.id,o.mechanic_id,CASE WHEN o.status='diagnosing' THEN 'diagnosis' ELSE 'repair' END,
        MIN(?,COALESCE((SELECT unixepoch(h.created_at)*1000 FROM history h
          WHERE h.request_id=o.request_id AND h.account_id=o.mechanic_id
          AND ((o.status='diagnosing' AND h.title='Диагностика начата')
            OR (o.status='repairing' AND h.title IN ('Ремонт начат','Ремонт возобновлён')))
          ORDER BY h.id DESC LIMIT 1),?))
      FROM orders o WHERE o.mechanic_id IS NOT NULL AND o.bay_id IS NOT NULL
        AND o.status IN ('diagnosing','repairing')
        AND NOT EXISTS (SELECT 1 FROM work_periods w WHERE w.order_id=o.id AND w.stopped_at IS NULL)`,
    now(), now());
  }

  function start(row, user, kind) {
    run('INSERT INTO work_periods(order_id,mechanic_id,kind,started_at) VALUES (?,?,?,?)',
      row.order_id, user.id, kind, now());
  }

  function stop(orderId) {
    run('UPDATE work_periods SET stopped_at=MAX(started_at,?) WHERE order_id=? AND stopped_at IS NULL', now(), orderId);
  }

  function current(orderId, mechanicId, kind) {
    const result = get(`SELECT COALESCE(SUM(stopped_at-started_at),0) AS elapsed_ms,
      MAX(CASE WHEN stopped_at IS NULL THEN started_at END) AS started_at
      FROM work_periods WHERE order_id=? AND mechanic_id=? AND kind=? AND report_id IS NULL`, orderId, mechanicId, kind);
    return { ...result, kind };
  }

  function report(row, user, kind, result, recommendations) {
    stop(row.order_id);
    const { elapsed_ms } = current(row.order_id, user.id, kind);
    const report = run('INSERT INTO work_reports(order_id,mechanic_id,kind,result,recommendations,minutes) VALUES (?,?,?,?,?,?)',
      row.order_id, user.id, kind, result, recommendations, Math.max(1, Math.ceil(elapsed_ms / 60_000)));
    run('UPDATE work_periods SET report_id=? WHERE order_id=? AND mechanic_id=? AND kind=? AND report_id IS NULL',
      report.lastInsertRowid, row.order_id, user.id, kind);
  }

  function totals(orderId) {
    return all(`SELECT a.id,a.name,SUM(t.elapsed) AS elapsed_ms FROM (
      SELECT mechanic_id,stopped_at-started_at AS elapsed FROM work_periods WHERE order_id=? AND stopped_at IS NOT NULL
      UNION ALL
      SELECT w.mechanic_id,w.minutes*60000 FROM work_reports w WHERE w.order_id=?
        AND NOT EXISTS(SELECT 1 FROM work_periods p WHERE p.report_id=w.id)
    ) t JOIN accounts a ON a.id=t.mechanic_id GROUP BY a.id,a.name ORDER BY a.name`, orderId, orderId);
  }

  return { restoreRunning, start, stop, current, report, totals };
}
