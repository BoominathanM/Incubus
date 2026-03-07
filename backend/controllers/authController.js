const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const User = require('../models/User')

const JWT_SECRET = process.env.JWT_SECRET || 'incubus-secret'

exports.login = async (req, res) => {
  console.log("I'm Boomi")
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
      { id: String(user._id), email: user.email, role: user.role },
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

/** Change password for the authenticated user. Requires currentPassword for verification. */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password, new password and confirm new password are required',
      })
    }
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirm new password do not match',
      })
    }

    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    const isMatch = await user.comparePassword(currentPassword)
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' })
    }

    user.password = await bcrypt.hash(newPassword, 10)
    await user.save()
    res.json({ success: true, message: 'Password changed successfully' })
  } catch (err) {
    console.error('Change password error:', err)
    res.status(500).json({ success: false, message: err.message || 'Failed to change password' })
  }
}

/** Change password from login screen using email + current password verification. */
exports.changePasswordByEmail = async (req, res) => {
  try {
    const { email, currentPassword, newPassword, confirmNewPassword } = req.body
    const emailLower = String(email || '').trim().toLowerCase()

    if (!emailLower || !currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, current password, new password and confirm new password are required',
      })
    }
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirm new password do not match',
      })
    }

    const user = await User.findOne({ email: emailLower })
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found for this email' })
    }

    const isMatch = await user.comparePassword(currentPassword)
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' })
    }

    user.password = await bcrypt.hash(newPassword, 10)
    await user.save()

    return res.json({ success: true, message: 'Password changed successfully' })
  } catch (err) {
    console.error('Change password by email error:', err)
    return res.status(500).json({ success: false, message: err.message || 'Failed to change password' })
  }
}
