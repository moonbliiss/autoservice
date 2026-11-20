import { parkingAisle, parkingEntrance, workshopAisle, type SceneLocation } from './mapLayout'

type Position = Pick<SceneLocation, 'x' | 'z'>
export interface VehiclePose extends Position { yaw: number; lift: number }
export interface VehicleMotion {
  path: Position[]
  distances: number[]
  from: SceneLocation
  to: SceneLocation
  starts: number
  ends: number
  travelTime: number
}

const liftTime = 340
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const distance = (a: Position, b: Position) => Math.hypot(b.x - a.x, b.z - a.z)
const between = (a: Position, b: Position, t: number) => ({ x: mix(a.x, b.x, t), z: mix(a.z, b.z, t) })
const ease = (t: number) => t * t * (3 - 2 * t)
const clamp = (t: number) => Math.max(0, Math.min(1, t))
const angle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t

export const restPose = (place: SceneLocation): VehiclePose => ({ ...place, lift: place.kind === 'bay' ? .67 : 0 })

function travelPath(from: SceneLocation, to: SceneLocation) {
  const fromAisle = from.kind === 'bay' ? workshopAisle : parkingAisle
  const toAisle = to.kind === 'bay' ? workshopAisle : parkingAisle
  const waypoints = [from, { x: from.x, z: fromAisle }]
  if (from.kind !== to.kind) waypoints.push(
    { x: parkingEntrance, z: fromAisle }, { x: parkingEntrance, z: toAisle },
  )
  waypoints.push({ x: to.x, z: toAisle }, to)
  const distinct = waypoints.filter((point, index) => index === 0 || distance(waypoints[index - 1], point) > .01)
  const path: Position[] = [from]
  for (let index = 1; index < distinct.length - 1; index++) {
    const [before, corner, after] = distinct.slice(index - 1, index + 2)
    const incoming = distance(corner, before)
    const outgoing = distance(corner, after)
    const turn = Math.min(incoming / 3, outgoing / 3, 1.25)
    const lead = between(corner, before, turn / incoming)
    const trail = between(corner, after, turn / outgoing)
    for (let step = 0; step <= 5; step++) {
      const t = step / 5
      path.push(between(between(lead, corner, t), between(corner, trail, t), t))
    }
  }
  path.push(to)
  return path
}

export function createMotion(from: SceneLocation, to: SceneLocation, starts: number): VehicleMotion {
  const path = travelPath(from, to)
  const distances = [0]
  for (let i = 1; i < path.length; i++) distances.push(distances[i - 1] + distance(path[i - 1], path[i]))
  const travelTime = Math.max(850, Math.min(2500, distances.at(-1)! * 84))
  const ends = starts + travelTime + (from.kind === 'bay' ? liftTime : 0) + (to.kind === 'bay' ? liftTime : 0)
  return { path, distances, from, to, travelTime, starts, ends }
}

function positionAt(motion: VehicleMotion, travelled: number) {
  const { path, distances } = motion
  if (travelled <= 0) return path[0]
  const index = distances.findIndex(value => value >= travelled)
  if (index < 1) return path.at(-1)!
  return between(path[index - 1], path[index], (travelled - distances[index - 1]) / (distances[index] - distances[index - 1]))
}

export function motionPose(motion: VehicleMotion, now: number): VehiclePose {
  const { from, to, starts, travelTime, distances } = motion
  const time = now - starts
  const lowering = from.kind === 'bay' ? liftTime : 0
  if (time < lowering) return { ...restPose(from), lift: restPose(from).lift * (1 - ease(clamp(time / liftTime))) }
  const travelling = time - lowering
  if (travelling >= travelTime) return { ...restPose(to), lift: restPose(to).lift * ease(clamp((travelling - travelTime) / liftTime)) }

  const length = distances.at(-1)!
  const travelled = length * ease(clamp(travelling / travelTime))
  const ahead = positionAt(motion, travelled + .32)
  const behind = positionAt(motion, travelled - .32)
  const heading = Math.atan2(ahead.x - behind.x, ahead.z - behind.z)
  const position = positionAt(motion, travelled)
  const fromTurn = (from.kind === 'bay' ? workshopAisle : Math.abs(from.z - parkingAisle)) + .85
  const toTurn = (to.kind === 'bay' ? workshopAisle : Math.abs(to.z - parkingAisle)) + .85
  let yaw = heading
  if (from.kind === 'parking') yaw = angle(from.yaw, yaw, ease(clamp((travelled - fromTurn + 1.65) / 1.65)))
  if (to.kind === 'bay') yaw = angle(to.yaw, yaw, ease(clamp((length - travelled - toTurn + 1.65) / 1.65)))
  if (to.kind === 'parking') yaw = angle(to.yaw, yaw, ease(clamp((length - travelled) / 1.55)))
  return { ...position, lift: 0, yaw }
}
