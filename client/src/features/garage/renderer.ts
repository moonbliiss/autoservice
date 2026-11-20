import type { Bay, ParkingSpace } from '../../api/types'
import { carModels, fixtures, flat, ground, lifts, type Face, type Point } from './geometry'
import {
  bayLocations, locationKey, parkingDepth, parkingWidth, sceneLocations, siteBounds,
  type MapLocation, type SceneLocation,
} from './mapLayout'
import { createMotion, motionPose, restPose, type VehicleMotion, type VehiclePose } from './vehicleMotion'

interface Camera { scale: number; x: number; y: number }
interface VehicleBounds { place: SceneLocation; left: number; right: number; top: number; bottom: number; depth: number }
export interface MarkerPosition { place: SceneLocation; x: number; y: number; hidden: boolean }

const cs = Math.cos(.34), sn = Math.sin(.34)
const ce = Math.cos(.71), se = Math.sin(.71)
const selectedPaint = '#f2ce77'
const spacePaint = '#dce2d3'

function project([x, y, z]: Point, cam: Camera): Point {
  const depth = x * sn + z * cs
  return [cam.x + (x * cs - z * sn) * cam.scale, cam.y + (depth * se - y * ce) * cam.scale, depth * ce + y * se]
}

const projectedBounds = [siteBounds.left, siteBounds.right].flatMap(x =>
  [0, 3.5].flatMap(y => [siteBounds.back, siteBounds.front].map(z => project([x, y, z], { x: 0, y: 0, scale: 1 }))),
)
const left = Math.min(...projectedBounds.map(point => point[0]))
const right = Math.max(...projectedBounds.map(point => point[0]))
const top = Math.min(...projectedBounds.map(point => point[1]))
const bottom = Math.max(...projectedBounds.map(point => point[1]))

export function mountGarage(
  canvas: HTMLCanvasElement, stage: HTMLElement, onMarkers: (positions: MarkerPosition[]) => void,
) {
  const context = canvas.getContext('2d')
  if (!context) return null
  const ctx = context
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let zoom = 1
  let frame = 0
  let viewport = { width: 0, height: 0 }
  let markersChanged = true
  let selectedKey: string | undefined
  let destinations = new Set<string>()
  let vehicles = new Map<number, SceneLocation>()
  let hitVehicles: VehicleBounds[] = []
  const motions = new Map<number, VehicleMotion[]>()

  function camera(): Camera {
    const { width, height } = viewport
    const scale = Math.min((width - Math.min(46, width * .09)) / (right - left), (height - 58) / (bottom - top)) * zoom
    return { scale, x: width * .5 - (left + right) * scale / 2, y: height * .52 - (top + bottom) * scale / 2 }
  }

  function transform([x, y, z]: Point, pose: VehiclePose): Point {
    const sine = Math.sin(pose.yaw)
    const cosine = Math.cos(pose.yaw)
    return [pose.x + x * cosine + z * sine, y + pose.lift, pose.z - x * sine + z * cosine]
  }

  function drawFace(face: Face, cam: Camera, pose?: VehiclePose) {
    ctx.beginPath()
    face.points.forEach((point, index) => {
      const [x, y] = project(pose ? transform(point, pose) : point, cam)
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = face.color
    ctx.fill()
    ctx.strokeStyle = face.stroke || face.color
    ctx.lineWidth = face.stroke ? Math.max(1, cam.scale / 28) : .45
    ctx.stroke()
  }

  function drawShadow(cam: Camera, pose: VehiclePose) {
    const [x, y] = project([pose.x, 0, pose.z], cam)
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1.85 * cam.scale, 2.2 * cam.scale * se)
    const gradient = ctx.createRadialGradient(0, 0, .18, 0, 0, 1)
    gradient.addColorStop(0, 'rgba(29,37,30,.38)')
    gradient.addColorStop(1, 'rgba(29,37,30,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(-1, -1, 2, 2)
    ctx.restore()
  }

  function drawMarkings(cam: Camera) {
    const markings: Face[] = []
    for (const place of sceneLocations) {
      const key = locationKey(place)
      const active = key === selectedKey
      const target = destinations.has(key)
      const bay = place.kind === 'bay'
      const x = place.x - (bay ? 2.55 : parkingWidth / 2)
      const z = bay ? -3.53 : place.z - parkingDepth / 2
      const w = bay ? 5.1 : parkingWidth
      const d = bay ? 7.72 : parkingDepth
      const paint = active ? selectedPaint : target ? '#a8e0bd' : spacePaint
      if (active || target) flat(markings, x, .015, z, w, d, active ? '#a6a087' : '#778f7f')
      flat(markings, x, .02, z, .075, d, paint)
      flat(markings, x + w - .075, .02, z, .075, d, paint)
      flat(markings, x, .02, z, w, .075, paint)
      flat(markings, x, .02, z + d - .075, w, .075, paint)
    }
    markings.forEach(face => drawFace(face, cam))
  }

  function drawRoute(cam: Camera, motion: VehicleMotion) {
    ctx.save()
    ctx.beginPath()
    motion.path.forEach(({ x, z }, index) => {
      const [px, py] = project([x, .03, z], cam)
      if (index === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.strokeStyle = '#e9bd61'
    ctx.lineWidth = Math.max(2, cam.scale * .14)
    ctx.setLineDash([6, 5])
    ctx.stroke()
    ctx.restore()
  }

  function activeMotion(id: number, now: number) {
    const queue = motions.get(id)
    if (!queue) return undefined
    while (queue[0] && now >= queue[0].ends) queue.shift()
    if (!queue.length) motions.delete(id)
    return queue[0]
  }

  function draw(now: number) {
    frame = 0
    const cam = camera()
    ctx.clearRect(0, 0, viewport.width, viewport.height)
    ground.forEach(face => drawFace(face, cam))
    drawMarkings(cam)
    const visible: { face: Face; pose?: VehiclePose; depth: number }[] = []
    const heights = new Map<number, number>()
    hitVehicles = []
    const add = (faces: Face[], pose?: VehiclePose) => {
      for (const face of faces) {
        const [x, y, z] = pose ? transform(face.center, pose) : face.center
        visible.push({ face, pose, depth: (x * sn + z * cs) * ce + y * se })
      }
    }
    add(fixtures)
    for (const [id, place] of vehicles) {
      const motion = activeMotion(id, now)
      if (motion) drawRoute(cam, motion)
      const pose = motion ? motionPose(motion, now) : restPose(place)
      const bay = bayLocations.find(post => Math.abs(post.x - pose.x) < .01 && Math.abs(post.z - pose.z) < .01)
      if (bay) heights.set(bay.id, pose.lift)
      drawShadow(cam, pose)
      add(carModels[id % carModels.length], pose)
      const projected = [-1.12, 1.12].flatMap(x => [0, 1.48].flatMap(y => [-2.14, 2.14].map(z =>
        project(transform([x, y, z], pose), cam),
      )))
      hitVehicles.push({
        place, left: Math.min(...projected.map(point => point[0])), right: Math.max(...projected.map(point => point[0])),
        top: Math.min(...projected.map(point => point[1])), bottom: Math.max(...projected.map(point => point[1])),
        depth: project([pose.x, 0, pose.z], cam)[2],
      })
    }
    for (const bay of bayLocations) add(lifts[bay.id - 1], { x: 0, z: 0, yaw: 0, lift: heights.get(bay.id) ?? 0 })
    visible.sort((a, b) => a.depth - b.depth)
    for (const { face, pose } of visible) drawFace(face, cam, pose)
    if (markersChanged) {
      markersChanged = false
      onMarkers(sceneLocations.map(place => {
        const z = place.kind === 'bay' ? 4.4 : place.z + (place.id <= 5 ? -2 : 2.3)
        const [x, y] = project([place.x, .02, z], cam)
        return { place, x, y, hidden: x < 12 || y < 22 || x > viewport.width - 12 || y > viewport.height - 4 }
      }))
    }
    if (motions.size) scheduleDraw()
  }

  function scheduleDraw() {
    if (!frame && viewport.width > 46 && viewport.height > 58) frame = requestAnimationFrame(draw)
  }

  function resize() {
    const { width, height } = stage.getBoundingClientRect()
    const ratio = Math.min(devicePixelRatio || 1, 2)
    viewport = { width, height }
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    markersChanged = true
    scheduleDraw()
  }

  const observer = new ResizeObserver(resize)
  observer.observe(stage)

  return {
    zoomBy(factor: number) {
      zoom = Math.max(.85, Math.min(1.45, zoom * factor))
      markersChanged = true
      scheduleDraw()
    },
    reset() {
      zoom = 1
      markersChanged = true
      scheduleDraw()
    },
    pick(px: number, py: number) {
      const car = hitVehicles.filter(hit => px >= hit.left && px <= hit.right && py >= hit.top && py <= hit.bottom)
        .sort((a, b) => b.depth - a.depth)[0]
      if (car) return car.place
      const cam = camera()
      const across = (px - cam.x) / cam.scale
      const depth = (py - cam.y) / (cam.scale * se)
      const x = across * cs + depth * sn
      const z = depth * cs - across * sn
      return sceneLocations.find(place => place.kind === 'bay'
        ? Math.abs(x - place.x) <= 2.55 && z >= -3.53 && z <= 4.19
        : Math.abs(x - place.x) <= parkingWidth / 2 && Math.abs(z - place.z) <= parkingDepth / 2)
    },
    update(bays: readonly Bay[], parking: readonly ParkingSpace[], selected: MapLocation | null, targets: string[]) {
      const next = new Map<number, SceneLocation>()
      for (const place of sceneLocations) {
        const entries = place.kind === 'bay' ? bays : parking
        const id = entries.find(entry => entry.id === place.id)?.request_id
        if (id != null) next.set(id, place)
      }
      const now = performance.now()
      if (reduceMotion.matches) motions.clear()
      else {
        for (const [id, place] of next) {
          const from = vehicles.get(id)
          if (!from || from === place) continue
          const queue = motions.get(id) ?? []
          const starts = Math.max(queue.at(-1)?.ends ?? now, now)
          queue.push(createMotion(from, place, starts))
          motions.set(id, queue)
        }
        for (const id of motions.keys()) if (!next.has(id)) motions.delete(id)
      }
      vehicles = next
      selectedKey = selected ? locationKey(selected) : undefined
      destinations = new Set(targets)
      scheduleDraw()
    },
    destroy() {
      observer.disconnect()
      cancelAnimationFrame(frame)
    },
  }
}
