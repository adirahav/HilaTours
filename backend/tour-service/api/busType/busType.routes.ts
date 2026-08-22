import { Router } from "express"
import { requirePermission } from "../auth/auth.middleware"
import { asyncHandler } from "../lib/http"
import * as busType from "./busType.controller"

export const busTypeRouter = Router()

// Every /busType route is admin-only (contract: `security: bearerAuth` on all
// of them) — unlike buses, templates have no public read. Reads need
// `busType:view`; each mutation is gated on its own permission key.
busTypeRouter.get("/busType", requirePermission("busType:view"), asyncHandler(busType.list))
busTypeRouter.post("/busType", requirePermission("busType:insert"), asyncHandler(busType.create))
busTypeRouter.get(
  "/busType/:busTypeId",
  requirePermission("busType:view"),
  asyncHandler(busType.get),
)
busTypeRouter.put(
  "/busType/:busTypeId",
  requirePermission("busType:update"),
  asyncHandler(busType.update),
)
busTypeRouter.delete(
  "/busType/:busTypeId",
  requirePermission("busType:delete"),
  asyncHandler(busType.remove),
)
