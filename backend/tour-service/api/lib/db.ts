import mongoose from "mongoose"

export async function connectDb(uri?: string): Promise<void> {
  const connectionUri = uri || process.env.MONGODB_URI
  if (!connectionUri) {
    console.warn("MONGODB_URI not set — skipping database connection")
    return
  }
  await mongoose.connect(connectionUri, { dbName: process.env.DB_NAME })
  console.log("[tour-service] Connected to MongoDB")
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}
