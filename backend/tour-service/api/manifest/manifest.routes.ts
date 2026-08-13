import { Router } from "express"
import { requirePermission } from "../auth/auth.middleware"
import { asyncHandler } from "../lib/http"
import * as manifest from "./manifest.controller"

export const manifestRouter = Router()

manifestRouter.get(
  "/tour/:tourId/buses/:busId/manifest",
  requirePermission("seat:view"),
  asyncHandler(manifest.get),
)
