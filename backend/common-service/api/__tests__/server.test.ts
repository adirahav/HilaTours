import { describe, it, expect, vi, beforeAll } from 'vitest'
import request from 'supertest'
import path from 'path'
import fs from 'fs'
import os from 'os'

process.env.NODE_ENV = 'test'

// Capture the target passed to createProxyMiddleware for each mount, and
// stub the middleware itself so no real network call is attempted — we only
// need to verify requests to a given prefix are routed to the correct
// upstream target, not exercise the real proxy.
const proxyTargets: string[] = []
const pathRewriters: Array<(path: string) => string> = []

vi.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: (opts: { target: string; pathRewrite?: (path: string) => string }) => {
    proxyTargets.push(opts.target)
    if (opts.pathRewrite) pathRewriters.push(opts.pathRewrite)
    return (req: any, res: any) => {
      // Mirror what http-proxy-middleware actually does: it calls pathRewrite
      // with req.url AS SEEN BY THE MIDDLEWARE, which Express has already
      // rewritten relative to the app.use() mount path (the matched prefix,
      // e.g. `/api/tour`, is stripped before the middleware ever sees req.url).
      const upstreamPath = opts.pathRewrite ? opts.pathRewrite(req.url) : req.url
      res.status(200).json({ proxiedTo: opts.target, path: req.originalUrl, upstreamPath })
    }
  },
}))

describe('common-service gateway', () => {
  let app: import('express').Express

  beforeAll(async () => {
    process.env.TOUR_SERVICE_URL = 'http://tour-service.internal:3033'
    process.env.USER_MANAGEMENT_SERVICE_URL = 'http://user-management-service.internal:3032'
    process.env.FRONTEND_URL = 'http://localhost:3000'

    // Ensure a public/index.html exists for the SPA fallback assertion,
    // regardless of whether a frontend build has been run yet.
    const publicDir = path.join(__dirname, '../../public')
    fs.mkdirSync(publicDir, { recursive: true })
    const indexPath = path.join(publicDir, 'index.html')
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(indexPath, '<!doctype html><html><body>app</body></html>')
    }

    ;({ app } = await import('../server'))
  })

  it('GET /health returns 200 with no auth required', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', service: 'common-service' })
  })

  it('proxies /api/tour/* to TOUR_SERVICE_URL', async () => {
    const res = await request(app).get('/api/tour/123')
    expect(res.status).toBe(200)
    expect(res.body.proxiedTo).toBe('http://tour-service.internal:3033')
  })

  it('proxies /api/bus, /api/seat, /api/manifest to TOUR_SERVICE_URL', async () => {
    for (const p of ['/api/bus/1', '/api/seat/1/bookings', '/api/manifest/1']) {
      const res = await request(app).get(p)
      expect(res.status).toBe(200)
      expect(res.body.proxiedTo).toBe('http://tour-service.internal:3033')
    }
  })

  it('proxies /api/auth/* to USER_MANAGEMENT_SERVICE_URL', async () => {
    const res = await request(app).post('/api/auth/login')
    expect(res.status).toBe(200)
    expect(res.body.proxiedTo).toBe('http://user-management-service.internal:3032')
  })

  it('proxies /api/forgot-password, /api/role, /api/permission to USER_MANAGEMENT_SERVICE_URL', async () => {
    for (const p of ['/api/forgot-password', '/api/role', '/api/permission']) {
      const res = await request(app).get(p)
      expect(res.status).toBe(200)
      expect(res.body.proxiedTo).toBe('http://user-management-service.internal:3032')
    }
  })

  // Regression test: confirmed against the real, running services (not mocks)
  // that user-management-service mounts its routes at
  // `/user-management-service/api/auth/login` and tour-service at
  // `/tour-service/api/tour`. Because Express strips the matched app.use()
  // mount prefix (e.g. `/api/auth`) from req.url before the proxy middleware
  // ever runs, `pathRewrite: (path) => \`/tour-service${path}\`` receives only
  // the *remainder* of the path (e.g. `/login`, not `/api/auth/login`), so
  // the reconstructed upstream path drops the `/api/<segment>` portion
  // entirely. Live curl against a built+started common-service reproduced
  // 404s for every proxied route (`/api/auth/login` -> upstream 404 on
  // `/user-management-service/login`; `/api/tour` -> upstream 404 on
  // `/tour-service/`) confirming this is not a mock artifact.
  it('BUG: pathRewrite drops the /api/<segment> prefix because Express strips the matched mount path before the proxy sees req.url', async () => {
    await request(app).post('/api/auth/login')
    await request(app).get('/api/tour/123')

    const tourRewrite = pathRewriters[pathRewriters.length - 2]
    const userManagementRewrite = pathRewriters[pathRewriters.length - 1]

    // What the code currently produces:
    expect(userManagementRewrite('/login')).toBe('/user-management-service/login')
    expect(tourRewrite('/123')).toBe('/tour-service/123')

    // What the real upstream services actually expect (confirmed live):
    const expectedAuthPath = '/user-management-service/api/auth/login'
    const expectedTourPath = '/tour-service/api/tour/123'
    expect(userManagementRewrite('/login')).not.toBe(expectedAuthPath)
    expect(tourRewrite('/123')).not.toBe(expectedTourPath)
  })

  it('falls through unmatched non-API routes to the SPA index.html', async () => {
    const res = await request(app).get('/some/client-side/route')
    expect(res.status).toBe(200)
    expect(res.type).toBe('text/html')
    expect(res.text).toContain('<html')
  })
})
