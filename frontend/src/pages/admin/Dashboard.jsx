import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Statistic, Table, DatePicker, Space, Typography } from 'antd'
import {
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  CarOutlined,
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'
import dayjs from 'dayjs'
import { useGetRetailerStatsQuery } from '../../store/api/retailerApi'
import { useGetOrderStatsQuery, useGetOrdersQuery } from '../../store/api/orderApi'

const { RangePicker } = DatePicker
const { Title } = Typography

const AdminDashboard = () => {
  const navigate = useNavigate()
  const [dateRange, setDateRange] = useState(null)
  const { data: statsData } = useGetRetailerStatsQuery()
  const s = statsData?.stats ?? {}

  const rangeLabel = dateRange?.[0] && dateRange?.[1]
    ? `${dateRange[0].format('DD/MM/YYYY')} - ${dateRange[1].format('DD/MM/YYYY')}`
    : 'All Time'

  // Build date params for stats & recent orders query
  const dateParams = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) return {}
    return {
      startDate: dateRange[0].startOf('day').toISOString(),
      endDate: dateRange[1].endOf('day').toISOString(),
    }
  }, [dateRange])

  const { data: orderStatsData, isLoading: statsLoading } = useGetOrderStatsQuery(dateParams)
  const os = orderStatsData?.data ?? {}

  const { data: recentData, isLoading: recentLoading } = useGetOrdersQuery(
    { ...dateParams, limit: 10 },
    { refetchOnMountOrArgChange: 60 }
  )
  const recentOrders = recentData?.data?.orders || []

  const vendorStats = [
    { title: 'Total Retailers', value: s.totalRetailers ?? '—', icon: <UserOutlined />, color: '#15B9A4' },
    { title: 'Pending Approvals', value: s.pendingApprovals ?? '—', icon: <ClockCircleOutlined />, color: '#faad14' },
    { title: 'Approved Today (by approval date)', value: s.approvedToday ?? '—', icon: <CheckCircleOutlined />, color: '#52c41a' },
    { title: 'Rejected Today', value: s.rejectedToday ?? '—', icon: <CloseCircleOutlined />, color: '#ff4d4f' },
  ]

  const orderStats = [
    {
      title: 'Total Orders',
      value: statsLoading ? '—' : (os.totalOrders ?? 0),
      icon: <ShoppingCartOutlined />,
      color: '#15B9A4',
    },
    {
      title: 'Completed Orders',
      value: statsLoading ? '—' : (os.completedOrders ?? 0),
      icon: <CheckCircleOutlined />,
      color: '#52c41a',
      path: '/admin/orders?tab=completed',
    },
    {
      title: 'Pending Orders',
      value: statsLoading ? '—' : (os.pendingOrders ?? 0),
      icon: <CarOutlined />,
      color: '#faad14',
      path: '/admin/orders?tab=pending',
    },
    {
      title: 'Total Revenue',
      value: statsLoading ? '—' : `₹${(os.totalRevenue ?? 0).toLocaleString('en-IN')}`,
      icon: <DollarOutlined />,
      color: '#15B9A4',
    },
  ]

  const recentOrdersColumns = [
    { title: 'Order ID', dataIndex: 'orderId', key: 'orderId', render: (v) => <strong>{v}</strong> },
    {
      title: 'Name',
      key: 'name',
      render: (_, r) => r.contactName || r.fromName || r.retailer?.businessName || '-',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (v) => `₹${(v || 0).toLocaleString('en-IN')}`,
    },
    {
      title: 'Payment Status',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      render: (v) => v || 'Pending',
    },
    {
      title: 'Final Status',
      dataIndex: 'finalStatus',
      key: 'finalStatus',
      render: (v) => v || 'Open',
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v) => (v ? dayjs(v).format('DD/MM/YYYY') : '-'),
    },
  ]

  return (
    <div>
      <Breadcrumbs />
      <Title level={2} style={{ marginBottom: 24 }}>Admin Dashboard</Title>

      <Title level={4} style={{ marginBottom: 16 }}>Retailer Overview</Title>
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

      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={4} style={{ margin: 0 }}>Order & Revenue Summary ({rangeLabel})</Title>
        <RangePicker value={dateRange} onChange={setDateRange} format="DD/MM/YYYY" allowClear />
      </Space>
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
          dataSource={recentOrders.map((o) => ({ ...o, key: o._id }))}
          loading={recentLoading}
          pagination={false}
          size="middle"
          onRow={(record) => ({
            onClick: () => navigate(`/admin/orders/${record.orderId}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  )
}

export default AdminDashboard
