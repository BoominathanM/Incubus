import React, { useState } from 'react'
import { List, Badge, Tag, Button, Space, Input, Empty, Typography } from 'antd'
import { SearchOutlined, BellOutlined } from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'

const { Title } = Typography

const Notifications = () => {
  const [notifications, setNotifications] = useState([
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
    {
      key: '6',
      title: 'New Order Received',
      description: 'Order ORD-005 has been placed by Super Shop',
      time: '4 hours ago',
      type: 'order',
      read: true,
    },
    {
      key: '7',
      title: 'Billing Invoice Generated',
      description: 'Invoice INV-001 has been generated for Order ORD-001',
      time: '5 hours ago',
      type: 'billing',
      read: true,
    },
  ])

  const handleMarkAsRead = (notification) => {
    setNotifications(notifications.map(n => 
      n.key === notification.key ? { ...n, read: true } : n
    ))
  }

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  const handleDeleteNotification = (notification) => {
    setNotifications(notifications.filter(n => n.key !== notification.key))
  }

  const handleClearAll = () => {
    setNotifications([])
  }

  return (
    <div>
      <Breadcrumbs />
      <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={2}>
          <BellOutlined /> Notifications
        </Title>
        <Space>
          <Button onClick={handleMarkAllAsRead}>
            Mark All as Read
          </Button>
          <Button danger onClick={handleClearAll}>
            Clear All
          </Button>
        </Space>
      </Space>
      <Input
        placeholder="Search notifications"
        prefix={<SearchOutlined />}
        style={{ marginBottom: 16, maxWidth: 400 }}
      />
      {notifications.length > 0 ? (
        <List
          itemLayout="horizontal"
          dataSource={notifications}
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
                      item.type === 'billing' ? '#1890ff' :
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
  )
}

export default Notifications
