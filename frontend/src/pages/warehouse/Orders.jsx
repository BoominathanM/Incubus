import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Button, Space, Input, DatePicker, Typography, Dropdown, Card } from 'antd'
import Breadcrumbs from '../../components/Breadcrumbs'
import { SearchOutlined, EyeOutlined, MoreOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useGetOrdersQuery } from '../../store/api/orderApi'

const { Title } = Typography
const { RangePicker } = DatePicker

const WarehouseOrders = () => {
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  const [dateRange, setDateRange] = useState(null)

  const queryParams = useMemo(
    () => ({
      ...(searchText.trim() ? { search: searchText.trim() } : {}),
      ...(dateRange?.[0] ? { startDate: dateRange[0].startOf('day').toISOString() } : {}),
      ...(dateRange?.[1] ? { endDate: dateRange[1].endOf('day').toISOString() } : {}),
      limit: 100,
    }),
    [searchText, dateRange]
  )

  const { data, isLoading, isFetching } = useGetOrdersQuery(queryParams, {
    refetchOnMountOrArgChange: 60,
  })
  const orders = data?.data?.orders || []

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD hh:mm A') : '-')

  const columns = [
    {
      title: 'Order ID',
      dataIndex: 'orderId',
      key: 'orderId',
      render: (t) => <strong>{t}</strong>,
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (t) => formatDate(t),
    },
    {
      title: 'Name',
      key: 'name',
      render: (_, r) => r.contactName || r.fromName || r.retailer?.businessName || '-',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type) => (
        <Tag color={type === 'retailer' ? 'blue' : 'default'}>
          {type === 'retailer' ? 'Retailer' : 'End User'}
        </Tag>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (v) => <strong>₹{(v || 0).toLocaleString()}</strong>,
    },
    {
      title: 'Billing Status',
      dataIndex: 'billingStatus',
      key: 'billingStatus',
      render: (s) => (
        <Tag color={s === 'Completed' ? 'green' : 'orange'}>{s || 'Pending'}</Tag>
      ),
    },
    {
      title: 'Warehouse Status',
      dataIndex: 'warehouseStatus',
      key: 'warehouseStatus',
      render: (s) => (
        <Tag color={s === 'Ready' ? 'green' : s === 'Preparing' ? 'blue' : 'default'}>{s || '-'}</Tag>
      ),
    },
    {
      title: 'Dispatch Status',
      dataIndex: 'dispatchStatus',
      key: 'dispatchStatus',
      render: (s) => <Tag color={s === 'Dispatched' ? 'green' : 'default'}>{s || '-'}</Tag>,
    },
    {
      title: 'Delivery Status',
      dataIndex: 'deliveryStatus',
      key: 'deliveryStatus',
      render: (s) => (
        <Tag color={s === 'Delivered' ? 'green' : s === 'In Transit' ? 'blue' : 'default'}>{s || '-'}</Tag>
      ),
    },
    {
      title: 'Final Status',
      dataIndex: 'finalStatus',
      key: 'finalStatus',
      render: (s) => <Tag color={s === 'Closed' ? 'green' : 'blue'}>{s || 'Open'}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 72,
      render: (_, record) => {
        const menuItems = [
          {
            key: 'view',
            icon: <EyeOutlined />,
            label: 'View',
            onClick: () => navigate(`/warehouse/orders/${record.orderId}`),
          },
        ]
        return (
          <Dropdown
            menu={{ items: menuItems }}
            trigger={['click']}
            placement="bottomRight"
            onClick={(e) => e.stopPropagation()}
          >
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        )
      },
    },
  ]

  return (
    <div>
      <Breadcrumbs />
      <Title level={2}>Order Management</Title>
      <Card
        extra={
          <Space wrap>
            <Input
              placeholder="Search by Order ID or Name"
              prefix={<SearchOutlined />}
              style={{ width: 260 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
            <RangePicker value={dateRange} onChange={setDateRange} allowClear />
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={orders.map((o) => ({ ...o, key: o._id }))}
          loading={isLoading || isFetching}
          pagination={{ pageSize: 10 }}
          onRow={(record) => ({
            onClick: () => navigate(`/warehouse/orders/${record.orderId}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  )
}

export default WarehouseOrders
