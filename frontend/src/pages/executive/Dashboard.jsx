import React from 'react'
import { Row, Col, Card, Statistic, Typography } from 'antd'
import {
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'

const { Title } = Typography

const ExecutiveDashboard = () => {
  const stats = [
    {
      title: 'Wholesaler Requests Raised',
      value: 45,
      icon: <UserOutlined />,
      color: '#15B9A4',
    },
    {
      title: 'Wholesalers Onboarded',
      value: 38,
      icon: <CheckCircleOutlined />,
      color: '#52c41a',
    },
    {
      title: 'Pending Approval Requests',
      value: 7,
      icon: <ClockCircleOutlined />,
      color: '#faad14',
    },
  ]

  return (
    <div>
      <Breadcrumbs />
      <Title level={2}>Executive Agent Dashboard</Title>
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        {stats.map((stat, index) => (
          <Col xs={24} sm={12} lg={8} key={index}>
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
