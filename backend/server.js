require('dotenv').config()
console.log('Starting server...')
const express = require('express')
const cors = require('cors')
const connectDB = require('./config/db')
const seedSuperAdmin = require('./scripts/seed')
const authRoutes = require('./routes/auth')
const userRoutes = require('./routes/users')
const countryCodesRoutes = require('./routes/countryCodes')
const askevaRoutes = require('./routes/askeva')
const askevaController = require('./controllers/askevaController')

const app = express()
const PORT = process.env.PORT || 7000

const allowedOrigins = [
  'http://localhost:7001',
  'http://localhost:5173',
  'http://127.0.0.1:7001',
  'http://127.0.0.1:5173',
  'https://incubus.vercel.app',
]
const corsOrigin = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, ...allowedOrigins]
  : allowedOrigins
app.use(cors({ origin: corsOrigin, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/country-codes', countryCodesRoutes)
app.use('/api/askeva', askevaRoutes)
app.post('/api/askeva/webhook/:companyId', askevaController.handleWebhook)

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

async function start() {
  await connectDB()
  await seedSuperAdmin()

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

start().catch((err) => {
  console.error('Startup error:', err)
  process.exit(1)
})
