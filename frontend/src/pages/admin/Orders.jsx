import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Tabs, Table, Tag, Button, Space, Input, Select, Typography, Modal, Form, DatePicker, message, Dropdown } from 'antd'
import Breadcrumbs from '../../components/Breadcrumbs'
import {
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  ExportOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useGetOrdersQuery, useUpdateOrderMutation, useBackfillOrdersMutation } from '../../store/api/orderApi'

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
  const [updateModalVisible, setUpdateModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [searchText, setSearchText] = useState('')
  const [dateRange, setDateRange] = useState(null)

  const queryParams = useMemo(
    () => ({
      ...(activeTab !== 'all' ? { tab: activeTab } : {}),
      ...(searchText.trim() ? { search: searchText.trim() } : {}),
      ...(dateRange?.[0] ? { startDate: dateRange[0].startOf('day').toISOString() } : {}),
      ...(dateRange?.[1] ? { endDate: dateRange[1].endOf('day').toISOString() } : {}),
      limit: 100,
    }),
    [activeTab, searchText, dateRange]
  )

  const { data, isLoading, isFetching } = useGetOrdersQuery(queryParams, {
    refetchOnMountOrArgChange: 60, // Cache 60s to reduce duplicate API calls
  })
  const [updateOrder, { isLoading: isUpdating }] = useUpdateOrderMutation()
  const [backfillOrders] = useBackfillOrdersMutation()
  const hasAttemptedBackfill = useRef(false)

  const total = data?.data?.pagination?.total ?? null

  // Auto-backfill existing webhook order messages when empty — run only ONCE per mount
  useEffect(() => {
    if (isLoading || isFetching || total !== 0 || hasAttemptedBackfill.current) return
    hasAttemptedBackfill.current = true
    backfillOrders()
      .unwrap()
      .catch(() => {})
  }, [isLoading, isFetching, total, backfillOrders])

  const orders = data?.data?.orders || []

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD hh:mm A') : '-')

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
      title: 'Payment Status',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      render: (s) => (
        <Tag color={s === 'Success' ? 'green' : s === 'Failed' ? 'red' : 'orange'}>{s || 'Pending'}</Tag>
      ),
    },
    {
      title: 'Billing Verification',
      dataIndex: 'billingVerified',
      key: 'billingVerified',
      render: (v) => <Tag color={v ? 'green' : 'orange'}>{v ? 'Yes' : 'No'}</Tag>,
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
            onClick: () => navigate(`/admin/orders/${record.orderId}`),
          },
          {
            key: 'update',
            icon: <EditOutlined />,
            label: 'Update',
            onClick: () => {
              setSelectedOrder(record)
              form.setFieldsValue({
                paymentStatus: record.paymentStatus,
                billingStatus: record.billingStatus,
                warehouseStatus: record.warehouseStatus,
                dispatchStatus: record.dispatchStatus,
                deliveryStatus: record.deliveryStatus,
                finalStatus: record.finalStatus,
              })
              setUpdateModalVisible(true)
            },
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

  const handleUpdateSubmit = async () => {
    try {
      const values = await form.validateFields()
      await updateOrder({ orderId: selectedOrder.orderId, ...values }).unwrap()
      message.success('Order updated successfully')
      setUpdateModalVisible(false)
      form.resetFields()
    } catch (err) {
      message.error(err?.data?.message || 'Update failed')
    }
  }

  const tableProps = {
    columns,
    dataSource: orders.map((o) => ({ ...o, key: o._id })),
    loading: isLoading || isFetching,
    pagination: { pageSize: 10 },
    onRow: (record) => ({
      onClick: () => navigate(`/admin/orders/${record.orderId}`),
      style: { cursor: 'pointer' },
    }),
  }

  const tabItems = [
    { key: 'all', label: 'All Orders', children: <Table {...tableProps} /> },
    { key: 'paid', label: 'Paid Orders', children: <Table {...tableProps} /> },
    { key: 'pending', label: 'Payment Pending', children: <Table {...tableProps} /> },
    { key: 'completed', label: 'Completed Orders', children: <Table {...tableProps} /> },
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
          <Button icon={<ExportOutlined />} onClick={() => message.info('Export coming soon')}>
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
        title="Update Order Status"
        open={updateModalVisible}
        onOk={handleUpdateSubmit}
        onCancel={() => { setUpdateModalVisible(false); form.resetFields() }}
        confirmLoading={isUpdating}
        width={600}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="paymentStatus" label="Payment Status">
            <Select>
              <Option value="Pending">Pending</Option>
              <Option value="Success">Success</Option>
              <Option value="Failed">Failed</Option>
            </Select>
          </Form.Item>
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
