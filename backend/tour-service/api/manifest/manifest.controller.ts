import { Response } from "express"
import { AuthedRequest } from "../auth/auth.middleware"
import { SeatStatus } from "../models/seat.model"
import * as manifestService from "./manifest.service"

export async function get(req: AuthedRequest, res: Response) {
  const tourId = String(req.params.tourId)
  const busId = String(req.params.busId)
  const manifest = await manifestService.getManifest(tourId, busId, {
    pickupPointName: req.query.pickupPointName as string | undefined,
    status: req.query.status as SeatStatus | undefined,
  })
  res.status(200).json(manifest)
}
