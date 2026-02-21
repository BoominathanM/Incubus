const bcrypt = require('bcryptjs')
const User = require('../models/User')

const SUPERADMIN_EMAIL = 'superadmin@gmail.com'
const SUPERADMIN_PASSWORD = '123456'

async function seedSuperAdmin() {
  try {
    const existing = await User.findOne({ email: SUPERADMIN_EMAIL })
    if (existing) {
      console.log('Super Admin already exists in DB.')
      return
    }

    const hashedPassword = await bcrypt.hash(SUPERADMIN_PASSWORD, 10)
    await User.create({
      name: 'Super Admin',
      email: SUPERADMIN_EMAIL,
      password: hashedPassword,
      role: 'superadmin',
      status: 'active',
      phone: '+91 6379171055',
    })
    console.log('Super Admin seeded successfully (email: superadmin@gmail.com, password: 123456).')
  } catch (err) {
    console.error('Seed Super Admin error:', err.message)
  }
}

module.exports = seedSuperAdmin
