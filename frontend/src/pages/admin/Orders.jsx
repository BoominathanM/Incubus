import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Tabs, Table, Tag, Button, Space, Input, Select, Typography, Modal, Form, DatePicker, message, Dropdown, Drawer, Badge, Grid } from 'antd'
import Breadcrumbs from '../../components/Breadcrumbs'
import {
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  ExportOutlined,
  MoreOutlined,
  FilterOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useGetOrdersQuery, useUpdateOrderMutation, useBackfillOrdersMutation } from '../../store/api/orderApi'
import { exportToExcel, fmtDate } from '../../utils/exportToExcel'

const { Title } = Typography
const { Option } = Select
const { RangePicker } = DatePicker
const { useBreakpoint } = Grid

const TAB_KEYS = ['all', 'paid', 'pending', 'completed']

const EMPTY_FILTERS = {
  type: undefined,
  paymentStatus: undefined,
  billingVerified: undefined,
  billingStatus: undefined,
  warehouseStatus: undefined,
  dispatchStatus: undefined,
  deliveryStatus: undefined,
  finalStatus: undefined,
}

const AdminOrders = () => {
  const screens = useBreakpoint()
  const isSmallScreen = !screens.md
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

  // Filter drawer state
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [tempFilters, setTempFilters] = useState({ ...EMPTY_FILTERS })
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_FILTERS })

  const activeFilterCount = Object.values(appliedFilters).filter((v) => v !== undefined && v !== null && v !== '').length

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
    refetchOnMountOrArgChange: 60,
  })
  const [updateOrder, { isLoading: isUpdating }] = useUpdateOrderMutation()
  const [backfillOrders] = useBackfillOrdersMutation()
  const hasAttemptedBackfill = useRef(false)

  const total = data?.data?.pagination?.total ?? null

  useEffect(() => {
    if (isLoading || isFetching || total !== 0 || hasAttemptedBackfill.current) return
    hasAttemptedBackfill.current = true
    backfillOrders()
      .unwrap()
      .catch(() => {})
  }, [isLoading, isFetching, total, backfillOrders])

  const orders = data?.data?.orders || []

  // Client-side filtering
  const filteredOrders = useMemo(() => {
    let result = orders
    if (appliedFilters.type) result = result.filter((o) => o.type === appliedFilters.type)
    if (appliedFilters.paymentStatus) result = result.filter((o) => (o.paymentStatus || 'Pending') === appliedFilters.paymentStatus)
    if (appliedFilters.billingVerified !== undefined && appliedFilters.billingVerified !== '') {
      const bv = appliedFilters.billingVerified === 'true'
      result = result.filter((o) => !!o.billingVerified === bv)
    }
    if (appliedFilters.billingStatus) result = result.filter((o) => (o.billingStatus || 'Pending') === appliedFilters.billingStatus)
    if (appliedFilters.warehouseStatus) result = result.filter((o) => o.warehouseStatus === appliedFilters.warehouseStatus)
    if (appliedFilters.dispatchStatus) result = result.filter((o) => o.dispatchStatus === appliedFilters.dispatchStatus)
    if (appliedFilters.deliveryStatus) result = result.filter((o) => o.deliveryStatus === appliedFilters.deliveryStatus)
    if (appliedFilters.finalStatus) result = result.filter((o) => (o.finalStatus || 'Open') === appliedFilters.finalStatus)
    return result
  }, [orders, appliedFilters])

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD hh:mm A') : '-')

  const columns = [
    {
      title: 'Order ID',
      dataIndex: 'orderId',
      key: 'orderId',
      width: 140,
      render: (text) => <strong style={{ whiteSpace: 'nowrap' }}>{text}</strong>,
    },
    {
      title: 'Reference ID',
      dataIndex: 'referenceId',
      key: 'referenceId',
      width: 140,
      render: (text) => text ? <span style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>{text}</span> : '-',
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
    dataSource: filteredOrders.map((o) => ({ ...o, key: o._id })),
    loading: isLoading || isFetching,
    pagination: { pageSize: 10, responsive: true, size: isSmallScreen ? 'small' : 'default' },
    size: isSmallScreen ? 'small' : 'middle',
    scroll: { x: 'max-content' },
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

  const handleApplyFilters = () => {
    setAppliedFilters({ ...tempFilters })
    setFilterDrawerOpen(false)
  }

  const handleResetFilters = () => {
    setTempFilters({ ...EMPTY_FILTERS })
    setAppliedFilters({ ...EMPTY_FILTERS })
    setFilterDrawerOpen(false)
  }

  return (
    <div>
      <Breadcrumbs />
      <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={2} style={{ margin: 0 }}>Order Management</Title>
        <Space wrap>
          <Input
            placeholder="Search by Order ID or Name"
            prefix={<SearchOutlined />}
            style={{ width: isSmallScreen ? '100%' : 280, minWidth: isSmallScreen ? undefined : 220 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <RangePicker value={dateRange} onChange={setDateRange} allowClear />
          <Badge count={activeFilterCount} size="small">
            <Button
              icon={<FilterOutlined />}
              onClick={() => { setTempFilters({ ...appliedFilters }); setFilterDrawerOpen(true) }}
            >
              Filter
            </Button>
          </Badge>
          <Button
            icon={<ExportOutlined />}
            onClick={() => {
              if (!filteredOrders.length) { message.warning('No orders to export'); return }
              const rows = filteredOrders.map((o) => ({
                'Order ID': o.orderId,
                'Reference ID': o.referenceId || '',
                'Created At': fmtDate(o.createdAt),
                'Name': o.contactName || o.fromName || o.retailer?.businessName || '',
                'Type': o.type === 'retailer' ? 'Retailer' : 'End User',
                'Amount': o.amount || 0,
                'Payment Status': o.paymentStatus || 'Pending',
                'Billing Verified': o.billingVerified ? 'Yes' : 'No',
                'Billing Status': o.billingStatus || 'Pending',
                'Invoice Number': o.invoiceNumber || '',
                'Warehouse Status': o.warehouseStatus || '',
                'Dispatch Status': o.dispatchStatus || '',
                'Delivery Status': o.deliveryStatus || '',
                'Final Status': o.finalStatus || 'Open',
                'Contact Number': o.contactNumber || o.from || '',
                'Delivery Address': o.deliveryAddress || '',
                'Payment Mode': o.paymentMode || '',
                'Transaction ID': o.transactionId || '',
                'Courier': o.courier || '',
                'AWB': o.awb || '',
              }))
              const label = dateRange?.[0] && dateRange?.[1]
                ? `${dateRange[0].format('YYYYMMDD')}-${dateRange[1].format('YYYYMMDD')}`
                : dayjs().format('YYYYMMDD')
              const tabNameMap = {
                all: 'All-Orders',
                paid: 'Paid-Orders',
                pending: 'Payment-Pending',
                completed: 'Completed-Orders',
              }
              const tabFileName = tabNameMap[activeTab] || 'Orders'
              exportToExcel(rows, `${tabFileName}-${label}`)
            }}
          >
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

      {/* Update Modal */}
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

      {/* Filter Drawer */}
      <Drawer
        title="Filter Orders"
        open={filterDrawerOpen}
        onClose={() => { setFilterDrawerOpen(false); setTempFilters({ ...appliedFilters }) }}
        width={isSmallScreen ? '100%' : 360}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={handleResetFilters}>Reset All</Button>
            <Button type="primary" onClick={handleApplyFilters}>Apply Filters</Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size={20}>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>Order Type</div>
            <Select
              placeholder="All Types"
              allowClear
              style={{ width: '100%' }}
              value={tempFilters.type}
              onChange={(v) => setTempFilters((p) => ({ ...p, type: v }))}
            >
              <Option value="retailer">Retailer</Option>
              <Option value="enduser">End User</Option>
            </Select>
          </div>

          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>Payment Status</div>
            <Select
              placeholder="All Statuses"
              allowClear
              style={{ width: '100%' }}
              value={tempFilters.paymentStatus}
              onChange={(v) => setTempFilters((p) => ({ ...p, paymentStatus: v }))}
            >
              <Option value="Pending">Pending</Option>
              <Option value="Success">Success</Option>
              <Option value="Failed">Failed</Option>
            </Select>
          </div>

          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>Billing Verified</div>
            <Select
              placeholder="All"
              allowClear
              style={{ width: '100%' }}
              value={tempFilters.billingVerified}
              onChange={(v) => setTempFilters((p) => ({ ...p, billingVerified: v }))}
            >
              <Option value="true">Yes</Option>
              <Option value="false">No</Option>
            </Select>
          </div>

          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>Billing Status</div>
            <Select
              placeholder="All Statuses"
              allowClear
              style={{ width: '100%' }}
              value={tempFilters.billingStatus}
              onChange={(v) => setTempFilters((p) => ({ ...p, billingStatus: v }))}
            >
              <Option value="Pending">Pending</Option>
              <Option value="Completed">Completed</Option>
            </Select>
          </div>

          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>Warehouse Status</div>
            <Select
              placeholder="All Statuses"
              allowClear
              style={{ width: '100%' }}
              value={tempFilters.warehouseStatus}
              onChange={(v) => setTempFilters((p) => ({ ...p, warehouseStatus: v }))}
            >
              <Option value="Preparing">Preparing</Option>
              <Option value="Ready">Ready for Dispatch</Option>
            </Select>
          </div>

          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>Dispatch Status</div>
            <Select
              placeholder="All Statuses"
              allowClear
              style={{ width: '100%' }}
              value={tempFilters.dispatchStatus}
              onChange={(v) => setTempFilters((p) => ({ ...p, dispatchStatus: v }))}
            >
              <Option value="Pending">Pending</Option>
              <Option value="Dispatched">Dispatched</Option>
            </Select>
          </div>

          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>Delivery Status</div>
            <Select
              placeholder="All Statuses"
              allowClear
              style={{ width: '100%' }}
              value={tempFilters.deliveryStatus}
              onChange={(v) => setTempFilters((p) => ({ ...p, deliveryStatus: v }))}
            >
              <Option value="Pending">Pending</Option>
              <Option value="In Transit">In Transit</Option>
              <Option value="Delivered">Delivered</Option>
            </Select>
          </div>

          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>Final Status</div>
            <Select
              placeholder="All Statuses"
              allowClear
              style={{ width: '100%' }}
              value={tempFilters.finalStatus}
              onChange={(v) => setTempFilters((p) => ({ ...p, finalStatus: v }))}
            >
              <Option value="Open">Open</Option>
              <Option value="Closed">Closed</Option>
            </Select>
          </div>
        </Space>
      </Drawer>
    </div>
  )
}

export default AdminOrders
