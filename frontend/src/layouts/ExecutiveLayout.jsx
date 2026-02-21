import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LayoutWrapper from '../components/LayoutWrapper'
import ExecutiveDashboard from '../pages/executive/Dashboard'
import CustomerBoard from '../pages/executive/CustomerBoard'
import {
  DashboardOutlined,
  UserOutlined,
} from '@ant-design/icons'

const menuItems = [
  {
    key: '1',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
    path: '/executive/dashboard',
  },
  {
    key: '2',
    icon: <UserOutlined />,
    label: 'Customer Board',
    path: '/executive/customers',
  },
]

const ExecutiveLayout = () => {
  return (
    <LayoutWrapper menuItems={menuItems}>
      <Routes>
        <Route path="/dashboard" element={<ExecutiveDashboard />} />
        <Route path="/customers" element={<CustomerBoard />} />
        <Route path="*" element={<Navigate to="/executive/dashboard" replace />} />
      </Routes>
    </LayoutWrapper>
  )
}

export default ExecutiveLayout
