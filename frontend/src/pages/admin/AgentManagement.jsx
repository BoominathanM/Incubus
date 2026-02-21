import React, { useState } from 'react'
import { Table, Tag, Button, Space, Input, Modal, Form, Select, message, Typography } from 'antd'
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
} from '@ant-design/icons'

const { Title } = Typography
const { Option } = Select

// Backend uses active/inactive; display as Active/Inactive
const statusDisplay = (s) => (s === 'active' ? 'Active' : 'Inactive')
const ROLE_LABELS = { admin: 'Admin', executive: 'Executive Agent', billing: 'Billing Agent', warehouse: 'Warehouse & Delivery Agent', superadmin: 'Super Admin' }

const AgentManagement = () => {
  const { user: currentUser } = useAuth()
  const [userModalVisible, setUserModalVisible] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [userForm] = Form.useForm()
  const [searchText, setSearchText] = useState('')

  const { data: usersResponse, isLoading: loading, refetch: refetchUsers } = useGetUsersQuery()
  const [createUser, { isLoading: createLoading }] = useCreateUserMutation()
  const [updateUser, { isLoading: updateLoading }] = useUpdateUserMutation()
  const [updateUserStatus] = useUpdateUserStatusMutation()
  const [deleteUser] = useDeleteUserMutation()

  const users = (usersResponse?.users || []).map((u) => ({ ...u, key: u.id || u._id }))
  const submitLoading = createLoading || updateLoading

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
      render: (_, record) => {
        const isSuperAdminUser = record.role === 'superadmin'
        const canManageSuperAdmin = currentUser?.role === 'superadmin'
        const canEdit = canManageSuperAdmin || !isSuperAdminUser
        const showDeactivateActivateDelete = !isSuperAdminUser
        return (
          <Space wrap>
            <Button
              icon={<EditOutlined />}
              disabled={!canEdit}
              onClick={() => {
                setSelectedUser(record)
                const mobileStr = record.phone || record.mobile || ''
                const match = mobileStr.match(/^(\+\d+)\s*(.*)$/)
                const values = {
                  ...record,
                  status: record.status === 'active' ? 'active' : 'inactive',
                  mobileCountryCode: record.mobileCountryCode ?? match?.[1] ?? '+91',
                  mobileNumber: record.mobileNumber ?? match?.[2] ?? mobileStr.replace(/^\+\d+\s*/, ''),
                }
                userForm.setFieldsValue(values)
                setUserModalVisible(true)
              }}
            >
              Edit
            </Button>
            {showDeactivateActivateDelete && (
              record.status === 'active' ? (
                <Button danger disabled={!canEdit} onClick={() => handleDeactivateUser(record)}>
                  Deactivate
                </Button>
              ) : (
                <Button type="primary" disabled={!canEdit} onClick={() => handleActivateUser(record)}>
                  Activate
                </Button>
              )
            )}
            {showDeactivateActivateDelete && (
              <Button danger icon={<DeleteOutlined />} disabled={!canEdit} onClick={() => handleDeleteUser(record)}>
                Delete
              </Button>
            )}
          </Space>
        )
      },
    },
  ]

  const filteredUsers = searchText
    ? users.filter(
        (u) =>
          (u.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
          (u.email || '').toLowerCase().includes(searchText.toLowerCase())
      )
    : users

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

  const handleDeactivateUser = async (record) => {
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
  }

  const buildPayload = (values, isEdit = false) => {
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

  const handleCreateUser = () => {
    userForm.validateFields().then(async (values) => {
      try {
        const payload = { ...buildPayload(values), password: values.password }
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
        const payload = buildPayload(values, true)
        const res = await updateUser({ id: selectedUser.id || selectedUser._id, ...payload }).unwrap()
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

  return (
    <div>
      <Breadcrumbs />
      <Title level={2}>Agent Management</Title>
      <div style={{ marginTop: 24 }}>
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
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: '100%', maxWidth: 300, minWidth: 200 }}
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
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </div>

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

export default AgentManagement
