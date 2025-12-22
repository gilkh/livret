import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

let mongo: MongoMemoryServer | null = null

export async function connectTestDb() {
  mongo = await MongoMemoryServer.create()
  const uri = mongo.getUri()
  process.env.MONGO_URI = uri
  await mongoose.connect(uri)
  // Ensure model indexes are synced to pick up any index option changes (sparse, partialFilterExpression, etc.)
  try {
    const { TemplateAssignment } = require('../models/TemplateAssignment')
    // Ensure older non-sparse unique index is removed (test DB may have older index from previous runs)
    try {
      const col = mongoose.connection.collection('templateassignments')
      const indexes = await col.indexes()
      const idxName = 'templateId_1_studentId_1_completionSchoolYearId_1'
      if (indexes && indexes.some((i: any) => i.name === idxName && (!i.sparse))) {
        try { await col.dropIndex(idxName) } catch (err) { /* ignore */ }
      }
    } catch (err) {
      // ignore
    }

    await TemplateAssignment.syncIndexes()
  } catch (e) {
    // ignore
  }
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