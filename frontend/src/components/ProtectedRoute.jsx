import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Protects routes by role. Redirects to /login if not authenticated or if user role is not in allowedRoles.
 */
export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user } = useAuth()
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (allowed.length && !allowed.includes(user.role)) {
    return <Navigate to="/login" replace />
  }
  return children
}
