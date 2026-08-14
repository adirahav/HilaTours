import dotenv from "dotenv"
import { createServer } from "http"
import { createApp } from "./app"
import { connectDb } from "./lib/db"
import { initSocket } from "./lib/socket"

dotenv.config({ path: ".env.development" })

const app = createApp()
const httpServer = createServer(app)
initSocket(httpServer)
const PORT = process.env.PORT || 3033

async function start() {
  await connectDb()
  httpServer.listen(PORT, () => {
    console.log(`[tour-service] listening on http://localhost:${PORT}`)
  })
}

start()
