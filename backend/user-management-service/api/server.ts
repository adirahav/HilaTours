import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { connectDb } from './lib/db'
import { authRouter } from './auth/auth.routes'
import { forgotPasswordRouter } from './forgot-password/forgot-password.routes'
import { rolesPermissionsRouter } from './roles-permissions/roles-permissions.routes'

dotenv.config({ path: '.env.development' })

export const app = express()

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
app.use(cors({ origin: frontendUrl, credentials: true }))

// Chrome's Private Network Access check: browsers running in a "public"
// context (e.g. the Capacitor webview) send this header on preflight
// requests to localhost and require it echoed back, or the actual request
// fails client-side with net::ERR_FAILED despite a 200 response — the
// `cors` package above doesn't set it.
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
  next()
})

app.use(express.json())

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'user-management-service' })
})

// Routes.
// The API contract exposes this service behind a gateway prefix
// (server URL: http://localhost:3032/user-management-service/api), so mount
// the auth routers under that gateway-prefixed base path.
// The bare '/api/auth' mount is retained for direct/back-compat access.
const GATEWAY_BASE = '/user-management-service/api'
const GATEWAY_PREFIX = `${GATEWAY_BASE}/auth`
app.use(GATEWAY_PREFIX, authRouter)
app.use(GATEWAY_PREFIX, forgotPasswordRouter)
app.use('/api/auth', authRouter)
app.use('/api/auth', forgotPasswordRouter)

// Roles & permissions lookups sit at the api base (not under /auth), per the
// contract paths `/role` and `/permission`.
app.use(GATEWAY_BASE, rolesPermissionsRouter)
app.use('/api', rolesPermissionsRouter)

const port = Number(process.env.PORT || 3032)

async function start() {
  try {
    await connectDb()
    console.log('[user-management-service] connected to MongoDB')
  } catch (err) {
    console.error('[user-management-service] MongoDB connection failed', err)
  }
  app.listen(port, () => {
    console.log(`[user-management-service] listening on http://localhost:${port}`)
  })
}

// Only auto-start when run directly (not when imported by tests).
if (process.env.NODE_ENV !== 'test') {
  start()
}

export default app
