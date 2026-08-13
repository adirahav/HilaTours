import { httpService, tourClient } from './http.service'
import { useStore } from '../store/store'
import type { Tour } from '../types/tour.types'
import { mapTour, mapTours, type RawTour } from '../lib/tourMapper'

// Paths are relative to VITE_TOUR_API_URL, whose base already ends in /api
// (see api-contract.tour-service.yaml).
//
// GET /tour and GET /tour/:tourId embed `buses[].seats[]` using the PII-safe
// public seat projection. Responses are always run through the mapper so the
// store holds frontend-shaped Tour/Bus/Seat objects (id/seatNumber/row/col)
// rather than raw backend documents (uuid id/position/status). Every id the
// frontend holds or sends back (path params, seatIds) is the backend's public
// uuid — Mongo `_id` is internal to the backend and never crosses the wire.
export const tourService = {
  async query(): Promise<Tour[]> {
    const raw = await httpService.get<RawTour[]>(tourClient, '/tour')
    const tours = mapTours(raw)
    useStore.getState().setTours(tours)
    return tours
  },

  async getById(tourId: string): Promise<Tour> {
    const raw = await httpService.get<RawTour>(tourClient, `/tour/${tourId}`)
    return mapTour(raw)
  },

  async save(tour: Partial<Tour>): Promise<Tour> {
    // TourInput (api-contract.tour-service.yaml) takes `name`, not the
    // frontend's `title` — translate before sending, never forward `title`.
    const payload = {
      name: tour.title,
      date: tour.date,
      description: tour.description
    }
    const raw = tour.id
      ? await httpService.put<RawTour>(tourClient, `/tour/${tour.id}`, payload)
      : await httpService.post<RawTour>(tourClient, '/tour', payload)
    // Create/update responses return the tour document only — they do not
    // embed buses. `upsertTour` replaces the whole entry, so carry the
    // already-loaded buses over rather than blanking the seat map.
    const mapped = mapTour(raw)
    const existing = useStore.getState().tours.find(t => t.id === mapped.id)
    const saved =
      mapped.buses.length === 0 && existing ? { ...mapped, buses: existing.buses } : mapped
    useStore.getState().upsertTour(saved)
    return saved
  },

  async remove(tourId: string): Promise<void> {
    await httpService.del(tourClient, `/tour/${tourId}`)
    useStore.getState().removeTour(tourId)
  }
}
