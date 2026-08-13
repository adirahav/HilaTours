import { Router } from 'express'
import { requireAuth } from '../auth/auth.middleware'
import { listRoles, listPermissions } from './roles-permissions.controller'

// Both routes are behind `requireAuth` per the API contract (`security: [bearerAuth]`).
export const rolesPermissionsRouter = Router()

rolesPermissionsRouter.get('/role', requireAuth, listRoles)
rolesPermissionsRouter.get('/permission', requireAuth, listPermissions)
