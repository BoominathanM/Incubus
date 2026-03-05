import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Card, Statistic, DatePicker, Space, Typography, Empty } from 'antd'
import {
  UserOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  CarOutlined,
} from '@ant-design/icons'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import Breadcrumbs from '../../components/Breadcrumbs'
import dayjs from 'dayjs'
import { useGetRetailerStatsQuery } from '../../store/api/retailerApi'
import { useGetOrderStatsQuery, useGetOrderStatsByDateQuery } from '../../store/api/orderApi'

const { RangePicker } = DatePicker
const { Title } = Typography

const RETAILER_PIE_COLORS = ['#52c41a', '#faad14', '#ff4d4f']

const AdminDashboard = () => {
  const navigate = useNavigate()
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()])
  const { data: statsData } = useGetRetailerStatsQuery()
  const s = statsData?.stats ?? {}

  const rangeLabel = dateRange?.[0] && dateRange?.[1]
    ? `${dateRange[0].format('DD/MM/YYYY')} - ${dateRange[1].format('DD/MM/YYYY')}`
    : 'All Time'

  const dateParams = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) return {}
    return {
      startDate: dateRange[0].startOf('day').toISOString(),
      endDate: dateRange[1].endOf('day').toISOString(),
    }
  }, [dateRange])

  const { data: orderStatsData, isLoading: statsLoading } = useGetOrderStatsQuery(dateParams)
  const os = orderStatsData?.data ?? {}

  const { data: orderStatsByDateData } = useGetOrderStatsByDateQuery(
    { ...dateParams, group: 'day' },
    { refetchOnMountOrArgChange: 60 }
  )

  // Line chart — orders per day (total/pending/completed)
  const ordersLineData = useMemo(() => {
    const rows = orderStatsByDateData?.data || []
    return rows.map((r) => ({
      date: dayjs(r.date).format('DD MMM'),
      total: Number(r.total) || 0,
      pending: Number(r.pending) || 0,
      completed: Number(r.completed) || 0,
    }))
  }, [orderStatsByDateData])

  // Pie chart — retailer status breakdown
  const retailerPieData = useMemo(() => [
    { name: 'Onboarded', value: Number(s.onboarded) || 0, color: '#52c41a' },
    { name: 'Pending', value: Number(s.pendingApprovals) || 0, color: '#faad14' },
    { name: 'Rejected', value: Number(s.rejectedTotal) || 0, color: '#ff4d4f' },
  ].filter((d) => d.value > 0), [s])

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

      {/* Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={`Orders by Date (${rangeLabel})`}>
            {ordersLineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={ordersLineData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#15B9A4" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="pending" name="Pending" stroke="#faad14" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="completed" name="Completed" stroke="#52c41a" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="No order data for selected period" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Retailer Status Breakdown">
            {retailerPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={retailerPieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine
                  >
                    {retailerPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="No retailer data" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default AdminDashboard
