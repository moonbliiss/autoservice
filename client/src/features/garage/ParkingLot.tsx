import type { ParkingSpace } from '../../api/types'
import { Panel } from '../../shared/ui'
import './parking.css'

export function ParkingLot({ spaces, visibleRequests, onOpen }: {
  spaces: ParkingSpace[]; visibleRequests: ReadonlySet<number>; onOpen: (id: number) => void
}) {
  if (!spaces.length) return null

  const occupied = spaces.filter(space => space.request_id !== null).length
  return <div className="parking-panel">
    <Panel title="Парковка автосервиса" action={<p className="muted">Занято {occupied} из {spaces.length}</p>}>
      <div className="parking-lot">
        {[spaces.slice(0, 5), spaces.slice(5)].map((row, index) =>
          <div className="parking-row" role="group" aria-label={`Ряд ${index + 1}`} key={index}>
            {row.map(({ id, request_id, model, plate }) => {
              const number = String(id).padStart(2, '0')
              const text = <>
                <strong>{number}</strong>
                <span>{model ?? 'Свободно'}</span>
                {plate && <small>{plate}</small>}
              </>
              const className = request_id === null ? 'parking-space' : 'parking-space occupied'
              return request_id !== null && visibleRequests.has(request_id)
                ? <button type="button" className={className} aria-label={`Место ${id} · ${model} · ${plate}`}
                  onClick={() => onOpen(request_id)} key={id}>{text}</button>
                : <div className={className} key={id}>{text}</div>
            })}
          </div>
        )}
      </div>
    </Panel>
  </div>
}
