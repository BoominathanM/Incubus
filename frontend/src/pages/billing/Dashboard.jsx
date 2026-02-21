import React from 'react'
import { Row, Col, Card, Statistic, Typography } from 'antd'
import {
  ShoppingCartOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'

const { Title } = Typography

const BillingDashboard = () => {
  const stats = [
    {
      title: 'Total Orders (Paid)',
      value: 156,
      icon: <ShoppingCartOutlined />,
      color: '#15B9A4',
    },
    {
      title: 'Invoices Processed',
      value: 133,
      icon: <CheckCircleOutlined />,
      color: '#52c41a',
    },
    {
      title: 'Invoices Pending',
      value: 23,
      icon: <ClockCircleOutlined />,
      color: '#faad14',
    },
  ]

  return (
    <div>
      <Breadcrumbs />
      <Title level={2}>Billing Agent Dashboard</Title>
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

export default BillingDashboard
