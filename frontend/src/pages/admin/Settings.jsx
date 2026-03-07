import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, Card, Table, Tag, Button, Space, Input, Modal, Form, Select, message, Typography, List, Badge, Empty, Dropdown, Grid } from 'antd'
import Breadcrumbs from '../../components/Breadcrumbs'
import PhoneInput from '../../components/PhoneInput'
import { useAuth } from '../../context/AuthContext'
import {
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useUpdateUserStatusMutation,
  useDeleteUserMutation,
} from '../../store/api/userApi'
import {
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  BellOutlined,
  MessageOutlined,
  SaveOutlined,
  MoreOutlined,
} from '@ant-design/icons'

const { Title } = Typography
const { Option } = Select
const { TextArea } = Input
const { useBreakpoint } = Grid

const statusDisplay = (s) => (s === 'active' ? 'Active' : 'Inactive')
const ROLE_LABELS = { admin: 'Admin', executive: 'Executive Agent', billing: 'Billing Agent', warehouse: 'Warehouse & Delivery Agent', superadmin: 'Super Admin' }

const Settings = () => {
  const screens = useBreakpoint()
  const isSmallScreen = !screens.md
  const { user: currentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'users')
  const [userModalVisible, setUserModalVisible] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [userForm] = Form.useForm()
  const [templateForm] = Form.useForm()
  const [userSearchText, setUserSearchText] = useState('')

  const { data: usersResponse, isLoading: usersLoading, refetch: refetchUsers } = useGetUsersQuery(undefined, { skip: activeTab !== 'users' })
  const [createUser, { isLoading: createLoading }] = useCreateUserMutation()
  const [updateUser, { isLoading: updateLoading }] = useUpdateUserMutation()
  const [updateUserStatus] = useUpdateUserStatusMutation()
  const [deleteUser] = useDeleteUserMutation()
  const users = (usersResponse?.users || []).map((u) => ({ ...u, key: u.id || u._id }))
  const submitLoading = createLoading || updateLoading

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const handleTabChange = (key) => {
    setActiveTab(key)
    setSearchParams({ tab: key })
  }

  // User Management Columns (includes Agents)
  const userColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Mobile Number',
      key: 'mobile',
      render: (_, r) => (r.mobileCountryCode && r.mobileNumber ? `${r.mobileCountryCode} ${r.mobileNumber}` : r.phone || '—'),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role) => {
        const colors = { admin: '#15B9A4', executive: '#6754A3', billing: '#15B9A4', warehouse: '#6754A3', superadmin: '#ff7a45' }
        return <Tag color={colors[role] || '#15B9A4'}>{ROLE_LABELS[role] || role}</Tag>
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? '#15B9A4' : '#ff4d4f'}>{statusDisplay(status)}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 72,
      render: (_, record) => {
        const isSuperAdminUser = record.role === 'superadmin'
        const canManageSuperAdmin = currentUser?.role === 'superadmin'
        const canEdit = canManageSuperAdmin || !isSuperAdminUser
        const showDeactivateActivateDelete = !isSuperAdminUser
        const openEdit = () => {
          setSelectedUser(record)
          const mobileStr = record.phone || record.mobile || ''
          const match = mobileStr.match(/^(\+\d+)\s*(.*)$/)
          userForm.setFieldsValue({
            ...record,
            status: record.status === 'active' ? 'active' : 'inactive',
            mobileCountryCode: record.mobileCountryCode ?? match?.[1] ?? '+91',
            mobileNumber: record.mobileNumber ?? match?.[2] ?? mobileStr.replace(/^\+\d+\s*/, ''),
          })
          setUserModalVisible(true)
        }
        const menuItems = [
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', disabled: !canEdit, onClick: openEdit },
          ...(showDeactivateActivateDelete
            ? [record.status === 'active'
                ? { key: 'deactivate', label: 'Deactivate', danger: true, disabled: !canEdit, onClick: () => handleDeactivateUser(record) }
                : { key: 'activate', label: 'Activate', disabled: !canEdit, onClick: () => handleActivateUser(record) }]
            : []),
          ...(showDeactivateActivateDelete ? [{ key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true, disabled: !canEdit, onClick: () => handleDeleteUser(record) }] : []),
        ]
        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        )
      },
    },
  ]

  const filteredUsers = userSearchText
    ? users.filter(
        (u) =>
          (u.name || '').toLowerCase().includes(userSearchText.toLowerCase()) ||
          (u.email || '').toLowerCase().includes(userSearchText.toLowerCase())
      )
    : users

  const buildUserPayload = (values, isEdit = false) => {
    const phone = [values.mobileCountryCode, values.mobileNumber].filter(Boolean).join(' ').trim() || null
    const payload = {
      name: values.name,
      email: values.email,
      phone,
      role: values.role,
      status: values.status === 'inactive' ? 'inactive' : 'active',
    }
    if (isEdit && values.newPassword && values.confirmNewPassword) {
      const pwd = String(values.newPassword).trim()
      const confirm = String(values.confirmNewPassword).trim()
      if (pwd && pwd === confirm) {
        payload.newPassword = pwd
        payload.confirmNewPassword = confirm
      }
    }
    return payload
  }

  const handleDeleteUser = (record) => {
    Modal.confirm({
      title: 'Delete User',
      content: `Are you sure you want to delete ${record.name}? Associated records will need to be reassigned.`,
      onOk: async () => {
        try {
          const res = await deleteUser(record.id || record._id).unwrap()
          if (res.success) {
            message.success(`${record.name} has been deleted`)
            refetchUsers()
          } else {
            message.error(res.message || 'Delete failed')
          }
        } catch (err) {
          message.error(err?.data?.message || err?.message || 'Delete failed')
        }
      },
    })
  }

  const handleActivateUser = async (record) => {
    try {
      const res = await updateUserStatus({ id: record.id || record._id, status: 'active' }).unwrap()
      if (res.success) {
        message.success(`${record.name} has been activated`)
        refetchUsers()
      } else {
        message.error(res.message || 'Failed to activate')
      }
    } catch (err) {
      message.error(err?.data?.message || err?.message || 'Failed to activate')
    }
  }

  const handleDeactivateUser = (record) => {
    Modal.confirm({
      title: 'Deactivate User',
      content: `Are you sure you want to deactivate ${record.name}? They will not be able to sign in until activated again.`,
      okText: 'Deactivate',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await updateUserStatus({ id: record.id || record._id, status: 'inactive' }).unwrap()
          if (res.success) {
            message.success(`${record.name} has been deactivated`)
            refetchUsers()
          } else {
            message.error(res.message || 'Failed to deactivate')
          }
        } catch (err) {
          message.error(err?.data?.message || err?.message || 'Failed to deactivate')
        }
      },
    })
  }

  const handleCreateUser = () => {
    userForm.validateFields().then(async (values) => {
      try {
        const payload = { ...buildUserPayload(values), password: values.password }
        const res = await createUser(payload).unwrap()
        if (res.success) {
          message.success('User created successfully')
          setUserModalVisible(false)
          userForm.resetFields()
          refetchUsers()
        } else {
          message.error(res.message || 'Create failed')
        }
      } catch (err) {
        message.error(err?.data?.message || err?.message || 'Create failed')
      }
    })
  }

  const handleUpdateUser = () => {
    userForm.validateFields().then(async (values) => {
      if (!selectedUser) return
      try {
        const res = await updateUser({ id: selectedUser.id || selectedUser._id, ...buildUserPayload(values, true) }).unwrap()
        if (res.success) {
          message.success('User updated successfully')
          setUserModalVisible(false)
          setSelectedUser(null)
          userForm.resetFields()
          refetchUsers()
        } else {
          message.error(res.message || 'Update failed')
        }
      } catch (err) {
        message.error(err?.data?.message || err?.message || 'Update failed')
      }
    })
  }

  const mockNotifications = [
    {
      key: '1',
      title: 'New Order Received',
      description: 'Order ORD-001 has been placed by ABC Store',
      time: '2 minutes ago',
      type: 'order',
      read: false,
    },
    {
      key: '2',
      title: 'Payment Pending',
      description: 'Order ORD-002 payment is pending',
      time: '15 minutes ago',
      type: 'payment',
      read: false,
    },
    {
      key: '3',
      title: 'Retailer Approval Required',
      description: 'New retailer registration request from XYZ Mart',
      time: '1 hour ago',
      type: 'retailer',
      read: true,
    },
    {
      key: '4',
      title: 'Order Dispatched',
      description: 'Order ORD-003 has been dispatched',
      time: '2 hours ago',
      type: 'order',
      read: true,
    },
    {
      key: '5',
      title: 'Delivery Confirmed',
      description: 'Order ORD-004 has been delivered successfully',
      time: '3 hours ago',
      type: 'delivery',
      read: true,
    },
  ]

  const handleMarkAsRead = (notification) => {
    message.success('Notification marked as read')
  }

  const handleMarkAllAsRead = () => {
    message.success('All notifications marked as read')
  }

  const handleDeleteNotification = (notification) => {
    message.success('Notification deleted')
  }

  const handleSaveTemplate = (templateType) => {
    templateForm.validateFields().then(() => {
      message.success(`${templateType} template saved successfully`)
    })
  }

  const tabItems = [
    {
      key: 'users',
      label: (
        <span>
          <UserOutlined />
          User Management
        </span>
      ),
      children: (
        <div>
          <Space 
            style={{ 
              marginBottom: 16, 
              width: '100%', 
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <Input
              placeholder="Search users"
              prefix={<SearchOutlined />}
              value={userSearchText}
              onChange={(e) => setUserSearchText(e.target.value)}
              style={{ width: '100%', maxWidth: 300, minWidth: isSmallScreen ? undefined : 200 }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setSelectedUser(null)
                userForm.resetFields()
                userForm.setFieldsValue({ status: 'active' })
                setUserModalVisible(true)
              }}
            >
              Create User
            </Button>
          </Space>
          <Table
            columns={userColumns}
            dataSource={filteredUsers}
            loading={usersLoading}
            pagination={{ pageSize: 10, responsive: true, size: isSmallScreen ? 'small' : 'default' }}
            size={isSmallScreen ? 'small' : 'middle'}
            scroll={{ x: 'max-content' }}
          />
        </div>
      ),
    },
    {
      key: 'notifications',
      label: (
        <span>
          <BellOutlined />
          Notifications
        </span>
      ),
      children: (
        <div>
          <Space 
            style={{ 
              marginBottom: 16, 
              width: '100%', 
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <Input
              placeholder="Search notifications"
              prefix={<SearchOutlined />}
              style={{ width: '100%', maxWidth: 300, minWidth: isSmallScreen ? undefined : 200 }}
            />
            <Button
              type="primary"
              onClick={handleMarkAllAsRead}
            >
              Mark All as Read
            </Button>
          </Space>
          {mockNotifications.length > 0 ? (
            <List
              itemLayout="horizontal"
              dataSource={mockNotifications}
              renderItem={(item) => (
                <List.Item
                  style={{
                    backgroundColor: item.read ? 'transparent' : 'rgba(21, 185, 164, 0.1)',
                    padding: '16px',
                    marginBottom: '8px',
                    borderRadius: '8px',
                  }}
                  actions={[
                    <Button
                      key="read"
                      type="link"
                      onClick={() => handleMarkAsRead(item)}
                      disabled={item.read}
                    >
                      Mark as Read
                    </Button>,
                    <Button
                      key="delete"
                      type="link"
                      danger
                      onClick={() => handleDeleteNotification(item)}
                    >
                      Delete
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        {!item.read && <Badge status="processing" />}
                        <span style={{ fontWeight: item.read ? 'normal' : 'bold' }}>
                          {item.title}
                        </span>
                        <Tag color={
                          item.type === 'order' ? '#15B9A4' :
                          item.type === 'payment' ? '#faad14' :
                          item.type === 'retailer' ? '#6754A3' :
                          '#52c41a'
                        }>
                          {item.type}
                        </Tag>
                      </Space>
                    }
                    description={
                      <div>
                        <div>{item.description}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#999' }}>
                          {item.time}
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty description="No notifications" />
          )}
        </div>
      ),
    },
    {
      key: 'whatsapp',
      label: (
        <span>
          <MessageOutlined />
          WhatsApp Integration
        </span>
      ),
      children: (
        <div>
          <Card title="WhatsApp Template Configuration" style={{ marginBottom: 24 }}>
            <p style={{ marginBottom: 16, color: '#666' }}>
              Configure automated WhatsApp notifications for order-related events. Once configured, all future messages will be sent automatically.
            </p>
            <Form form={templateForm} layout="vertical">
              <Form.Item
                name="orderConfirmation"
                label="Order Confirmation Template"
                initialValue="Thank you for your order. Our team will process it shortly. Order ID: {orderId}"
              >
                <TextArea rows={3} />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={() => handleSaveTemplate('Order Confirmation')}
                >
                  Save Template
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card title="Invoice Generation Template" style={{ marginBottom: 24 }}>
            <Form form={templateForm} layout="vertical">
              <Form.Item
                name="invoiceGeneration"
                label="Invoice Generation Template"
                initialValue="Your order has been billed. Invoice Number: {invoiceNumber}"
              >
                <TextArea rows={3} />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={() => handleSaveTemplate('Invoice Generation')}
                >
                  Save Template
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card title="Order Dispatch Template" style={{ marginBottom: 24 }}>
            <Form form={templateForm} layout="vertical">
              <Form.Item
                name="orderDispatch"
                label="Order Dispatch Template"
                initialValue="Your order is ready for dispatch. Tracking URL: {trackingUrl}"
              >
                <TextArea rows={3} />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={() => handleSaveTemplate('Order Dispatch')}
                >
                  Save Template
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card title="Order Tracking Template" style={{ marginBottom: 24 }}>
            <Form form={templateForm} layout="vertical">
              <Form.Item
                name="orderTracking"
                label="Order Tracking Template"
                initialValue="Your order is out for delivery. Track your order: {trackingUrl}"
              >
                <TextArea rows={3} />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={() => handleSaveTemplate('Order Tracking')}
                >
                  Save Template
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card title="Delivery Confirmation Template">
            <Form form={templateForm} layout="vertical">
              <Form.Item
                name="deliveryConfirmation"
                label="Delivery Confirmation Template"
                initialValue="Your order has been delivered successfully. Thank you for your business!"
              >
                <TextArea rows={3} />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={() => handleSaveTemplate('Delivery Confirmation')}
                >
                  Save Template
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </div>
      ),
    },
  ]

  return (
    <div>
      <Breadcrumbs />
      <Title level={2}>Settings</Title>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems}
        style={{ marginTop: 24 }}
      />

      {/* User Management Modal */}
      <Modal
        title={selectedUser ? 'Edit User' : 'Create User'}
        open={userModalVisible}
        onOk={selectedUser ? handleUpdateUser : handleCreateUser}
        onCancel={() => {
          setUserModalVisible(false)
          userForm.resetFields()
          setSelectedUser(null)
        }}
        width={600}
        confirmLoading={submitLoading}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={userForm} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input type="email" />
          </Form.Item>
          <PhoneInput countryCodeName="mobileCountryCode" numberName="mobileNumber" label="Mobile Number" required />
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            {selectedUser?.role === 'superadmin' ? (
              <Input disabled value="Super Admin" />
            ) : (
              <Select>
                <Option value="admin">Admin</Option>
                <Option value="executive">Executive Agent</Option>
                <Option value="billing">Billing Agent</Option>
                <Option value="warehouse">Warehouse & Delivery Agent</Option>
              </Select>
            )}
          </Form.Item>
          {!selectedUser && (
            <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Password is required' }]}>
              <Input.Password placeholder="Set password for new user" />
            </Form.Item>
          )}
          {selectedUser && (
            <>
              <Form.Item name="newPassword" label="New password">
                <Input.Password placeholder="Leave blank to keep current password" />
              </Form.Item>
              <Form.Item
                name="confirmNewPassword"
                label="Confirm new password"
                dependencies={['newPassword']}
                rules={[
                  {
                    validator: (_, value) => {
                      const newPwd = (userForm.getFieldValue('newPassword') || '').trim()
                      const confirm = (value || '').trim()
                      if (confirm && !newPwd) return Promise.reject(new Error('Enter new password above'))
                      if (newPwd && confirm && newPwd !== confirm) return Promise.reject(new Error('Passwords do not match'))
                      return Promise.resolve()
                    },
                  },
                ]}
              >
                <Input.Password placeholder="Confirm new password" />
              </Form.Item>
            </>
          )}
          <Form.Item name="status" label="Status">
            {selectedUser?.role === 'superadmin' ? (
              <Input disabled value={selectedUser?.status === 'inactive' ? 'Inactive' : 'Active'} />
            ) : (
              <Select>
                <Option value="active">Active</Option>
                <Option value="inactive">Inactive</Option>
              </Select>
            )}
          </Form.Item>
        </Form>
      </Modal>

    </div>
  )
}

export default Settings
