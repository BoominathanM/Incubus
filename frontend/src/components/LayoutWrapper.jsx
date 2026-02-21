import React, { useState } from 'react'
import { Layout, Menu, Avatar, Dropdown, Button, Space, Typography, Badge, List, Empty, Divider } from 'antd'
import {
  DashboardOutlined,
  ShoppingCartOutlined,
  UserOutlined,
  TeamOutlined,
  MessageOutlined,
  LogoutOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SunOutlined,
  BellOutlined,
  ClearOutlined,
  EyeOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import './LayoutWrapper.css'

const { Header, Sider, Content } = Layout
const { Text } = Typography

const LayoutWrapper = ({ children, menuItems, defaultSelectedKey = '1' }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [notifications, setNotifications] = useState([
    {
      key: '1',
      title: 'New Order Received',
      description: 'Order ORD-001 has been placed',
      time: '2 minutes ago',
      read: false,
    },
    {
      key: '2',
      title: 'Payment Pending',
      description: 'Order ORD-002 payment is pending',
      time: '15 minutes ago',
      read: false,
    },
    {
      key: '3',
      title: 'Retailer Approval Required',
      description: 'New retailer registration request',
      time: '1 hour ago',
      read: true,
    },
  ])
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()

  const getSelectedKey = () => {
    const path = location.pathname
    if (path.includes('dashboard')) return '1'
    if (path.includes('orders')) return '2'
    if (path.includes('retailer') || path.includes('customer')) return '3'
    if (path.includes('agent-management')) return '4'
    if (path.includes('whatsapp')) return '5'
    return defaultSelectedKey
  }

  const handleMenuClick = ({ key }) => {
    const item = menuItems.find(i => i.key === key)
    if (item && item.path) {
      navigate(item.path)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
    },
    {
      key: 'password',
      icon: <SettingOutlined />,
      label: 'Change Password',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: true,
      onClick: handleLogout,
    },
  ]

  const unreadCount = notifications.filter(n => !n.read).length

  const handleMarkAsRead = (key) => {
    setNotifications(notifications.map(n => 
      n.key === key ? { ...n, read: true } : n
    ))
  }

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  const handleClearAll = () => {
    setNotifications([])
  }

  const notificationContent = (
    <div style={{ 
      width: '400px', 
      maxHeight: '500px',
      background: isDark ? '#1f1f1f' : '#fff',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    }}>
      <div style={{ 
        padding: '16px', 
        borderBottom: `1px solid ${isDark ? '#434343' : '#f0f0f0'}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Space>
          <BellOutlined style={{ fontSize: '18px' }} />
          <Text strong style={{ fontSize: '16px', color: isDark ? '#fff' : '#000' }}>Notifications</Text>
          {unreadCount > 0 && <Badge count={unreadCount} />}
        </Space>
      </div>
      <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
        {notifications.length > 0 ? (
          <List
            dataSource={notifications.slice(0, 5)}
            renderItem={(item) => (
              <List.Item
                style={{
                  padding: '12px 16px',
                  backgroundColor: item.read 
                    ? (isDark ? 'transparent' : 'transparent') 
                    : (isDark ? 'rgba(21, 185, 164, 0.1)' : 'rgba(21, 185, 164, 0.05)'),
                  cursor: 'pointer',
                  borderBottom: `1px solid ${isDark ? '#434343' : '#f0f0f0'}`,
                }}
                onClick={() => handleMarkAsRead(item.key)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = item.read 
                    ? 'transparent' 
                    : (isDark ? 'rgba(21, 185, 164, 0.1)' : 'rgba(21, 185, 164, 0.05)')
                }}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {!item.read && <Badge status="processing" />}
                      <span style={{ 
                        fontWeight: item.read ? 'normal' : 'bold',
                        color: isDark ? '#fff' : '#000',
                        fontSize: '14px'
                      }}>
                        {item.title}
                      </span>
                    </Space>
                  }
                  description={
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ 
                        fontSize: '13px', 
                        color: isDark ? '#999' : '#666',
                        lineHeight: '1.4'
                      }}>
                        {item.description}
                      </div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: isDark ? '#666' : '#999', 
                        marginTop: '4px' 
                      }}>
                        {item.time}
                      </div>
                    </div>
                  }
                />
                {!item.read && (
                  <Button
                    type="text"
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleMarkAsRead(item.key)
                    }}
                    style={{ 
                      color: '#15B9A4',
                      fontSize: '12px'
                    }}
                  >
                    Mark as Read
                  </Button>
                )}
              </List.Item>
            )}
          />
        ) : (
          <Empty 
            description="No notifications" 
            style={{ padding: '40px 0' }}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
      </div>
      <Divider style={{ margin: 0 }} />
      <div style={{ 
        padding: '12px 16px',
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end'
      }}>
        <Button
          type="text"
          size="small"
          icon={<CheckOutlined />}
          onClick={handleMarkAllAsRead}
          disabled={unreadCount === 0}
          style={{ fontSize: '12px' }}
        >
          Mark All as Read
        </Button>
        <Button
          type="text"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate('/admin/notifications')}
          style={{ fontSize: '12px' }}
        >
          View All
        </Button>
        <Button
          type="text"
          size="small"
          danger
          icon={<ClearOutlined />}
          onClick={handleClearAll}
          disabled={notifications.length === 0}
          style={{ fontSize: '12px' }}
        >
          Clear All
        </Button>
      </div>
    </div>
  )

  return (
    <Layout className="layout-wrapper" style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={250}
        className="sidebar"
        style={{
          background: isDark ? '#141414' : '#fff',
          borderRight: `1px solid ${isDark ? '#434343' : '#e8e8e8'}`,
        }}
      >
        <div className="logo">
          <img 
            src="/Gadgets logo.png" 
            alt="Logo" 
            style={{ 
              maxWidth: collapsed ? '40px' : '150px', 
              height: 'auto',
              objectFit: 'contain'
            }} 
          />
        </div>
        <Menu
          theme={isDark ? 'dark' : 'light'}
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{
            borderRight: 'none',
          }}
        />
      </Sider>
      <Layout>
        <Header
          className="header"
          style={{
            background: isDark ? '#1f1f1f' : '#fff',
            borderBottom: `1px solid ${isDark ? '#434343' : '#e8e8e8'}`,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />
          <Space>
            <Dropdown 
              dropdownRender={() => notificationContent}
              trigger={['click']}
              placement="bottomRight"
            >
              <Badge count={unreadCount} size="small">
                <Button
                  type="text"
                  icon={<BellOutlined />}
                  style={{ fontSize: '18px' }}
                />
              </Badge>
            </Dropdown>
            <Button
              type="text"
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleTheme}
              style={{ fontSize: '18px' }}
            />
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} />
                <Text>{user?.name || user?.email}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content
          className="content"
          style={{
            margin: '24px',
            padding: '24px',
            background: isDark ? '#141414' : '#f0f2f5',
            borderRadius: '8px',
            minHeight: 'calc(100vh - 112px)',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default LayoutWrapper
