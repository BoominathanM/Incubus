import React, { useState } from 'react'
import { List, Badge, Tag, Button, Space, Input, Empty, Typography } from 'antd'
import { SearchOutlined, BellOutlined } from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'
import {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useDeleteNotificationMutation,
  useClearAllNotificationsMutation,
} from '../../store/api/notificationApi'
import { NOTIFICATION_POLLING_OPTIONS } from '../../store/api/queryOptions'

const { Title } = Typography

const TYPE_COLORS = {
  order: '#15B9A4',
  payment: '#faad14',
  retailer: '#6754A3',
  billing: '#1890ff',
  delivery: '#52c41a',
  retailer_webhook: '#6754A3',
  retailer_executive: '#722ed1',
  retailer_approve: '#52c41a',
  retailer_reject: '#ff4d4f',
  order_webhook: '#15B9A4',
  retailer_webhook_executive: '#722ed1',
  order_new: '#1890ff',
  billing_done: '#52c41a',
}

const Notifications = () => {
  const [searchText, setSearchText] = useState('')
  const { data, isLoading } = useGetNotificationsQuery(
    { page: 1, limit: 50 },
    NOTIFICATION_POLLING_OPTIONS
  )
  const [markRead] = useMarkNotificationReadMutation()
  const [markAllRead] = useMarkAllNotificationsReadMutation()
  const [deleteNotification] = useDeleteNotificationMutation()
  const [clearAll] = useClearAllNotificationsMutation()

  const notifications = data?.data?.notifications ?? []
  const filtered = searchText.trim()
    ? notifications.filter(
        (n) =>
          (n.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
          (n.description || '').toLowerCase().includes(searchText.toLowerCase())
      )
    : notifications

  const handleMarkAsRead = async (notification) => {
    try {
      await markRead(notification._id).unwrap()
    } catch (e) {
      // ignore
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await markAllRead().unwrap()
    } catch (e) {
      // ignore
    }
  }

  const handleDeleteNotification = async (notification) => {
    try {
      await deleteNotification(notification._id).unwrap()
    } catch (e) {
      // ignore
    }
  }

  const handleClearAll = async () => {
    try {
      await clearAll().unwrap()
    } catch (e) {
      // ignore
    }
  }

  return (
    <div>
      <Breadcrumbs />
      <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={2}>
          <BellOutlined /> Notifications
        </Title>
        <Space>
          <Button onClick={handleMarkAllAsRead} disabled={!notifications.some((n) => !n.read)}>
            Mark All as Read
          </Button>
          <Button danger onClick={handleClearAll} disabled={notifications.length === 0}>
            Clear All
          </Button>
        </Space>
      </Space>
      <Input
        placeholder="Search notifications"
        prefix={<SearchOutlined />}
        style={{ marginBottom: 16, maxWidth: 400 }}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        allowClear
      />
      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>
      ) : filtered.length > 0 ? (
        <List
          itemLayout="horizontal"
          dataSource={filtered}
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
                    <Tag
                      color={TYPE_COLORS[item.type] || '#15B9A4'}
                    >
                      {item.type?.replace(/_/g, ' ') || 'notification'}
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
