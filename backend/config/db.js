const mongoose = require('mongoose')

const CONNECT_TIMEOUT_MS = 10000
const SERVER_SELECTION_TIMEOUT_MS = 10000

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MongoDB connection error: MONGODB_URI is not set in .env')
    process.exit(1)
  }
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
    })
    console.log(`MongoDB connected: ${conn.connection.host}`)
  } catch (err) {
    console.error('MongoDB connection error:', err.message)
    process.exit(1)
  }
}

module.exports = connectDB
