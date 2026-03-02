import React, { useState, useMemo } from 'react'
import { Row, Col, Card, Statistic, Typography, DatePicker, Space, Empty } from 'antd'
import {
  ShoppingCartOutlined,
  CheckCircleOutlined,
  CarOutlined,
  TruckOutlined,
} from '@ant-design/icons'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import Breadcrumbs from '../../components/Breadcrumbs'
import dayjs from 'dayjs'
import { useGetOrderStatsQuery, useGetOrdersQuery } from '../../store/api/orderApi'

const { Title } = Typography
const { RangePicker } = DatePicker

const PIE_COLORS = ['#52c41a', '#1890ff', '#faad14', '#d9d9d9']

const WarehouseDashboard = () => {
  const [dateRange, setDateRange] = useState(null)

  const dateParams = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) return {}
    return {
      startDate: dateRange[0].startOf('day').toISOString(),
      endDate: dateRange[1].endOf('day').toISOString(),
    }
  }, [dateRange])

  const rangeLabel = dateRange?.[0] && dateRange?.[1]
    ? `${dateRange[0].format('DD/MM/YYYY')} - ${dateRange[1].format('DD/MM/YYYY')}`
    : 'All Time'

  const { data: statsData, isLoading } = useGetOrderStatsQuery(dateParams)
  const os = statsData?.data ?? {}

  const { data: ordersData } = useGetOrdersQuery(
    { ...dateParams, limit: 300 },
    { refetchOnMountOrArgChange: 60 }
  )
  const orders = ordersData?.data?.orders || []

  // Line chart — orders per day
  const barData = useMemo(() => {
    const dailyMap = {}
    orders.forEach((o) => {
      const key = dayjs(o.createdAt).format('YYYY-MM-DD')
      const label = dayjs(o.createdAt).format('DD MMM')
      if (!dailyMap[key]) dailyMap[key] = { date: label, Orders: 0 }
      dailyMap[key].Orders++
    })
    return Object.keys(dailyMap).sort().map((k) => dailyMap[k])
  }, [orders])

  // Pie chart — delivery status breakdown
  const pieData = useMemo(() => {
    const delivered = os.ordersDelivered ?? 0
    const inTransit = os.ordersInTransit ?? 0
    const readyForDispatch = os.ordersReadyForDispatch ?? 0
    const other = Math.max(0, (os.totalOrders ?? 0) - delivered - inTransit - readyForDispatch)
    return [
      { name: 'Delivered', value: delivered },
      { name: 'In Transit', value: inTransit },
      { name: 'Ready for Dispatch', value: readyForDispatch },
      { name: 'Pending', value: other },
    ].filter((d) => d.value > 0)
  }, [os])

  const stats = [
    {
      title: 'Total Orders',
      value: isLoading ? '—' : (os.totalOrders ?? 0),
      icon: <ShoppingCartOutlined />,
      color: '#15B9A4',
    },
    {
      title: 'Orders Ready for Dispatch',
      value: isLoading ? '—' : (os.ordersReadyForDispatch ?? 0),
      icon: <CheckCircleOutlined />,
      color: '#52c41a',
    },
    {
      title: 'Orders in Transit',
      value: isLoading ? '—' : (os.ordersInTransit ?? 0),
      icon: <CarOutlined />,
      color: '#1890ff',
    },
    {
      title: 'Orders Delivered',
      value: isLoading ? '—' : (os.ordersDelivered ?? 0),
      icon: <TruckOutlined />,
      color: '#15B9A4',
    },
  ]

  return (
    <div>
      <Breadcrumbs />
      <Title level={2} style={{ marginBottom: 24 }}>Warehouse & Delivery Dashboard</Title>

      {/* Stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {stats.map((stat, index) => (
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

      {/* Charts section */}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={4} style={{ margin: 0 }}>Delivery Analytics ({rangeLabel})</Title>
        <RangePicker value={dateRange} onChange={setDateRange} format="DD/MM/YYYY" allowClear />
      </Space>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Orders Per Day">
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={barData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="Orders" stroke="#1890ff" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="No order data" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Delivery Status Breakdown">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    labelLine
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="No delivery data" style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default WarehouseDashboard
