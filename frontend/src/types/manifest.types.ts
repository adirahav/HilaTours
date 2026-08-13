export interface ManifestPassenger {
  seatNumber: number
  passengerName: string
  passengerPhone: string
  notes?: string
}

export interface ManifestPickupGroup {
  pickupPoint: string
  passengers: ManifestPassenger[]
}

export interface Manifest {
  tourId: string
  busId: string
  busName: string
  generatedAt: string
  groups: ManifestPickupGroup[]
}
