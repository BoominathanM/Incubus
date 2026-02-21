const bcrypt = require('bcryptjs')
const User = require('../models/User')
const { isAssignableRole, ASSIGNABLE_ROLES } = require('../constants/roles')

function toUserResponse(user) {
  const json = typeof user.toJSON === 'function' ? user.toJSON() : user
  return { ...json, id: json._id?.toString?.() || json._id, key: json._id?.toString?.() || json._id }
}

exports.listUsers = async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).lean()
    const list = users.map((u) => {
      const { password, ...rest } = u
      return { ...rest, id: rest._id.toString(), key: rest._id.toString() }
    })
    res.json({ success: true, users: list })
  } catch (err) {
    console.error('List users error:', err)
    res.status(500).json({ success: false, message: 'Failed to list users' })
  }
}

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, phone, status } = req.body
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required' })
    }
    // Super Admin cannot be created; only one exists (seeded)
    if (role?.toLowerCase() === 'superadmin') {
      return res.status(400).json({
        success: false,
        message: 'Super Admin role cannot be created. Only one Super Admin exists in the system.',
      })
    }
    if (!isAssignableRole(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Allowed: ${ASSIGNABLE_ROLES.join(', ')}`,
      })
    }

    const emailLower = email.trim().toLowerCase()
    const existing = await User.findOne({ email: emailLower })
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await User.create({
      name: name.trim(),
      email: emailLower,
      password: hashedPassword,
      role: role.toLowerCase(),
      phone: phone?.trim() || null,
      status: status === 'inactive' ? 'inactive' : 'active',
    })
    res.status(201).json({ success: true, user: toUserResponse(user) })
  } catch (err) {
    console.error('Create user error:', err)
    res.status(500).json({ success: false, message: err.message || 'Failed to create user' })
  }
}

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, phone, role, status, newPassword, confirmNewPassword } = req.body

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    if (newPassword !== undefined || confirmNewPassword !== undefined) {
      if (!newPassword || !confirmNewPassword) {
        return res.status(400).json({ success: false, message: 'Both new password and confirm new password are required to change password' })
      }
      if (newPassword !== confirmNewPassword) {
        return res.status(400).json({ success: false, message: 'New password and confirm new password do not match' })
      }
      user.password = await bcrypt.hash(newPassword, 10)
    }

    if (name !== undefined) user.name = name.trim()
    if (email !== undefined) {
      const emailLower = email.trim().toLowerCase()
      const existing = await User.findOne({ email: emailLower, _id: { $ne: id } })
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email already in use' })
      }
      user.email = emailLower
    }
    if (phone !== undefined) user.phone = phone?.trim() || null
    if (role !== undefined) {
      // Super Admin role cannot be assigned; only the existing Super Admin keeps that role
      if (role.toLowerCase() === 'superadmin') {
        if (user.role !== 'superadmin') {
          return res.status(400).json({
            success: false,
            message: 'Super Admin role cannot be assigned. Only one Super Admin exists in the system.',
          })
        }
        // else: user is already superadmin, keep role unchanged
      } else {
        if (!isAssignableRole(role)) {
          return res.status(400).json({
            success: false,
            message: `Invalid role. Allowed: ${ASSIGNABLE_ROLES.join(', ')}`,
          })
        }
        user.role = role.toLowerCase()
      }
    }
    // Super Admin status cannot be changed
    if (status !== undefined && user.role !== 'superadmin') {
      user.status = status === 'inactive' ? 'inactive' : 'active'
    }

    await user.save()
    res.json({ success: true, user: toUserResponse(user) })
  } catch (err) {
    console.error('Update user error:', err)
    res.status(500).json({ success: false, message: err.message || 'Failed to update user' })
  }
}

exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be active or inactive' })
    }

    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot change your own status' })
    }

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    if (user.role === 'superadmin') {
      return res.status(400).json({ success: false, message: 'Super Admin status cannot be changed' })
    }
    user.status = status
    await user.save()
    res.json({ success: true, user: toUserResponse(user) })
  } catch (err) {
    console.error('Update status error:', err)
    res.status(500).json({ success: false, message: 'Failed to update status' })
  }
}

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' })
    }

    const userToDelete = await User.findById(id)
    if (!userToDelete) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    if (userToDelete.role === 'superadmin') {
      return res.status(400).json({ success: false, message: 'Super Admin cannot be deleted' })
    }

    const user = await User.findByIdAndDelete(id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    res.json({ success: true, message: 'User deleted' })
  } catch (err) {
    console.error('Delete user error:', err)
    res.status(500).json({ success: false, message: 'Failed to delete user' })
  }
}
