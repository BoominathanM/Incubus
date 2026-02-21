import React, { useState } from 'react'
import { Form, Input, Button, Card, message } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Login.css'

const Login = () => {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form] = Form.useForm()

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

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Sign In
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default Login
