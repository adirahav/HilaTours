import { Response } from "express"
import { AuthedRequest } from "../auth/auth.middleware"
import * as tourService from "./tour.service"

export async function list(_req: AuthedRequest, res: Response) {
  const tours = await tourService.listTours()
  res.status(200).json(tours)
}

export async function get(req: AuthedRequest, res: Response) {
  const tour = await tourService.getTour(String(req.params.tourId))
  res.status(200).json(tour)
}

export async function create(req: AuthedRequest, res: Response) {
  const tour = await tourService.createTour(req.body, req.adminId as string)
  res.status(200).json(tour)
}

export async function update(req: AuthedRequest, res: Response) {
  const tour = await tourService.updateTour(String(req.params.tourId), req.body)
  res.status(200).json(tour)
}

export async function remove(req: AuthedRequest, res: Response) {
  const tour = await tourService.softDeleteTour(String(req.params.tourId))
  res.status(200).json(tour)
}

// Backend-only — no frontend route/button calls this today.
export async function recover(req: AuthedRequest, res: Response) {
  const tour = await tourService.recoverTour(String(req.params.tourId))
  res.status(200).json(tour)
}
