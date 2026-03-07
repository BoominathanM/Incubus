import React, { useState } from 'react'
import { Form, Input, Button, Card, message, Modal } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { getApiBase } from '../utils/api'
import './Login.css'

const Login = () => {
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form] = Form.useForm()
  const [resetForm] = Form.useForm()

  const onFinish = async (values) => {
    setLoading(true)
    const result = await login(values.email, values.password)
    setLoading(false)

    if (result.success) {
      message.success('Login successful!')
      navigate('/', { replace: true })
    } else {
      message.error(result.message || 'Invalid credentials')
    }
  }

  const openResetModal = async () => {
    const email = form.getFieldValue('email')
    setResetModalOpen(true)
    resetForm.setFieldsValue({ email: email || '' })
  }

  const handleResetPassword = async () => {
    try {
      const values = await resetForm.validateFields()
      setResetLoading(true)
      const { data } = await axios.post(`${getApiBase()}/api/auth/change-password-by-email`, {
        email: values.email?.trim()?.toLowerCase(),
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        confirmNewPassword: values.confirmNewPassword,
      })
      if (data?.success) {
        message.success(data.message || 'Password changed successfully')
        setResetModalOpen(false)
        resetForm.resetFields()
      } else {
        message.error(data?.message || 'Failed to change password')
      }
    } catch (err) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.message || err?.message || 'Failed to change password')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="login-container">
      <Card className="login-card">
        <div className="login-header">
          <img 
            src="/Gadgets logo.png" 
            alt="Logo" 
            style={{ 
              maxWidth: '200px', 
              height: 'auto',
              marginBottom: '24px',
              objectFit: 'contain'
            }} 
          />
          <p>Sign in to your account</p>
        </div>
        <Form
          form={form}
          name="login"
          onFinish={onFinish}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Please input your email!' },
              { type: 'email', message: 'Please enter a valid email!' }
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Email"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
            />
          </Form.Item>

          <Form.Item style={{ marginTop: -12, marginBottom: 16, textAlign: 'right' }}>
            <Button type="link" onClick={openResetModal} style={{ padding: 0, height: 'auto' }}>
              Forgot Password?
            </Button>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <Modal
        title="Change Password"
        open={resetModalOpen}
        onOk={handleResetPassword}
        onCancel={() => {
          setResetModalOpen(false)
          resetForm.resetFields()
        }}
        confirmLoading={resetLoading}
        okText="Update Password"
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please input your email!' },
              { type: 'email', message: 'Please enter a valid email!' },
            ]}
          >
            <Input placeholder="Email" />
          </Form.Item>
          <Form.Item
            name="currentPassword"
            label="Current Password"
            rules={[{ required: true, message: 'Please input current password!' }]}
          >
            <Input.Password placeholder="Current password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="New Password"
            rules={[{ required: true, message: 'Please input new password!' }]}
          >
            <Input.Password placeholder="New password" />
          </Form.Item>
          <Form.Item
            name="confirmNewPassword"
            label="Confirm New Password"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Please confirm your new password!' },
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
        </Form>
      </Modal>
    </div>
  )
}

export default Login
