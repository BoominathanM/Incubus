const Counter = require('../models/Counter')
const Retailer = require('../models/Retailer')

function getCounterKey(year) {
  return `retailer:${year}`
}

async function generateRetailerId(now = new Date()) {
  const year = now.getFullYear()
  for (let i = 0; i < 10; i++) {
    const counter = await Counter.findByIdAndUpdate(
      getCounterKey(year),
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
    const sequence = String(counter.seq).padStart(3, '0')
    const retailerId = `RET-${year}-${sequence}`
    const exists = await Retailer.exists({ retailerId })
    if (!exists) return retailerId
  }
  throw new Error('Failed to generate unique retailer ID')
}

module.exports = { generateRetailerId }
