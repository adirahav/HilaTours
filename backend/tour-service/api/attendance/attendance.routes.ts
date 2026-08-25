import { Router } from "express"
import { requirePermission } from "../auth/auth.middleware"
import { asyncHandler } from "../lib/http"
import * as attendance from "./attendance.controller"

export const attendanceRouter = Router()

// Every /attendance route is admin/guide-only — the responses carry passenger
// PII, so there is deliberately no public read (unlike buses). Reads need
// `attendance:view`; every mutation needs `attendance:manage`.
//
// Note there is NO server-side date gate: the "only on the tour's own day" rule
// is UI tab-visibility only (plan 038, Open Question 2). A guide may legitimately
// review last night's session after midnight, and the date is not a trust
// boundary — the permission check is.
attendanceRouter.get(
  "/attendance/session",
  requirePermission("attendance:view"),
  asyncHandler(attendance.list),
)
attendanceRouter.post(
  "/attendance/session",
  requirePermission("attendance:manage"),
  asyncHandler(attendance.create),
)
attendanceRouter.get(
  "/attendance/session/:sessionId",
  requirePermission("attendance:view"),
  asyncHandler(attendance.get),
)
attendanceRouter.delete(
  "/attendance/session/:sessionId",
  requirePermission("attendance:manage"),
  asyncHandler(attendance.remove),
)
attendanceRouter.post(
  "/attendance/session/:sessionId/reset",
  requirePermission("attendance:manage"),
  asyncHandler(attendance.reset),
)
attendanceRouter.post(
  "/attendance/session/:sessionId/presence",
  requirePermission("attendance:manage"),
  asyncHandler(attendance.setPresence),
)
