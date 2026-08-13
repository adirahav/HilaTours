import { Router } from "express"
import { requirePermission } from "../auth/auth.middleware"
import { asyncHandler } from "../lib/http"
import * as bus from "./bus.controller"

export const busRouter = Router()

busRouter.get("/tour/:tourId/buses", asyncHandler(bus.list))
busRouter.post("/tour/:tourId/buses", requirePermission("bus:insert"), asyncHandler(bus.create))
busRouter.get("/tour/:tourId/buses/:busId", requirePermission("bus:view"), asyncHandler(bus.get))
busRouter.put("/tour/:tourId/buses/:busId", requirePermission("bus:update"), asyncHandler(bus.update))
busRouter.delete(
  "/tour/:tourId/buses/:busId",
  requirePermission("bus:delete"),
  asyncHandler(bus.remove),
)
