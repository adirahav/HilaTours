import { Router } from "express"
import { requirePermission } from "../auth/auth.middleware"
import { asyncHandler } from "../lib/http"
import * as tour from "./tour.controller"

export const tourRouter = Router()

tourRouter.get("/tour", asyncHandler(tour.list))
tourRouter.post("/tour", requirePermission("tour:insert"), asyncHandler(tour.create))
tourRouter.get("/tour/:tourId", asyncHandler(tour.get))
tourRouter.put("/tour/:tourId", requirePermission("tour:update"), asyncHandler(tour.update))
tourRouter.delete("/tour/:tourId", requirePermission("tour:delete"), asyncHandler(tour.remove))
// Backend-only — no frontend button/route calls this; ops-only recovery.
tourRouter.post("/tour/:tourId/recover", requirePermission("tour:delete"), asyncHandler(tour.recover))
