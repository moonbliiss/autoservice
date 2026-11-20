const currency = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
export const money = (amount: number) => currency.format(amount) + ' ₽'
export const number = (value: number) => value.toLocaleString('ru-RU')
export const code = (id: number) => '#' + String(id).padStart(4, '0')
export const dateOnly = (value: string | null) => value ? new Date(value + 'T12:00:00').toLocaleDateString('ru-RU') : ''
export function dateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
