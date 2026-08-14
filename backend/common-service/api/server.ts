import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createProxyMiddleware } from 'http-proxy-middleware'

dotenv.config({ path: '.env.development' })

// __dirname doesn't exist under ESM ("type": "module") — reconstruct it from
// import.meta.url instead, matching this repo's ESM convention.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))

// Health check must be mounted first, before any proxy/static middleware, so
// the hosting platform can confirm the process itself is alive without it
// depending on the database or either upstream service.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'common-service' })
})

// Both upstream services mount their real routes under a gateway-style
// prefix (`/<service-name>/api/...`), not bare `/api/...` — verified against
// each service's own server/app entrypoint. pathRewrite reconstructs that
// real path so the proxied request actually resolves upstream.
//
// http-proxy-middleware v3+ must be mounted at root with `pathFilter` inside
// the options, NOT as `app.use(['/api/tour', ...], createProxyMiddleware(...))`.
// Express strips the matched prefix from req.url before an app.use(path, mw)
// middleware ever sees it, so pathRewrite would receive an already-truncated
// path (e.g. `/api/tour/123` arrives as `/123`) and silently produce the
// wrong upstream URL — every proxied request 404s even though the target
// service and pathRewrite logic are both correct in isolation.
app.use(
  createProxyMiddleware({
    pathFilter: ['/api/tour', '/api/bus', '/api/seat', '/api/manifest'],
    target: process.env.TOUR_SERVICE_URL || 'http://localhost:3033',
    changeOrigin: true,
    pathRewrite: (path) => `/tour-service${path}`,
  })
)

app.use(
  createProxyMiddleware({
    pathFilter: ['/api/auth', '/api/forgot-password', '/api/role', '/api/permission'],
    target: process.env.USER_MANAGEMENT_SERVICE_URL || 'http://localhost:3032',
    changeOrigin: true,
    pathRewrite: (path) => `/user-management-service${path}`,
  })
)

// tour-service also runs a socket.io server (seat-map live updates) mounted
// directly on its raw http.Server at the socket.io default path — NOT under
// its `/tour-service/api` Express prefix, so no pathRewrite here. A
// WebSocket upgrade is a different mechanism from a normal HTTP request:
// createProxyMiddleware's `ws: true` only prepares the proxy to handle an
// upgrade — it does NOT, by itself, intercept the Node 'upgrade' event.
// Without explicitly wiring server.on('upgrade', ...) below, every socket.io
// handshake falls through to the SPA fallback instead (which answers with a
// normal 200 HTML page), and the client sees "Unexpected response code: 200"
// instead of a 101 Switching Protocols.
const socketProxy = createProxyMiddleware({
  pathFilter: ['/socket.io'],
  target: process.env.TOUR_SERVICE_URL || 'http://localhost:3033',
  changeOrigin: true,
  ws: true,
})
app.use(socketProxy)

// Serve the built frontend (Vite builds directly into this folder).
app.use(express.static(path.join(__dirname, '../public')))

// SPA fallback must be last so client-side routing survives a hard refresh,
// and must not shadow any of the API/proxy routes mounted above.
app.get('/*splat', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

const PORT = Number(process.env.PORT || 3034)

// Only auto-start when run directly (not when imported by tests).
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`[common-service] gateway ready at http://localhost:${PORT}`)
  })
  // Required for the socket.io proxy above: forward raw WebSocket upgrade
  // requests to it. `ws: true` in createProxyMiddleware alone does nothing
  // without this — see the comment on socketProxy.
  server.on('upgrade', socketProxy.upgrade)
}

export default app
