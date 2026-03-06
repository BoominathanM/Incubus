const mongoose = require('mongoose')
const Notification = require('../models/Notification.model')

function toUserId(id) {
  if (!id) return null
  if (mongoose.Types.ObjectId.isValid(id)) return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
  return null
}

/**
 * GET /api/notifications
 * List notifications for the current user. Query: page, limit
 */
exports.list = async (req, res) => {
  try {
    const userId = toUserId(req.user?.id)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20)
    const skip = (page - 1) * limit

    const [notifications, total] = await Promise.all([
      Notification.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ userId }),
    ])

    const items = notifications.map((n) => ({
      _id: n._id,
      key: n._id.toString(),
      title: n.title,
      description: n.description,
      type: n.type,
      referenceId: n.referenceId,
      read: n.read,
      time: formatTimeAgo(n.createdAt),
      createdAt: n.createdAt,
    }))

    return res.json({
      success: true,
      data: {
        notifications: items,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      },
    })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to list notifications' })
  }
}

/**
 * GET /api/notifications/unread-count
 */
exports.unreadCount = async (req, res) => {
  try {
    const userId = toUserId(req.user?.id)
    if (!userId) {
      return res.json({ success: true, count: 0 })
    }
    const count = await Notification.countDocuments({ userId, read: false })
    return res.json({ success: true, count })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to get unread count' })
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
exports.markRead = async (req, res) => {
  try {
    const userId = toUserId(req.user?.id)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }
    const updated = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: { read: true } },
      { new: true }
    ).lean()
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Notification not found' })
    }
    return res.json({ success: true, data: updated })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to mark as read' })
  }
}

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications for the current user as read.
 */
exports.markAllRead = async (req, res) => {
  try {
    const userId = toUserId(req.user?.id)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }
    await Notification.updateMany({ userId }, { $set: { read: true } })
    return res.json({ success: true, message: 'All notifications marked as read' })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to mark all as read' })
  }
}

/**
 * DELETE /api/notifications/:id
 * Delete a single notification for the current user.
 */
exports.deleteOne = async (req, res) => {
  try {
    const userId = toUserId(req.user?.id)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }
    const deleted = await Notification.findOneAndDelete({ _id: req.params.id, userId })
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Notification not found' })
    }
    return res.json({ success: true, message: 'Notification deleted' })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to delete notification' })
  }
}

/**
 * DELETE /api/notifications/clear-all
 * Delete all notifications for the current user.
 */
exports.clearAll = async (req, res) => {
  try {
    const userId = toUserId(req.user?.id)
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }
    await Notification.deleteMany({ userId })
    return res.json({ success: true, message: 'All notifications cleared' })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to clear notifications' })
  }
}

function formatTimeAgo(date) {
  if (!date) return ''
  const d = new Date(date)
  const now = new Date()
  const diffMs = now - d
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  return d.toLocaleString()
}
