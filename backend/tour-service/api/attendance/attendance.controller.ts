import { Response } from "express"
import { AuthedRequest } from "../auth/auth.middleware"
import { emitAttendanceUpdate } from "../lib/socket"
import * as attendanceService from "./attendance.service"

/**
 * Every mutating handler broadcasts the resulting session to the per-bus ADMIN
 * socket room, so a second guide's phone watching the same bus updates live
 * instead of polling. Never to the public room — the payload carries passenger
 * PII (SEV-001); see `emitAttendanceUpdate`.
 */

export async function list(req: AuthedRequest, res: Response) {
  const sessions = await attendanceService.listSessions(req.query.tourId, req.query.busId)
  res.status(200).json(sessions)
}

export async function get(req: AuthedRequest, res: Response) {
  const { session } = await attendanceService.getSession(req.params.sessionId)
  res.status(200).json(session)
}

export async function create(req: AuthedRequest, res: Response) {
  const { session, busUuid } = await attendanceService.createSession(
    req.body ?? {},
    req.adminId ?? null,
  )
  emitAttendanceUpdate(busUuid, session)
  res.status(200).json(session)
}

export async function reset(req: AuthedRequest, res: Response) {
  const { session, busUuid } = await attendanceService.resetSession(req.params.sessionId)
  emitAttendanceUpdate(busUuid, session)
  res.status(200).json(session)
}

export async function remove(req: AuthedRequest, res: Response) {
  const { busUuid, deletedSessionId } = await attendanceService.deleteSession(
    req.params.sessionId,
  )
  emitAttendanceUpdate(busUuid, null, deletedSessionId)
  res.status(204).send()
}

export async function setPresence(req: AuthedRequest, res: Response) {
  const { recordIds, isPresent } = req.body ?? {}
  const { session, busUuid } = await attendanceService.setRecordsPresence(
    req.params.sessionId,
    recordIds,
    isPresent,
  )
  emitAttendanceUpdate(busUuid, session)
  res.status(200).json(session)
}
