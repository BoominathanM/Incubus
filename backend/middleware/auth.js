const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'incubus-secret'

/**
 * Verify JWT and attach req.user (id, email, role). Does not require a role.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = { id: decoded.id, email: decoded.email, role: decoded.role }
    next()
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' })
  }
}

/**
 * Require that the authenticated user has one of the given roles.
 * Use after authenticate().
 */
function requireRole(allowedRoles) {
  const set = new Set(Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' })
    }
    if (set.has(req.user.role)) {
      return next()
    }
    return res.status(403).json({ success: false, message: 'Insufficient permissions' })
  }
}

/**
 * Require admin or superadmin (for user management).
 */
const requireAdminOrSuperadmin = requireRole(['admin', 'superadmin'])

module.exports = {
  authenticate,
  requireRole,
  requireAdminOrSuperadmin,
}
