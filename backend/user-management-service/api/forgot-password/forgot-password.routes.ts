import { Router } from 'express'
import { forgotPasswordHandler } from './forgot-password.controller'

export const forgotPasswordRouter = Router()

forgotPasswordRouter.post('/forgot-password', forgotPasswordHandler)
