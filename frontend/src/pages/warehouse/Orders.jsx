import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Tag, Button, Space, Input, DatePicker, Typography, Dropdown, Card, message, Drawer, Select, Badge, Grid } from 'antd'
import Breadcrumbs from '../../components/Breadcrumbs'
import { SearchOutlined, EyeOutlined, MoreOutlined, ExportOutlined, FilterOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useGetOrdersQuery } from '../../store/api/orderApi'
import { ORDER_POLLING_OPTIONS } from '../../store/api/queryOptions'
import { exportToExcel, fmtDate } from '../../utils/exportToExcel'

const { Title } = Typography
const { RangePicker } = DatePicker
const { Option } = Select
const { useBreakpoint } = Grid

const EMPTY_FILTERS = {
  type: undefined,
  billingStatus: undefined,
  warehouseStatus: undefined,
  dispatchStatus: undefined,
  deliveryStatus: undefined,
  finalStatus: undefined,
}

const WarehouseOrders = () => {
  const screens = useBreakpoint()
  const isSmallScreen = !screens.md
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  const [dateRange, setDateRange] = useState(null)

  // Filter drawer state
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [tempFilters, setTempFilters] = useState({ ...EMPTY_FILTERS })
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_FILTERS })

  const activeFilterCount = Object.values(appliedFilters).filter((v) => v !== undefined && v !== null && v !== '').length

  const queryParams = useMemo(
    () => ({
      ...(searchText.trim() ? { search: searchText.trim() } : {}),
      ...(dateRange?.[0] ? { startDate: dateRange[0].startOf('day').toISOString() } : {}),
      ...(dateRange?.[1] ? { endDate: dateRange[1].endOf('day').toISOString() } : {}),
      limit: 100,
    }),
    [searchText, dateRange]
  )

  const { data, isLoading, isFetching } = useGetOrdersQuery(queryParams, ORDER_POLLING_OPTIONS)
  const orders = data?.data?.orders || []

  // Client-side filtering
  const filteredOrders = useMemo(() => {
    let result = orders
    if (appliedFilters.type) result = result.filter((o) => o.type === appliedFilters.type)
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
      <Title level={2}>Order Management</Title>
      <Card
        extra={
          <Space wrap>
            <Input
              placeholder="Search by Order ID or Name"
              prefix={<SearchOutlined />}
              style={{ width: isSmallScreen ? '100%' : 260, minWidth: isSmallScreen ? undefined : 220 }}
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
                  'Created At': fmtDate(o.createdAt),
                  'Name': o.contactName || o.fromName || o.retailer?.businessName || '',
                  'Type': o.type === 'retailer' ? 'Retailer' : 'End User',
                  'Amount': o.amount || 0,
                  'Billing Status': o.billingStatus || 'Pending',
                  'Warehouse Status': o.warehouseStatus || '',
                  'Dispatch Status': o.dispatchStatus || '',
                  'Delivery Status': o.deliveryStatus || '',
                  'Delivery Type': o.deliveryType || '',
                  'Tracking URL': o.trackingUrl || o.porterTrackingUrl || o.courierLastTrackingUrl || '',
                  'Final Status': o.finalStatus || 'Open',
                  'Delivery Address': o.deliveryAddress || '',
                }))
                const label = dateRange?.[0] && dateRange?.[1]
                  ? `${dateRange[0].format('YYYYMMDD')}-${dateRange[1].format('YYYYMMDD')}`
                  : dayjs().format('YYYYMMDD')
                exportToExcel(rows, `WarehouseOrders-${label}`)
              }}
            >
              Export
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredOrders.map((o) => ({ ...o, key: o._id }))}
          loading={isLoading || isFetching}
          pagination={{ pageSize: 10, responsive: true, size: isSmallScreen ? 'small' : 'default' }}
          size={isSmallScreen ? 'small' : 'middle'}
          scroll={{ x: 'max-content' }}
          onRow={(record) => ({
            onClick: () => navigate(`/warehouse/orders/${record.orderId}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

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

export default WarehouseOrders
