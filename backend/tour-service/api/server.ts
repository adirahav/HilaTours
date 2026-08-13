import dotenv from "dotenv"
import { createApp } from "./app"
import { connectDb } from "./lib/db"

dotenv.config({ path: ".env.development" })

const app = createApp()
const PORT = process.env.PORT || 3033

async function start() {
  await connectDb()
  app.listen(PORT, () => {
    console.log(`[tour-service] listening on http://localhost:${PORT}`)
  })
}

start()
