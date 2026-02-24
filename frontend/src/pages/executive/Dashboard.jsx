import React, { useState } from 'react'
import { Row, Col, Card, Statistic, Typography, Select } from 'antd'
import {
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import {
  AreaChart,
  Area,
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
import { useGetRetailerStatsQuery, useGetRetailerStatsByDateQuery } from '../../store/api/retailerApi'

const { Title } = Typography

const CHART_COLORS = {
  requestsRaised: '#15B9A4',
  onboarded: '#52c41a',
  pendingApprovals: '#faad14',
  rejectedTotal: '#ff4d4f',
}

const AREA_COLOR = '#15B9A4'

const ExecutiveDashboard = () => {
  const [dateGroup, setDateGroup] = useState('day')
  const { data: statsData } = useGetRetailerStatsQuery()
  const { data: byDateData } = useGetRetailerStatsByDateQuery({ group: dateGroup })
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
    count: d.count,
  }))

  const pieData = [
    { name: 'Requests Raised', value: requestsRaised, color: CHART_COLORS.requestsRaised },
    { name: 'Onboarded', value: onboarded, color: CHART_COLORS.onboarded },
    { name: 'Pending', value: pendingApprovals, color: CHART_COLORS.pendingApprovals },
    { name: 'Rejected', value: rejectedTotal, color: CHART_COLORS.rejectedTotal },
  ].filter((d) => d.value > 0)

  const hasTimeSeriesData = chartData.length > 0 && chartData.some((d) => d.count > 0)

  return (
    <div>
      <Breadcrumbs />
      <Title level={2}>Executive Agent Dashboard</Title>
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
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

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            title="Requests by date / month (Area)"
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
                <AreaChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => [value, 'Requests']} labelFormatter={(label) => `Period: ${label}`} />
                  <Area type="monotone" dataKey="count" name="Requests" stroke={AREA_COLOR} fill={AREA_COLOR} fillOpacity={0.4} strokeWidth={2} />
                </AreaChart>
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
