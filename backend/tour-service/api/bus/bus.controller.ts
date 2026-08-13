import { Response } from "express"
import { AuthedRequest } from "../auth/auth.middleware"
import * as busService from "./bus.service"

export async function list(req: AuthedRequest, res: Response) {
  const buses = await busService.listBuses(String(req.params.tourId))
  res.status(200).json(buses)
}

export async function get(req: AuthedRequest, res: Response) {
  const bus = await busService.getBusWithSeats(String(req.params.tourId), String(req.params.busId))
  res.status(200).json(bus)
}

export async function create(req: AuthedRequest, res: Response) {
  const bus = await busService.createBus(String(req.params.tourId), req.body)
  res.status(200).json(bus)
}

export async function update(req: AuthedRequest, res: Response) {
  const bus = await busService.updateBus(String(req.params.tourId), String(req.params.busId), req.body)
  res.status(200).json(bus)
}

export async function remove(req: AuthedRequest, res: Response) {
  const bus = await busService.softDeleteBus(String(req.params.tourId), String(req.params.busId))
  res.status(200).json(bus)
}
