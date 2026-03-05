import React, { useState, useMemo } from 'react'
import { Row, Col, Card, Statistic, Typography, Select, Space, DatePicker } from 'antd'
import {
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import Breadcrumbs from '../../components/Breadcrumbs'
import dayjs from 'dayjs'
import { useGetRetailerStatsQuery, useGetRetailerStatsByDateQuery } from '../../store/api/retailerApi'

const { Title } = Typography
const { RangePicker } = DatePicker

const CHART_COLORS = {
  requestsRaised: '#15B9A4',
  onboarded: '#52c41a',
  pendingApprovals: '#faad14',
  rejectedTotal: '#ff4d4f',
}

const ExecutiveDashboard = () => {
  const [dateGroup, setDateGroup] = useState('day')
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs()])
  const { data: statsData } = useGetRetailerStatsQuery()

  const dateParams = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) return {}
    return {
      startDate: dateRange[0].startOf('day').toISOString(),
      endDate: dateRange[1].endOf('day').toISOString(),
    }
  }, [dateRange])

  const { data: byDateData } = useGetRetailerStatsByDateQuery({ group: dateGroup, ...dateParams })
  const s = statsData?.stats ?? {}
  const timeSeriesData = byDateData?.data ?? []

  const requestsRaised = Number(s.requestsRaised) || 0
  const onboarded = Number(s.onboarded) || 0
  const pendingApprovals = Number(s.pendingApprovals) || 0
  const rejectedTotal = Number(s.rejectedTotal) || 0

  const stats = [
    { title: 'Wholesaler Requests Raised', value: s.requestsRaised ?? '—', icon: <UserOutlined />, color: CHART_COLORS.requestsRaised },
    { title: 'Wholesalers Onboarded', value: s.onboarded ?? '—', icon: <CheckCircleOutlined />, color: CHART_COLORS.onboarded },
    { title: 'Pending Approval Requests', value: s.pendingApprovals ?? '—', icon: <ClockCircleOutlined />, color: CHART_COLORS.pendingApprovals },
    { title: 'Rejected', value: s.rejectedTotal ?? '—', icon: <CloseCircleOutlined />, color: CHART_COLORS.rejectedTotal },
  ]

  const xKey = dateGroup === 'month' ? 'month' : 'date'
  const chartData = timeSeriesData.map((d) => ({
    ...d,
    label: d[xKey],
    count: Number(d.count) || 0,
    requests: Number(d.requests ?? d.count) || 0,
    onboarded: Number(d.onboarded) || 0,
    rejected: Number(d.rejected) || 0,
  }))

  const pieData = [
    { name: 'Requests Raised', value: requestsRaised, color: CHART_COLORS.requestsRaised },
    { name: 'Onboarded', value: onboarded, color: CHART_COLORS.onboarded },
    { name: 'Pending', value: pendingApprovals, color: CHART_COLORS.pendingApprovals },
    { name: 'Rejected', value: rejectedTotal, color: CHART_COLORS.rejectedTotal },
  ].filter((d) => d.value > 0)

  const hasTimeSeriesData = chartData.length > 0 && chartData.some((d) => (d.requests + d.onboarded + d.rejected) > 0)

  const rangeLabel = dateRange?.[0] && dateRange?.[1]
    ? `${dateRange[0].format('DD/MM/YYYY')} - ${dateRange[1].format('DD/MM/YYYY')}`
    : 'All Time'

  return (
    <div>
      <Breadcrumbs />
      <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={2} style={{ margin: 0 }}>Executive Agent Dashboard</Title>
        <RangePicker value={dateRange} onChange={setDateRange} format="DD/MM/YYYY" allowClear />
      </Space>

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

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={`Requests by date / month (${rangeLabel})`}
            extra={
              <Select
                value={dateGroup}
                onChange={setDateGroup}
                options={[
                  { value: 'day', label: 'Last 30 days' },
                  { value: 'month', label: 'Last 12 months' },
                ]}
                style={{ width: 140 }}
              />
            }
            style={{ height: '100%' }}
          >
            {hasTimeSeriesData ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip labelFormatter={(label) => `Period: ${label}`} />
                  <Line type="monotone" dataKey="requests" name="Requests" stroke={CHART_COLORS.requestsRaised} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="onboarded" name="Onboarded" stroke={CHART_COLORS.onboarded} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="rejected" name="Rejected" stroke={CHART_COLORS.rejectedTotal} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                No data for selected period
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Requests breakdown (Donut)" style={{ height: '100%' }}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                No data yet
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default ExecutiveDashboard
