import mongoose from 'mongoose'

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/nvcarn'

export const connectDb = async () => {
  await mongoose.connect(uri)
}

export const objectId = mongoose.Types.ObjectId
