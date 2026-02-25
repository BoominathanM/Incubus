import React, { useState } from 'react'
import { Layout, Menu, Avatar, Dropdown, Button, Space, Typography, Badge, List, Empty, Divider, Drawer, Form, Input, message } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
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
import { useUpdateUserMutation } from '../store/api/userApi'
import axios from 'axios'
import { getApiBase } from '../utils/api'
import './LayoutWrapper.css'

const ROLE_LABELS = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  executive: 'Executive Agent',
  billing: 'Billing Agent',
  warehouse: 'Warehouse & Delivery Agent',
}

const { Header, Sider, Content } = Layout
const { Text } = Typography

const LayoutWrapper = ({ children, menuItems, defaultSelectedKey = '1' }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false)
  const [passwordForm] = Form.useForm()
  const [changingPassword, setChangingPassword] = useState(false)
  const [updateUser] = useUpdateUserMutation()
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

  const isAdminOrSuperadmin = user?.role === 'superadmin' || user?.role === 'admin'
  const userPhone = [user?.mobileCountryCode, user?.mobileNumber].filter(Boolean).join(' ').trim() || user?.phone || user?.mobile || '—'

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
      onClick: () => setProfileDrawerOpen(true),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: true,
      onClick: handleLogout,
    },
  ]

  const onCloseProfileDrawer = () => {
    setProfileDrawerOpen(false)
    passwordForm.resetFields()
  }

  const onFinishPassword = async (values) => {
    setChangingPassword(true)
    try {
      const userId = user?.id || user?._id
      if (isAdminOrSuperadmin) {
        await updateUser({
          id: userId,
          newPassword: values.newPassword,
          confirmNewPassword: values.confirmNewPassword,
        }).unwrap()
      } else {
        const token = localStorage.getItem('token')
        await axios.post(
          `${getApiBase()}/api/auth/change-password`,
          {
            currentPassword: values.currentPassword,
            newPassword: values.newPassword,
            confirmNewPassword: values.confirmNewPassword,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        )
      }
      message.success('Password changed successfully')
      passwordForm.resetFields()
    } catch (err) {
      const msg = err?.data?.message || err?.response?.data?.message || err?.message || 'Failed to change password'
      message.error(msg)
    } finally {
      setChangingPassword(false)
    }
  }

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
    <Layout className="layout-wrapper" style={{ height: '100vh', minHeight: '100vh', display: 'flex' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={250}
        collapsedWidth={80}
        className="sidebar sidebar-with-logout"
        style={{
          background: isDark ? '#141414' : '#fff',
          borderRight: `1px solid ${isDark ? '#434343' : '#e8e8e8'}`,
          height: '100%',
          minHeight: '100vh',
          overflow: 'hidden',
        }}
      >
        <div
          className="sidebar-inner"
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: '100vh',
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
              flex: 1,
              overflow: 'auto',
            }}
          />
          <div
            style={{
              borderTop: `1px solid ${isDark ? '#434343' : '#e8e8e8'}`,
              padding: collapsed ? '8px' : '8px 16px',
              marginTop: 'auto',
            }}
          >
            <Button
              type="text"
              danger
              block
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              style={{
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: isDark ? 'rgba(255, 77, 79, 0.85)' : '#ff4d4f',
                fontSize: '14px',
              }}
            >
              {!collapsed && <span style={{ marginLeft: 8 }}>Logout</span>}
            </Button>
          </div>
        </div>
      </Sider>
      <Layout style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
            flex: 1,
            margin: '24px',
            padding: '24px',
            background: isDark ? '#141414' : '#f0f2f5',
            borderRadius: '8px',
            minHeight: 0,
            overflow: 'auto',
          }}
        >
          {children}
        </Content>
      </Layout>

      <Drawer
        title="Profile"
        placement="right"
        onClose={onCloseProfileDrawer}
        open={profileDrawerOpen}
        width={380}
        styles={{
          body: {
            background: isDark ? '#141414' : '#fff',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            paddingBottom: 24,
          },
          header: { background: isDark ? '#1f1f1f' : '#fff', borderBottom: `1px solid ${isDark ? '#434343' : '#f0f0f0'}` },
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', flex: 1 }}>
          <div>
            <Text type="secondary" style={{ fontSize: '12px', textTransform: 'uppercase' }}>Name</Text>
            <div style={{ marginTop: '4px', fontSize: '15px', color: isDark ? '#fff' : '#000' }}>{user?.name || '—'}</div>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: '12px', textTransform: 'uppercase' }}>Email</Text>
            <div style={{ marginTop: '4px', fontSize: '15px', color: isDark ? '#fff' : '#000' }}>{user?.email || '—'}</div>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: '12px', textTransform: 'uppercase' }}>Role</Text>
            <div style={{ marginTop: '4px', fontSize: '15px', color: isDark ? '#fff' : '#000' }}>
              {user?.role ? ROLE_LABELS[user.role] || user.role : '—'}
            </div>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: '12px', textTransform: 'uppercase' }}>Phone Number</Text>
            <div style={{ marginTop: '4px', fontSize: '15px', color: isDark ? '#fff' : '#000' }}>{userPhone}</div>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          <div>
            <Text strong style={{ marginBottom: '12px', display: 'block', color: isDark ? '#fff' : '#000' }}>Change Password</Text>
            <Form
              form={passwordForm}
              layout="vertical"
              onFinish={onFinishPassword}
            >
              {!isAdminOrSuperadmin && (
                <Form.Item
                  name="currentPassword"
                  label="Current password"
                  rules={[{ required: true, message: 'Enter your current password' }]}
                >
                  <Input.Password placeholder="Current password" />
                </Form.Item>
              )}
              <Form.Item
                name="newPassword"
                label="New password"
                rules={[{ required: true, message: 'Enter new password' }]}
              >
                <Input.Password placeholder="New password" />
              </Form.Item>
              <Form.Item
                name="confirmNewPassword"
                label="Confirm new password"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: 'Confirm new password' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) return Promise.resolve()
                      return Promise.reject(new Error('Passwords do not match'))
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="Confirm new password" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={changingPassword} block>
                  Change Password
                </Button>
              </Form.Item>
            </Form>
          </div>

          <Divider style={{ margin: '8px 0' }} />

          <div style={{ marginTop: 'auto' }}>
            <Button
              type="primary"
              danger
              block
              size="large"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
            >
              Logout
            </Button>
          </div>
        </div>
      </Drawer>
    </Layout>
  )
}

export default LayoutWrapper
