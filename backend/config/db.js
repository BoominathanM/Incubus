const mongoose = require('mongoose')
const Retailer = require('../models/Retailer')

const CONNECT_TIMEOUT_MS = 10000
const SERVER_SELECTION_TIMEOUT_MS = 10000

async function cleanupStaleRetailerIndexes() {
  try {
    const indexes = await Retailer.collection.indexes()
    const hasLegacyAgentIdIndex = indexes.some((idx) => idx && idx.name === 'agentId_1')
    if (hasLegacyAgentIdIndex) {
      await Retailer.collection.dropIndex('agentId_1')
      console.log('Dropped stale retailers index: agentId_1')
    }
  } catch (err) {
    console.warn('Retailer index cleanup warning:', err.message)
  }
}

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
    await cleanupStaleRetailerIndexes()
  } catch (err) {
    console.error('MongoDB connection error:', err.message)
    process.exit(1)
  }
}

module.exports = connectDB
