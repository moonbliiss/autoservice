import type { ReactNode } from 'react'

export function Button({ children, onClick, variant = 'secondary' }: {
  children: ReactNode; onClick: () => void; variant?: string
}) {
  return <button type="button" className={variant} onClick={onClick}>{children}</button>
}

export function Heading({ title, subtitle, action, eyebrow }: {
  title: string; subtitle?: string; action?: ReactNode; eyebrow?: string
}) {
  return <div className="title-row"><div>
    {eyebrow && <p className="overline">{eyebrow}</p>}
    <h1>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}
  </div>{action}</div>
}

export function Metrics({ items }: { items: [string, string | number][] }) {
  return <div className="metrics">{items.map(([label, value]) =>
    <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>
  )}</div>
}

export function Panel({ title, children, inset = false, action }: {
  title: string; children: ReactNode; inset?: boolean; action?: ReactNode
}) {
  return <section className={inset ? 'panel inset' : 'panel'}>
    {inset ? <h2>{title}</h2> : <div className="panel-head"><h2>{title}</h2>{action}</div>}
    {children}
  </section>
}

export function Table({ headings, rows, empty = 'Здесь пока ничего нет.' }: {
  headings: string[]; rows: { key: string | number; cells: ReactNode[]; onClick?: () => void }[]; empty?: string
}) {
  if (!rows.length) return <p className="empty">{empty}</p>
  return <div className="table-wrap"><table>
    <thead><tr>{headings.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{rows.map(({ key, cells, onClick }) => <tr key={key} className={onClick ? 'clickable-row' : undefined}
      onClick={onClick && (event => {
        if (event.target instanceof Element && !event.target.closest('a, button')) onClick()
      })}>{cells.map((cell, index) => <td key={headings[index]}>{cell}</td>)}</tr>)}</tbody>
  </table></div>
}
