import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LayoutWrapper from '../components/LayoutWrapper'
import WarehouseDashboard from '../pages/warehouse/Dashboard'
import WarehouseOrders from '../pages/warehouse/Orders'
import OrderDetail from '../components/OrderDetail'
import Notifications from '../pages/admin/Notifications'
import { DashboardOutlined, ShoppingCartOutlined } from '@ant-design/icons'

const menuItems = [
  {
    key: '1',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
    path: '/warehouse/dashboard',
  },
  {
    key: '2',
    icon: <ShoppingCartOutlined />,
    label: 'Order Management',
    path: '/warehouse/orders',
  },
]

const WarehouseLayout = () => {
  return (
    <LayoutWrapper menuItems={menuItems}>
      <Routes>
        <Route path="/dashboard" element={<WarehouseDashboard />} />
        <Route path="/orders" element={<WarehouseOrders />} />
        <Route path="/orders/:orderId" element={<OrderDetail basePath="/warehouse" />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="*" element={<Navigate to="/warehouse/dashboard" replace />} />
      </Routes>
    </LayoutWrapper>
  )
}

export default WarehouseLayout
