import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Protects routes by role. Redirects to /login if not authenticated or if user role is not in allowedRoles.
 */
const ROLE_HOME = {
  superadmin: '/admin/dashboard',
  admin: '/admin/dashboard',
  executive: '/executive/dashboard',
  billing: '/billing/dashboard',
  warehouse: '/warehouse/dashboard',
}

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, loading } = useAuth()
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

  if (loading) {
    return null
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (allowed.length && !allowed.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />
  }
  return children
}
