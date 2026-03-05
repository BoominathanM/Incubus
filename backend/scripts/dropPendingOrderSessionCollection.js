/**
 * One-time script: drop the pendingordersessions collection.
 * Run after migrating to OrderManagement-only flow: node scripts/dropPendingOrderSession.js
 * Requires: dotenv and MongoDB connection in .env
 */
require('dotenv').config()
const mongoose = require('mongoose')

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) {
    console.error('Set MONGODB_URI or MONGO_URI in .env')
    process.exit(1)
  }
  await mongoose.connect(uri)
  try {
    const coll = mongoose.connection.collection('pendingordersessions')
    const exists = await coll.exists()
    if (exists) {
      await coll.drop()
      console.log('Dropped collection: pendingordersessions')
    } else {
      console.log('Collection pendingordersessions does not exist (already removed)')
    }
  } finally {
    await mongoose.disconnect()
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
