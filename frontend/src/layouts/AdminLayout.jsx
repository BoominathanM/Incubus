import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LayoutWrapper from '../components/LayoutWrapper'
import AdminDashboard from '../pages/admin/Dashboard'
import AdminOrders from '../pages/admin/Orders'
import OrderDetail from '../pages/admin/OrderDetail'
import RetailerBoard from '../pages/admin/RetailerBoard'
import AgentManagement from '../pages/admin/AgentManagement'
import WhatsAppIntegration from '../pages/admin/WhatsAppIntegration'
import Notifications from '../pages/admin/Notifications'
import {
  DashboardOutlined,
  ShoppingCartOutlined,
  UserOutlined,
  TeamOutlined,
  MessageOutlined,
} from '@ant-design/icons'

const menuItems = [
  {
    key: '1',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
    path: '/admin/dashboard',
  },
  {
    key: '3',
    icon: <UserOutlined />,
    label: 'Retailer Board',
    path: '/admin/retailers',
  },
  {
    key: '2',
    icon: <ShoppingCartOutlined />,
    label: 'Order Management',
    path: '/admin/orders',
  },
  {
    key: '4',
    icon: <TeamOutlined />,
    label: 'Agent Management',
    path: '/admin/agent-management',
  },
  {
    key: '5',
    icon: <MessageOutlined />,
    label: 'WhatsApp Integration',
    path: '/admin/whatsapp-integration',
  },
]

const AdminLayout = () => {
  return (
    <LayoutWrapper menuItems={menuItems}>
      <Routes>
        <Route path="/dashboard" element={<AdminDashboard />} />
        <Route path="/orders" element={<AdminOrders />} />
        <Route path="/orders/:orderId" element={<OrderDetail />} />
        <Route path="/retailers" element={<RetailerBoard />} />
        <Route path="/agent-management" element={<AgentManagement />} />
        <Route path="/whatsapp-integration" element={<WhatsAppIntegration />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
      </Routes>
    </LayoutWrapper>
  )
}

export default AdminLayout
