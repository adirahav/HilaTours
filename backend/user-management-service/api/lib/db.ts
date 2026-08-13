import mongoose from 'mongoose'

export async function connectDb(uri?: string): Promise<void> {
  const connectionUri = uri || process.env.MONGODB_URI
  if (!connectionUri) {
    throw new Error('MONGODB_URI is not set')
  }
  await mongoose.connect(connectionUri, {
    dbName: process.env.DB_NAME || 'HILA_TOURS_DB',
  })
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}
