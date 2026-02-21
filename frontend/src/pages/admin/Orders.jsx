import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Tabs, Table, Tag, Button, Space, Input, Select, Typography, Modal, Form, InputNumber, DatePicker, message } from 'antd'
import Breadcrumbs from '../../components/Breadcrumbs'
import {
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title } = Typography
const { Option } = Select
const { RangePicker } = DatePicker

const TAB_KEYS = ['all', 'paid', 'pending', 'completed']

const AdminOrders = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(TAB_KEYS.includes(tabParam) ? tabParam : 'all')

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && TAB_KEYS.includes(tab)) setActiveTab(tab)
  }, [searchParams])

  const [selectedOrder, setSelectedOrder] = useState(null)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [updateModalVisible, setUpdateModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [searchText, setSearchText] = useState('')
  const [dateRange, setDateRange] = useState(null)

  const columns = [
    {
      title: 'Order ID',
      dataIndex: 'orderId',
      key: 'orderId',
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (t, r) => t || (r.date ? dayjs(r.date).format('YYYY-MM-DD hh:mm A') : '-'),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Type',
      dataIndex: 'isReseller',
      key: 'type',
      render: (isReseller) => (
        <Tag color={isReseller ? 'blue' : 'default'}>
          {isReseller ? 'Retailer' : 'End User'}
        </Tag>
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (text) => <strong>₹{text}</strong>,
    },
    {
      title: 'Payment Status',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      render: (status) => (
        <Tag color={status === 'Success' ? 'green' : 'red'}>{status}</Tag>
      ),
    },
    {
      title: 'Billing Verification',
      dataIndex: 'billingVerified',
      key: 'billingVerified',
      render: (v) => (
        <Tag color={v ? 'green' : 'orange'}>{v ? 'Yes' : 'No'}</Tag>
      ),
    },
    {
      title: 'Billing Status',
      dataIndex: 'billingStatus',
      key: 'billingStatus',
      render: (status) => (
        <Tag color={status === 'Completed' ? 'green' : status === 'Pending' ? 'orange' : 'default'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Warehouse Status',
      dataIndex: 'warehouseStatus',
      key: 'warehouseStatus',
      render: (status) => (
        <Tag color={status === 'Ready' ? 'green' : status === 'Preparing' ? 'blue' : 'default'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Dispatch Status',
      dataIndex: 'dispatchStatus',
      key: 'dispatchStatus',
      render: (status) => (
        <Tag color={status === 'Dispatched' ? 'green' : 'default'}>{status}</Tag>
      ),
    },
    {
      title: 'Delivery Status',
      dataIndex: 'deliveryStatus',
      key: 'deliveryStatus',
      render: (status) => (
        <Tag color={status === 'Delivered' ? 'green' : status === 'In Transit' ? 'blue' : 'default'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Final Status',
      dataIndex: 'finalStatus',
      key: 'finalStatus',
      render: (status) => (
        <Tag color={status === 'Closed' ? 'green' : 'blue'}>{status}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            icon={<EyeOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/admin/orders/${record.orderId}`)
            }}
          >
            View
          </Button>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedOrder(record)
              form.setFieldsValue(record)
              setUpdateModalVisible(true)
            }}
          >
            Update
          </Button>
        </Space>
      ),
    },
  ]

  const mockOrders = [
    {
      key: '1',
      orderId: 'ORD-001',
      name: 'ABC Store',
      isReseller: true,
      amount: '15,000',
      paymentStatus: 'Success',
      paymentMode: 'UPI',
      billingVerified: true,
      billingStatus: 'Completed',
      invoiceNumber: 'INV-001',
      warehouseStatus: 'Ready',
      dispatchStatus: 'Dispatched',
      deliveryStatus: 'In Transit',
      finalStatus: 'Open',
      date: '2024-01-15',
      createdAt: '2024-01-15 10:00 AM',
    },
    {
      key: '2',
      orderId: 'ORD-002',
      name: 'XYZ Mart',
      isReseller: false,
      amount: '22,500',
      paymentStatus: 'Success',
      paymentMode: 'PhonePe',
      billingVerified: false,
      billingStatus: 'Pending',
      invoiceNumber: '-',
      warehouseStatus: '-',
      dispatchStatus: '-',
      deliveryStatus: '-',
      finalStatus: 'Open',
      date: '2024-01-15',
      createdAt: '2024-01-15 09:30 AM',
    },
    {
      key: '3',
      orderId: 'ORD-003',
      name: 'Super Shop',
      isReseller: true,
      amount: '8,900',
      paymentStatus: 'Success',
      paymentMode: 'Credit Card',
      billingVerified: true,
      billingStatus: 'Completed',
      invoiceNumber: 'INV-003',
      warehouseStatus: 'Preparing',
      dispatchStatus: '-',
      deliveryStatus: '-',
      finalStatus: 'Open',
      date: '2024-01-14',
      createdAt: '2024-01-14 02:20 PM',
    },
  ]

  const filterBySearchAndDate = (list) => {
    let out = list || []
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      out = out.filter(
        (r) =>
          (r.orderId && r.orderId.toLowerCase().includes(q)) ||
          (r.name && r.name.toLowerCase().includes(q))
      )
    }
    if (dateRange && dateRange[0] && dateRange[1]) {
      const start = dateRange[0].startOf('day')
      const end = dateRange[1].endOf('day')
      out = out.filter((r) => {
        const d = r.createdAt ? dayjs(r.createdAt) : (r.date ? dayjs(r.date) : null)
        return d && d.isValid() && !d.isBefore(start) && !d.isAfter(end)
      })
    }
    return out
  }

  const paidOrders = mockOrders.filter(o => o.paymentStatus === 'Success')
  const pendingOrders = mockOrders.filter(o => o.billingStatus === 'Pending' || o.warehouseStatus === 'Preparing')
  const completedOrders = mockOrders.filter(o => o.finalStatus === 'Closed')

  const tabItems = [
    {
      key: 'all',
      label: 'All Orders',
      children: (
          <Table
            columns={columns}
            dataSource={filterBySearchAndDate(mockOrders)}
            pagination={{ pageSize: 10 }}
            onRow={(record) => ({
              onClick: () => {
                navigate(`/admin/orders/${record.orderId}`)
              },
              style: { cursor: 'pointer' },
            })}
          />
      ),
    },
    {
      key: 'paid',
      label: 'Paid Orders',
      children: (
        <div>
          <Table
            columns={columns}
            dataSource={filterBySearchAndDate(paidOrders)}
            pagination={{ pageSize: 10 }}
          />
        </div>
      ),
    },
    {
      key: 'pending',
      label: 'Payment Pending',
      children: (
        <Table
          columns={columns}
          dataSource={filterBySearchAndDate([])}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
    {
      key: 'completed',
      label: 'Completed Orders',
      children: (
        <Table
          columns={columns}
          dataSource={filterBySearchAndDate(completedOrders)}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
  ]

  return (
    <div>
      <Breadcrumbs />
      <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={2} style={{ margin: 0 }}>Order Management</Title>
        <Space wrap>
          <Input
            placeholder="Search by Order ID or Name"
            prefix={<SearchOutlined />}
            style={{ width: 280 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <RangePicker value={dateRange} onChange={setDateRange} allowClear />
          <Button icon={<ExportOutlined />} onClick={() => message.info('Export orders – connect to API')}>
            Export
          </Button>
        </Space>
      </Space>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key)
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set('tab', key)
            return next
          })
        }}
        items={tabItems}
        style={{ marginTop: 24 }}
      />

      <Modal
        title="Order Details"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {selectedOrder && (
          <div>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div>
                <strong>Order ID:</strong> {selectedOrder.orderId}
              </div>
              <div>
                <strong>Name:</strong> {selectedOrder.name}
              </div>
              <div>
                <strong>Type:</strong> {selectedOrder.isReseller ? 'Retailer' : 'End User'}
              </div>
              <div>
                <strong>Amount:</strong> ₹{selectedOrder.amount}
              </div>
              <div>
                <strong>Payment Mode:</strong> {selectedOrder.paymentMode}
              </div>
              <div>
                <strong>Invoice Number:</strong> {selectedOrder.invoiceNumber || '-'}
              </div>
            </Space>
          </div>
        )}
      </Modal>

      <Modal
        title="Update Order Status"
        open={updateModalVisible}
        onOk={() => {
          form.validateFields().then(() => {
            setUpdateModalVisible(false)
          })
        }}
        onCancel={() => setUpdateModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="billingStatus" label="Billing Status">
            <Select>
              <Option value="Pending">Pending</Option>
              <Option value="Completed">Completed</Option>
            </Select>
          </Form.Item>
          <Form.Item name="warehouseStatus" label="Warehouse Status">
            <Select>
              <Option value="Preparing">Preparing</Option>
              <Option value="Ready">Ready for Dispatch</Option>
            </Select>
          </Form.Item>
          <Form.Item name="dispatchStatus" label="Dispatch Status">
            <Select>
              <Option value="Pending">Pending</Option>
              <Option value="Dispatched">Dispatched</Option>
            </Select>
          </Form.Item>
          <Form.Item name="deliveryStatus" label="Delivery Status">
            <Select>
              <Option value="Pending">Pending</Option>
              <Option value="In Transit">In Transit</Option>
              <Option value="Delivered">Delivered</Option>
            </Select>
          </Form.Item>
          <Form.Item name="finalStatus" label="Final Status">
            <Select>
              <Option value="Open">Open</Option>
              <Option value="Closed">Closed</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default AdminOrders
