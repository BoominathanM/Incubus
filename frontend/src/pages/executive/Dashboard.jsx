import React from 'react'
import { Row, Col, Card, Statistic, Typography } from 'antd'
import {
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'
import { useGetRetailerStatsQuery } from '../../store/api/retailerApi'

const { Title } = Typography

const ExecutiveDashboard = () => {
  const { data: statsData } = useGetRetailerStatsQuery()
  const s = statsData?.stats ?? {}

  const stats = [
    { title: 'Wholesaler Requests Raised', value: s.requestsRaised ?? '—', icon: <UserOutlined />, color: '#15B9A4' },
    { title: 'Wholesalers Onboarded', value: s.onboarded ?? '—', icon: <CheckCircleOutlined />, color: '#52c41a' },
    { title: 'Pending Approval Requests', value: s.pendingApprovals ?? '—', icon: <ClockCircleOutlined />, color: '#faad14' },
    { title: 'Rejected', value: s.rejectedTotal ?? '—', icon: <CloseCircleOutlined />, color: '#ff4d4f' },
  ]

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
    </div>
  )
}

export default ExecutiveDashboard
