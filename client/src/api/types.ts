export type Role = 'advisor' | 'mechanic' | 'client' | 'stockkeeper' | 'manager'
export type Profile = Role | 'mechanic2' | 'client2'
export type Status =
  | 'new' | 'scheduled' | 'cancelled' | 'received'
  | 'diagnosis_assigned' | 'diagnosing' | 'awaiting_estimate' | 'awaiting_approval'
  | 'declined' | 'approved' | 'repair_assigned' | 'repairing' | 'paused'
  | 'waiting_parts' | 'inspection' | 'ready' | 'issued'
export type RequestAction =
  | 'schedule' | 'cancel' | 'receive' | 'diagnose' | 'startDiagnosis' | 'diagnosisReport'
  | 'estimate' | 'approve' | 'decline' | 'assign' | 'startRepair' | 'pause' | 'resume'
  | 'repairReport' | 'ready' | 'rework' | 'release' | 'returnCar' | 'payment' | 'issue'
  | 'recordDecision' | 'moveBay' | 'park'
export type PaymentMethod = 'cash' | 'card' | 'transfer'
export type RoutingAction = Extract<RequestAction, 'park' | 'moveBay' | 'assign' | 'diagnose'>

export interface RequestSummary {
  id: number
  model: string
  plate: string
  status: Status
  priority: 'normal' | 'urgent'
  appointment: string | null
  eta: string | null
  bay_id?: number | null
  parking_space: number | null
  assigned_to_me?: boolean
  client_name?: string
  routing_actions?: RoutingAction[]
}

export interface EstimateLine {
  id?: number
  part_id: number | null
  service_id?: number | null
  name: string
  quantity: number
  unit_price?: number
}

export interface RequestDetail extends RequestSummary {
  order_id?: number | null
  bay_name?: string | null
  mechanic_id?: number | null
  mechanic_name?: string | null
  client_phone?: string | null
  vin?: string | null
  mileage: number | null
  description: string | null
  preferred_date: string | null
  work_instructions?: string | null
  intake_note?: string | null
  inspection_note?: string | null
  pause_reason?: string | null
  resume_blocked?: boolean
  parking_reason: string | null
  parts_expected_date: string | null
  tracking_token?: string
  visit_note: string | null
  estimate_version: number | null
  estimate: EstimateLine[]
  actions: RequestAction[]
  history: { title: string; note: string | null; created_at: string }[]
  reports: { id: number; kind: 'diagnosis' | 'repair'; mechanic: string; minutes: number; created_at: string;
    result: string; recommendations: string | null; parts: string | null }[]
  parts_remaining?: Record<number, number>
  stock_usage?: { part_id: number; name: string; quantity: number }[]
  total?: number
  paid?: number
  payments?: { id: number; method: PaymentMethod; created_at: string; amount: number }[]
}

export interface Bay {
  id: number
  name: string
  number: number
  status: Status | null
  request_id: number | null
  mechanic_id: number | null
  model: string | null
  mechanic: string | null
  occupied: boolean
}

export interface ParkingSpace {
  id: number
  request_id: number | null
  model: string | null
  plate: string | null
  expected_date: string | null
  occupied: boolean
}

export type RequestTracking = Pick<RequestDetail,
  'id' | 'model' | 'status' | 'appointment' | 'eta' | 'parking_space' | 'parking_reason' | 'parts_expected_date' | 'visit_note'>

interface NamedItem { id: number; name: string }
interface CatalogItem extends NamedItem { price: number }
export interface Part extends NamedItem { stock: number; price?: number; sku?: string }

export interface PartSupply {
  id: number
  part_id: number
  request_id: number | null
  name: string
  sku: string
  supplier?: string
  quantity: number
  received: number
  expected_date: string | null
  created_at: string
}

export interface WarehouseNeed {
  request_id: number
  bay_id: number | null
  mechanic: string | null
  status: Status
  model: string
  plate: string
  part_id: number
  name: string
  sku: string
  stock: number
  required: number
  issued: number
  incoming: number
  can_issue: boolean
}

export interface Dashboard {
  user: { id: number; role: Role; name: string }
  requests: RequestSummary[]
  vehicles?: { id: number; client_id?: number; model: string; plate: string; mileage: number | null }[]
  clients?: (NamedItem & { phone: string | null })[]
  bays?: Bay[]
  parking?: ParkingSpace[]
  parts?: Part[]
  mechanics?: NamedItem[]
  services?: CatalogItem[]
  supplies?: PartSupply[]
  warehouse_needs?: WarehouseNeed[]
  staff?: (NamedItem & { role: Role })[]
  movements?: { id: number; quantity: number; note: string | null; created_at: string; name: string; employee: string;
    supply_id: number | null; request_id: number | null }[]
}

export interface Submission {
  version?: number | null
  lines?: { kind: string; catalog_id?: string; name: string; quantity: string; price: string }[]
  parts?: { id: string; quantity: FormDataEntryValue }[]
  [field: string]: unknown
}
