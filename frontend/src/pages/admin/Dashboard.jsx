import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Statistic, Table, DatePicker, Space, Typography } from 'antd'
import {
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  FileTextOutlined,
  TruckOutlined,
  CarOutlined,
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { Title } = Typography

const AdminDashboard = () => {
  const navigate = useNavigate()
  const [dateRange, setDateRange] = useState([dayjs().subtract(7, 'day'), dayjs()])

  // Derive mock values from date range (UI only - days in range used to vary numbers)
  const rangeDays = dateRange?.[0] && dateRange?.[1] ? dateRange[1].diff(dateRange[0], 'day') + 1 : 7
  const rangeLabel = dateRange?.[0] && dateRange?.[1]
    ? `${dateRange[0].format('DD/MM/YYYY')} - ${dateRange[1].format('DD/MM/YYYY')}`
    : 'Select range'

  const vendorStats = [
    { title: 'Active Retailers', value: Math.max(200, 245 - rangeDays * 2), icon: <UserOutlined />, color: '#15B9A4' },
    { title: 'Pending Approvals', value: Math.min(20, 12 + Math.floor(rangeDays / 2)), icon: <ClockCircleOutlined />, color: '#faad14' },
    { title: 'Approved Today', value: 8 + (rangeDays > 7 ? 2 : 0), icon: <CheckCircleOutlined />, color: '#52c41a' },
    { title: 'Rejected Today', value: Math.max(0, 2 - Math.floor(rangeDays / 10)), icon: <CloseCircleOutlined />, color: '#ff4d4f' },
  ]

  const orderStats = [
    { title: 'Total Orders', value: 480 + rangeDays * 3, icon: <ShoppingCartOutlined />, color: '#15B9A4' },
    { title: 'Completed Orders', value: 320 + rangeDays * 2, icon: <CheckCircleOutlined />, color: '#52c41a', path: '/admin/orders?tab=completed' },
    { title: 'Pending Orders', value: Math.max(10, 62 - rangeDays), icon: <CarOutlined />, color: '#faad14', path: '/admin/orders?tab=pending' },
    { title: 'Total Revenue', value: `₹${(1245890 + rangeDays * 5000).toLocaleString('en-IN')}`, icon: <DollarOutlined />, color: '#15B9A4' },
  ]

  const recentOrdersColumns = [
    { title: 'Order ID', dataIndex: 'orderId', key: 'orderId' },
    { title: 'Retailer', dataIndex: 'retailer', key: 'retailer' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount' },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    { title: 'Date', dataIndex: 'date', key: 'date' },
  ]

  const allRecentOrders = [
    { key: '1', orderId: 'ORD-001', retailer: 'ABC Store', amount: '₹15,000', status: 'In Process', date: '2024-01-15' },
    { key: '2', orderId: 'ORD-002', retailer: 'XYZ Mart', amount: '₹22,500', status: 'Billing', date: '2024-01-15' },
    { key: '3', orderId: 'ORD-003', retailer: 'Super Shop', amount: '₹8,900', status: 'Dispatched', date: '2024-01-14' },
    { key: '4', orderId: 'ORD-004', retailer: 'Metro Retail', amount: '₹18,200', status: 'Delivered', date: '2024-01-13' },
    { key: '5', orderId: 'ORD-005', retailer: 'Quick Mart', amount: '₹9,500', status: 'In Process', date: '2024-01-12' },
  ]
  const recentOrders = dateRange?.[0] && dateRange?.[1]
    ? allRecentOrders.filter((o) => {
        const d = dayjs(o.date)
        return !d.isBefore(dateRange[0], 'day') && !d.isAfter(dateRange[1], 'day')
      })
    : allRecentOrders

  return (
    <div>
      <Breadcrumbs />
      <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={2}>Admin Dashboard</Title>
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={setDateRange}
            format="DD/MM/YYYY"
          />
          <Typography.Text type="secondary">Data for selected date range</Typography.Text>
        </Space>
      </Space>

      <Title level={4} style={{ marginBottom: 16 }}>Vendor Overview ({rangeLabel})</Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {vendorStats.map((stat, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <Card>
              <Statistic
                title={stat.title}
                value={stat.value}
                prefix={React.cloneElement(stat.icon, { style: { color: stat.color } })}
                valueStyle={{ color: stat.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Title level={4} style={{ marginBottom: 16 }}>Order & Revenue Summary ({rangeLabel})</Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {orderStats.map((stat, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <Card
              onClick={stat.path ? () => navigate(stat.path) : undefined}
              style={stat.path ? { cursor: 'pointer' } : undefined}
            >
              <Statistic
                title={stat.title}
                value={stat.value}
                prefix={React.cloneElement(stat.icon, { style: { color: stat.color } })}
                valueStyle={{ color: stat.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card title={`Recent Orders (${rangeLabel})`} style={{ marginTop: 24 }}>
        <Table
          columns={recentOrdersColumns}
          dataSource={recentOrders}
          pagination={false}
          size="middle"
        />
      </Card>
    </div>
  )
}

export default AdminDashboard
