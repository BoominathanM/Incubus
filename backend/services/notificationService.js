const User = require('../models/User')
const Notification = require('../models/Notification.model')

/**
 * Create notifications for all users with the given roles.
 * @param {string[]} roles - e.g. ['admin', 'superadmin'] or ['billing'] or ['warehouse']
 * @param {object} payload - { title, description, type, referenceId }
 */
async function createNotificationForRoles(roles, payload) {
  if (!Array.isArray(roles) || roles.length === 0) return
  const users = await User.find({ role: { $in: roles }, status: 'active' })
    .select('_id role')
    .lean()
  if (users.length === 0) {
    console.warn('[NotificationService] No users found for roles:', roles, '— notification not sent:', payload.title)
    return
  }
  const docs = users.map((u) => ({
    userId: u._id,
    title: payload.title,
    description: payload.description || '',
    type: payload.type || 'order_new',
    referenceId: payload.referenceId || null,
  }))
  await Notification.insertMany(docs)
  console.log('[NotificationService] Created', docs.length, 'notification(s) for', payload.title, '| roles:', roles)
}

/**
 * Notify admin and super admin (e.g. new retailer/order from webhook).
 */
async function notifyAdminAndSuperAdmin(title, description, type, referenceId) {
  await createNotificationForRoles(['admin', 'superadmin'], {
    title,
    description,
    type,
    referenceId,
  })
}

/**
 * Notify billing agents (e.g. new order arrived – verify).
 */
async function notifyBillingAgents(title, description, referenceId) {
  await createNotificationForRoles(['billing'], {
    title,
    description,
    type: 'order_new',
    referenceId,
  })
}

/**
 * Notify warehouse/delivery agents (e.g. billing done – dispatch with order number).
 */
async function notifyWarehouseAgents(title, description, referenceId) {
  await createNotificationForRoles(['warehouse'], {
    title,
    description,
    type: 'billing_done',
    referenceId,
  })
}

/**
 * Notify a specific user by ID (e.g. executive when admin approves/rejects their retailer).
 */
async function notifyUser(userId, title, description, type, referenceId) {
  if (!userId) return
  const mongoose = require('mongoose')
  const id = mongoose.Types.ObjectId.isValid(userId) ? (typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId) : null
  if (!id) return
  try {
    await Notification.create({
      userId: id,
      title,
      description: description || '',
      type: type || 'retailer_approve',
      referenceId: referenceId || null,
    })
    console.log('[NotificationService] Created notification for user', id.toString(), '|', title)
  } catch (e) {
    console.warn('[NotificationService] notifyUser failed:', e.message)
  }
}

module.exports = {
  createNotificationForRoles,
  notifyAdminAndSuperAdmin,
  notifyBillingAgents,
  notifyWarehouseAgents,
  notifyUser,
}
