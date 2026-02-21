const jwt = require('jsonwebtoken')
const User = require('../models/User')

const JWT_SECRET = process.env.JWT_SECRET || 'incubus-secret'

exports.login = async (req, res) => {
  try {
    const email = req.body.email?.trim?.()
    const password = req.body.password
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' })
    }

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' })
    }

    if (user.status !== 'active') {
      return res.status(403).json({                    
        success: false,
        message: 'Your account has been deactivated. Please contact your administrator.',
      })
    }

    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' })
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      success: true,
      user: user.toJSON(),
      token,
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

exports.logout = (req, res) => {
  res.json({ success: true, message: 'Logged out' })
}
