import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

let mongo: MongoMemoryServer | null = null

export async function connectTestDb() {
  mongo = await MongoMemoryServer.create()
  const uri = mongo.getUri()
  process.env.MONGO_URI = uri
  await mongoose.connect(uri)
}

export async function clearTestDb() {
  const collections = mongoose.connection.collections
  for (const key of Object.keys(collections)) {
    const collection = collections[key]
    await collection.deleteMany({})
  }
}

export async function closeTestDb() {
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
  mongo = null
}