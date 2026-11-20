import { useLayoutEffect, useRef, type FormEvent } from 'react'
import type { Dashboard, Submission } from '../../api/types'
import { actionLabels } from '../../shared/labels'
import { ActionFields, type FormAction } from './ActionFields'
import './action-dialog.css'

function submissionFor(action: FormAction, form: HTMLFormElement): Submission {
  const fields = new FormData(form)
  if (action.key === 'newRequest' && fields.get('vehicle_id') === 'new') fields.delete('vehicle_id')
  const data: Submission = Object.fromEntries(fields)
  if ((action.key === 'dispatchTransfer' || action.key === 'cancelTransfer') && action.row.transfer) {
    data.transfer_id = action.row.transfer.id
  }
  if (action.key === 'approve' || action.key === 'decline' || action.key === 'recordDecision') {
    data.version = action.documentVersion ?? null
  }
  if (action.key === 'estimate') data.version = action.row.estimate_version
  if (action.key === 'estimate' || action.key === 'addWorkOrder') {
    const skus = fields.getAll('sku')
    const names = fields.getAll('name')
    const quantities = fields.getAll('quantity')
    const prices = fields.getAll('price')
    data.lines = fields.getAll('catalog').map((value, index) => {
      const [kind, catalog_id] = String(value).split(':')
      return { kind, catalog_id, name: String(names[index]), sku: String(skus[index]), quantity: String(quantities[index]), price: String(prices[index]) }
    })
    for (const key of ['catalog', 'name', 'sku', 'quantity', 'price']) delete data[key]
  }
  return data
}

export function ActionDialog({ action, dashboard, busy, error, onClose, onSubmit }: {
  action: FormAction; dashboard: Dashboard; busy: boolean; error: string;
  onClose: () => void; onSubmit: (data: Submission) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const errorBox = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  useLayoutEffect(() => {
    if (error) errorBox.current?.scrollIntoView({ block: 'nearest' })
  }, [error])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!busy) onSubmit(submissionFor(action, event.currentTarget))
  }

  function close() {
    if (!busy) onClose()
  }

  const submitLabel = action.key === 'newRequest' ? (dashboard.user.role === 'advisor' ? 'Оформить заявку' : 'Отправить заявку')
    : action.key === 'estimate' || action.key === 'addWorkOrder' ? 'Отправить на согласование'
    : action.key === 'orderSupply' ? 'Создать заказ поставщику'
    : action.key === 'receiveSupply' ? 'Оприходовать на склад'
    : action.key === 'warehouseIssue' ? 'Выдать механику'
    : action.key === 'diagnosisReport' || action.key === 'repairReport' ? 'Отправить отчёт' : 'Подтвердить'
  return <dialog ref={dialog} id="dialog" aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); close() }}>
    <form id="form" onSubmit={submit}>
      <div className="dialog-head"><h2 id="dialog-title">{actionLabels[action.key]}</h2>
        <button className="close" type="button" onClick={close} disabled={busy} aria-label="Закрыть">×</button></div>
      <div id="fields"><ActionFields dashboard={dashboard} action={action} /></div>
      <p ref={errorBox} className="form-error" role="alert" hidden={!error}>{error}</p>
      <div className="dialog-actions">
        <button className="secondary" type="button" onClick={close} disabled={busy}>Отмена</button>
        <button className="primary" type="submit" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  </dialog>
}
