import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LayoutWrapper from '../components/LayoutWrapper'
import BillingDashboard from '../pages/billing/Dashboard'
import BillingOrders from '../pages/billing/Orders'
import OrderDetail from '../components/OrderDetail'
import { DashboardOutlined, ShoppingCartOutlined } from '@ant-design/icons'

const menuItems = [
  {
    key: '1',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
    path: '/billing/dashboard',
  },
  {
    key: '2',
    icon: <ShoppingCartOutlined />,
    label: 'Order Management',
    path: '/billing/orders',
  },
]

const BillingLayout = () => {
  return (
    <LayoutWrapper menuItems={menuItems}>
      <Routes>
        <Route path="/dashboard" element={<BillingDashboard />} />
        <Route path="/orders" element={<BillingOrders />} />
        <Route path="/orders/:orderId" element={<OrderDetail basePath="/billing" />} />
        <Route path="*" element={<Navigate to="/billing/dashboard" replace />} />
      </Routes>
    </LayoutWrapper>
  )
}

export default BillingLayout
