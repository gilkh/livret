import mongoose from 'mongoose'

let isConnecting = false

export const connectDb = async () => {
  if (mongoose.connection.readyState === 1) return
  if (isConnecting) return
  isConnecting = true

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/nvcar'

  const uriLower = String(uri || '').toLowerCase()
  const sandboxFlag = String(process.env.SIMULATION_SANDBOX || '').toLowerCase() === 'true'
  if (!sandboxFlag && (uriLower.includes('sandbox') || uriLower.includes('test'))) {
    isConnecting = false
    throw new Error('Refusing to connect to sandbox/test database without SIMULATION_SANDBOX=true')
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })
  } catch (error) {
    console.error('Initial MongoDB connection error:', error)
    isConnecting = false
    // Retry connection after 5 seconds
    setTimeout(() => connectDb(), 5000)
    return
  }

  isConnecting = false

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error)
  })

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...')
    if (!isConnecting) {
      setTimeout(() => connectDb(), 5000)
    }
  })

  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected')
  })
}

export const objectId = mongoose.Types.ObjectId
