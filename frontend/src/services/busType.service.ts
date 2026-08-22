import { httpService, tourClient } from './http.service'
import { useStore } from '../store/store'
import type { BusType, BusTypeInput } from '../types/busType.types'
import { calculateTotalSeatsFromLayout } from '../lib/busTypeLayout'

// Paths are relative to VITE_TOUR_API_URL, whose base already ends in /api
// (see api-contract.tour-service.yaml, `/busType` paths). Every /busType route
// is admin-only; the JWT is attached centrally by http.service.
//
// Like the other domain services, this one writes the store itself — callers
// must not re-apply the result.

export interface RawBusType {
  id?: string
  _id?: string
  name?: string
  description?: string | null
  totalSeats?: number
  standardRowsCount?: number
  doorRow?: number | null
  backRowSeatsCount?: number
  disabledSeatSlots?: string[]
  isDefault?: boolean
  createdAt?: string
}

export function mapBusType(raw: RawBusType): BusType {
  const standardRowsCount = raw.standardRowsCount ?? 0
  const backRowSeatsCount = raw.backRowSeatsCount ?? 0
  const doorRow = raw.doorRow ?? null
  const disabledSeatSlots = raw.disabledSeatSlots ?? []

  return {
    id: raw.id ?? raw._id ?? '',
    name: raw.name ?? '',
    description: raw.description ?? '',
    // `totalSeats` is server-derived; fall back to the same formula rather than
    // to 0 so the UI never renders a template as empty on a partial response.
    totalSeats:
      raw.totalSeats ??
      calculateTotalSeatsFromLayout(
        standardRowsCount,
        backRowSeatsCount,
        disabledSeatSlots,
        doorRow
      ),
    standardRowsCount,
    doorRow,
    backRowSeatsCount,
    disabledSeatSlots,
    isDefault: raw.isDefault ?? false,
    createdAt: raw.createdAt ?? ''
  }
}

// `totalSeats` is deliberately never sent — the server recomputes it from the
// layout fields and never trusts a client-supplied count (see BusType schema).
function toBusTypePayload(input: BusTypeInput) {
  return {
    name: input.name,
    description: input.description ?? '',
    standardRowsCount: input.standardRowsCount,
    doorRow: input.doorRow,
    backRowSeatsCount: input.backRowSeatsCount,
    disabledSeatSlots: input.disabledSeatSlots,
    isDefault: input.isDefault ?? false
  }
}

export const busTypeService = {
  async query(): Promise<BusType[]> {
    const raw = await httpService.get<RawBusType[]>(tourClient, '/busType')
    const busTypes = (raw ?? []).map(mapBusType)
    useStore.getState().setBusTypes(busTypes)
    return busTypes
  },

  async create(input: BusTypeInput): Promise<BusType> {
    const raw = await httpService.post<RawBusType>(tourClient, '/busType', toBusTypePayload(input))
    const busType = mapBusType(raw)
    useStore.getState().upsertBusType(busType)
    return busType
  },

  async update(busTypeId: string, input: BusTypeInput): Promise<BusType> {
    const raw = await httpService.put<RawBusType>(
      tourClient,
      `/busType/${busTypeId}`,
      toBusTypePayload(input)
    )
    const busType = mapBusType(raw)
    useStore.getState().upsertBusType(busType)
    return busType
  },

  /**
   * Duplicate is a plain create from a copy of the source template's layout —
   * the contract exposes no dedicated duplicate endpoint, and a copy carries no
   * live reference back to its source, so POST /busType is equivalent and the
   * duplicate is persisted immediately (visible to other admins).
   */
  async duplicate(busType: BusType): Promise<BusType> {
    return busTypeService.create({
      name: `${busType.name} (עותק)`,
      description: busType.description,
      standardRowsCount: busType.standardRowsCount,
      doorRow: busType.doorRow,
      backRowSeatsCount: busType.backRowSeatsCount,
      disabledSeatSlots: [...busType.disabledSeatSlots],
      isDefault: false
    })
  },

  async remove(busTypeId: string): Promise<void> {
    // Soft-delete server-side (`deletedAt`); existing buses instantiated from
    // this template are unaffected, since conversion is a one-time copy.
    await httpService.del(tourClient, `/busType/${busTypeId}`)
    useStore.getState().removeBusType(busTypeId)
  }
}
