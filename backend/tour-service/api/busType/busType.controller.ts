import { Response } from "express"
import { AuthedRequest } from "../auth/auth.middleware"
import * as busTypeService from "./busType.service"

export async function list(_req: AuthedRequest, res: Response) {
  const busTypes = await busTypeService.listBusTypes()
  res.status(200).json(busTypes)
}

export async function get(req: AuthedRequest, res: Response) {
  const busType = await busTypeService.getBusType(String(req.params.busTypeId))
  res.status(200).json(busType)
}

export async function create(req: AuthedRequest, res: Response) {
  const busType = await busTypeService.createBusType(req.body)
  res.status(200).json(busType)
}

export async function update(req: AuthedRequest, res: Response) {
  const busType = await busTypeService.updateBusType(String(req.params.busTypeId), req.body)
  res.status(200).json(busType)
}

export async function remove(req: AuthedRequest, res: Response) {
  const busType = await busTypeService.softDeleteBusType(String(req.params.busTypeId))
  res.status(200).json(busType)
}
