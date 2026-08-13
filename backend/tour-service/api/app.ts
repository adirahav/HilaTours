import express, { NextFunction, Request, Response } from "express"
import cors from "cors"
import { tourRouter } from "./tour/tour.routes"
import { busRouter } from "./bus/bus.routes"
import { seatRouter } from "./seat/seat.routes"
import { manifestRouter } from "./manifest/manifest.routes"
import { HttpError } from "./lib/http"

// Base path matches the API contract server URL: /tour-service/api
export const API_BASE = "/tour-service/api"

export function createApp() {
  const app = express()

  // Only the configured frontend origin may call this service. Never fall back
  // to reflecting the request origin — that would disable CORS protection
  // entirely if FRONTEND_URL were ever missing.
  app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }))

  // Chrome's Private Network Access check: browsers running in a "public"
  // context (e.g. the Capacitor webview) send this header on preflight
  // requests to localhost and require it echoed back, or the actual request
  // fails client-side with net::ERR_FAILED despite a 200 response — the
  // `cors` package above doesn't set it.
  app.use((req, res, next) => {
    if (req.headers["access-control-request-private-network"]) {
      res.setHeader("Access-Control-Allow-Private-Network", "true")
    }
    next()
  })

  app.use(express.json())

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "tour-service" })
  })

  app.use(API_BASE, tourRouter)
  app.use(API_BASE, busRouter)
  app.use(API_BASE, seatRouter)
  app.use(API_BASE, manifestRouter)

  // Central error handler — maps HttpError to its status code.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ message: err.message })
      return
    }
    console.error("Unhandled error:", err)
    res.status(500).json({ message: "Internal server error" })
  })

  return app
}
