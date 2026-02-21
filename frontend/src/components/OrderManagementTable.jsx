import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Table, Tag, Button, Space, message, Input, DatePicker } from 'antd'
import { EyeOutlined, ExportOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import './OrderDetail.css'

const { RangePicker } = DatePicker

const defaultMockOrders = [
  { key: '1', orderId: 'ORD-001', name: 'ABC Store', isReseller: true, amount: '15,000', paymentStatus: 'Success', billingVerified: true, billingStatus: 'Completed', warehouseStatus: 'Ready', dispatchStatus: 'Dispatched', deliveryStatus: 'In Transit', finalStatus: 'Open', date: '2024-01-15', createdAt: '2024-01-15 10:00 AM' },
  { key: '2', orderId: 'ORD-002', name: 'XYZ Mart', isReseller: false, amount: '22,500', paymentStatus: 'Success', billingVerified: false, billingStatus: 'Pending', warehouseStatus: '-', dispatchStatus: '-', deliveryStatus: '-', finalStatus: 'Open', date: '2024-01-15', createdAt: '2024-01-15 09:30 AM' },
  { key: '3', orderId: 'ORD-003', name: 'Super Shop', isReseller: true, amount: '8,900', paymentStatus: 'Success', billingVerified: true, billingStatus: 'Completed', warehouseStatus: 'Preparing', dispatchStatus: '-', deliveryStatus: '-', finalStatus: 'Open', date: '2024-01-14', createdAt: '2024-01-14 02:20 PM' },
]

/**
 * Order management table for dashboard - same UI as admin order list.
 * @param {string} detailPathPrefix - e.g. '/billing' -> links to /billing/orders/:id
 * @param {Array} dataSource - optional, defaults to defaultMockOrders
 */
const OrderManagementTable = ({ detailPathPrefix, dataSource = defaultMockOrders }) => {
  const navigate = useNavigate()
  const detailPath = detailPathPrefix ? `${detailPathPrefix}/orders` : '/admin/orders'
  const [searchText, setSearchText] = useState('')
  const [dateRange, setDateRange] = useState(null)

  const filteredData = useMemo(() => {
    let list = Array.isArray(dataSource) ? [...dataSource] : [...defaultMockOrders]
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      list = list.filter(
        (r) =>
          (r.orderId && r.orderId.toLowerCase().includes(q)) ||
          (r.name && r.name.toLowerCase().includes(q))
      )
    }
    if (dateRange && dateRange[0] && dateRange[1]) {
      const start = dateRange[0].startOf('day')
      const end = dateRange[1].endOf('day')
      list = list.filter((r) => {
        const d = r.createdAt ? dayjs(r.createdAt) : (r.date ? dayjs(r.date) : null)
        return d && d.isValid() && !d.isBefore(start) && !d.isAfter(end)
      })
    }
    return list
  }, [dataSource, searchText, dateRange])

  const columns = [
    { title: 'Order ID', dataIndex: 'orderId', key: 'orderId', render: (t) => <strong>{t}</strong> },
    { title: 'Created At', dataIndex: 'createdAt', key: 'createdAt', render: (t, r) => t || (r.date ? dayjs(r.date).format('YYYY-MM-DD hh:mm A') : '-') },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'isReseller', key: 'type', render: (isReseller) => <Tag color={isReseller ? 'blue' : 'default'}>{isReseller ? 'Retailer' : 'End User'}</Tag> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (t) => <strong>₹{t}</strong> },
    { title: 'Payment Status', dataIndex: 'paymentStatus', key: 'paymentStatus', render: (s) => <Tag color={s === 'Success' ? 'green' : 'red'}>{s}</Tag> },
    { title: 'Billing Verification', dataIndex: 'billingVerified', key: 'billingVerified', render: (v) => <Tag color={v ? 'green' : 'orange'}>{v ? 'Yes' : 'No'}</Tag> },
    { title: 'Billing Status', dataIndex: 'billingStatus', key: 'billingStatus', render: (s) => <Tag color={s === 'Completed' ? 'green' : s === 'Pending' ? 'orange' : 'default'}>{s}</Tag> },
    { title: 'Warehouse Status', dataIndex: 'warehouseStatus', key: 'warehouseStatus', render: (s) => <Tag color={s === 'Ready' ? 'green' : s === 'Preparing' ? 'blue' : 'default'}>{s || '-'}</Tag> },
    { title: 'Dispatch Status', dataIndex: 'dispatchStatus', key: 'dispatchStatus', render: (s) => <Tag color={s === 'Dispatched' ? 'green' : 'default'}>{s || '-'}</Tag> },
    { title: 'Delivery Status', dataIndex: 'deliveryStatus', key: 'deliveryStatus', render: (s) => <Tag color={s === 'Delivered' ? 'green' : s === 'In Transit' ? 'blue' : 'default'}>{s || '-'}</Tag> },
    { title: 'Final Status', dataIndex: 'finalStatus', key: 'finalStatus', render: (s) => <Tag color={s === 'Closed' ? 'green' : 'blue'}>{s}</Tag> },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              navigate(`${detailPath}/${record.orderId}`)
            }}
          >
            View
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="Order Management"
      className="order-management-card"
      style={{ marginTop: 24 }}
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
          <RangePicker
            value={dateRange}
            onChange={setDateRange}
            allowClear
          />
          <Button icon={<ExportOutlined />} onClick={() => message.info('Export orders – connect to API')}>
            Export
          </Button>
        </Space>
      }
    >
      <div className="order-management-table-wrap">
        <Table
          columns={columns}
          dataSource={filteredData}
          pagination={{ pageSize: 10 }}
          onRow={(record) => ({
            onClick: (e) => {
              if (e.target.closest('button')) return
              navigate(`${detailPath}/${record.orderId}`)
            },
            style: { cursor: 'pointer' },
          })}
        />
      </div>
    </Card>
  )
}

export default OrderManagementTable
