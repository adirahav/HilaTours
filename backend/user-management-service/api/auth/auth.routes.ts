import { Router } from 'express'
import * as auth from './auth.controller'
import { requireAuth } from './auth.middleware'

export const authRouter = Router()

authRouter.post('/signup', auth.signup)
authRouter.post('/login', auth.login)
authRouter.post('/logout', requireAuth, auth.logout)
