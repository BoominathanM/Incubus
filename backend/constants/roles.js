// All roles in the system (for validation)
const ROLES = Object.freeze(['superadmin', 'admin', 'executive', 'billing', 'warehouse'])

// Roles that admin/superadmin can assign when creating or editing users
const ASSIGNABLE_ROLES = Object.freeze(['superadmin', 'admin', 'executive', 'billing', 'warehouse'])

// Role labels for display (optional use in API responses)
const ROLE_LABELS = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  executive: 'Executive Agent',
  billing: 'Billing Agent',
  warehouse: 'Warehouse & Delivery Agent',
}

function isAssignableRole(role) {
  return typeof role === 'string' && ASSIGNABLE_ROLES.includes(role.toLowerCase())
}

function isValidRole(role) {
  return typeof role === 'string' && ROLES.includes(role.toLowerCase())
}

module.exports = {
  ROLES,
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  isAssignableRole,
  isValidRole,
}
