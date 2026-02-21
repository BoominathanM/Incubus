import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Login from '../pages/Login'
import AdminLayout from '../layouts/AdminLayout'
import ExecutiveLayout from '../layouts/ExecutiveLayout'
import BillingLayout from '../layouts/BillingLayout'
import WarehouseLayout from '../layouts/WarehouseLayout'
import ProtectedRoute from '../components/ProtectedRoute'

export default function AppRouter() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/executive/*"
        element={
          <ProtectedRoute allowedRoles={['executive']}>
            <ExecutiveLayout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing/*"
        element={
          <ProtectedRoute allowedRoles={['billing']}>
            <BillingLayout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouse/*"
        element={
          <ProtectedRoute allowedRoles={['warehouse']}>
            <WarehouseLayout />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          user ? (
            user.role === 'superadmin' || user.role === 'admin' ? (
              <Navigate to="/admin/dashboard" replace />
            ) : user.role === 'executive' ? (
              <Navigate to="/executive/dashboard" replace />
            ) : user.role === 'billing' ? (
              <Navigate to="/billing/dashboard" replace />
            ) : user.role === 'warehouse' ? (
              <Navigate to="/warehouse/dashboard" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  )
}
