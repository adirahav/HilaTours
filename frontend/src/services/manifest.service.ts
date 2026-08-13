import { httpService, tourClient } from './http.service'
import type { Manifest } from '../types/manifest.types'

export const manifestService = {
  async getManifest(tourId: string, busId: string): Promise<Manifest> {
    return httpService.get<Manifest>(tourClient, `/tour/${tourId}/buses/${busId}/manifest`)
  }
}
