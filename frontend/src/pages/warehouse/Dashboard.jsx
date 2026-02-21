import React, { useState } from 'react'
import { Row, Col, Card, Statistic, Typography, DatePicker, Space } from 'antd'
import {
  ShoppingCartOutlined,
  CheckCircleOutlined,
  CarOutlined,
  TruckOutlined,
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'
import dayjs from 'dayjs'

const { Title } = Typography
const { RangePicker } = DatePicker

const WarehouseDashboard = () => {
  const [dateRange, setDateRange] = useState([dayjs().subtract(7, 'day'), dayjs()])

  const stats = [
    {
      title: 'Total Orders Processed',
      value: 342,
      icon: <ShoppingCartOutlined />,
      color: '#15B9A4',
    },
    {
      title: 'Orders Ready for Dispatch',
      value: 28,
      icon: <CheckCircleOutlined />,
      color: '#52c41a',
    },
    {
      title: 'Orders in Transit',
      value: 45,
      icon: <CarOutlined />,
      color: '#1890ff',
    },
    {
      title: 'Orders Delivered',
      value: 269,
      icon: <TruckOutlined />,
      color: '#15B9A4',
    },
  ]

  return (
    <div>
      <Breadcrumbs />
      <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={2}>Warehouse & Delivery Dashboard</Title>
        <RangePicker
          value={dateRange}
          onChange={setDateRange}
          format="DD/MM/YYYY"
        />
      </Space>
      <Row gutter={[16, 16]}>
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

export default WarehouseDashboard
