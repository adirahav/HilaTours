import { httpService, tourClient } from './http.service'
import { useStore } from '../store/store'
import type { Bus } from '../types/bus.types'
import { mapBus, mapAdminBus, type RawBus } from '../lib/tourMapper'

// BusInput (api-contract.tour-service.yaml) takes `name`/`seatLayout`, not
// the frontend's `busName`/`totalSeats` — and has no `driverSide`/
// `doorPosition` at all (those are frontend-only display concepts, never
// persisted). Translate before sending, never forward the frontend shape.
function toBusInput(bus: Partial<Bus>) {
  return {
    name: bus.busName,
    seatLayout: { positions: Array.from({ length: bus.totalSeats ?? 52 }, (_, i) => String(i + 1)) },
    pickupPoints: (bus.pickupPoints ?? []).map((name, order) => ({ name, order }))
  }
}

export const busService = {
  async save(tourId: string, bus: Partial<Bus>): Promise<Bus> {
    const payload = toBusInput(bus)
    const raw = bus.id
      ? await httpService.put<RawBus>(tourClient, `/tour/${tourId}/buses/${bus.id}`, payload)
      : await httpService.post<RawBus>(tourClient, `/tour/${tourId}/buses`, payload)
    return mapBus(raw)
  },

  async remove(tourId: string, busId: string): Promise<void> {
    await httpService.del(tourClient, `/tour/${tourId}/buses/${busId}`)
  },

  // GET /tour(/:tourId) — used to hydrate the store on load — is public and
  // strips passenger PII (SEV-001). Admin screens that need real passenger
  // names/phones/pickup call this authenticated single-bus route instead and
  // merge the full-PII result into the store for that bus.
  async loadWithPii(tourId: string, busId: string): Promise<void> {
    const raw = await httpService.get<RawBus>(tourClient, `/tour/${tourId}/buses/${busId}`)
    const bus = mapAdminBus(raw)
    useStore.getState().applySeatUpdate(busId, bus.seats)
  }
}
