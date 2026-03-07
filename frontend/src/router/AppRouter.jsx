import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Login from '../pages/Login'
import AdminLayout from '../layouts/AdminLayout'
import ExecutiveLayout from '../layouts/ExecutiveLayout'
import BillingLayout from '../layouts/BillingLayout'
import WarehouseLayout from '../layouts/WarehouseLayout'
import ProtectedRoute from '../components/ProtectedRoute'

const ROLE_HOME = {
  superadmin: '/admin/dashboard',
  admin: '/admin/dashboard',
  executive: '/executive/dashboard',
  billing: '/billing/dashboard',
  warehouse: '/warehouse/dashboard',
}

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
            <Navigate to={ROLE_HOME[user.role] || '/login'} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
