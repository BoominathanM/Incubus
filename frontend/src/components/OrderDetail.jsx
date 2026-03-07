import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card, Typography, Space, Tag, Button, Table, Modal, Form, Input,
  Select, Checkbox, message, Upload, Spin, Alert,
} from 'antd'
import Breadcrumbs from './Breadcrumbs'
import PhoneInput from './PhoneInput'
import { ArrowLeftOutlined, CheckCircleOutlined, EditOutlined, UploadOutlined, LinkOutlined } from '@ant-design/icons'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { useGetOrderByIdQuery, useUpdateOrderMutation } from '../store/api/orderApi'
import dayjs from 'dayjs'
import './OrderDetail.css'

const { Option } = Select
const { Title, Text } = Typography

/**
 * Shared OrderDetail — reads from real API, role-based update permissions:
 * - Order / Retailer info: Admin only
 * - Billing sections: Admin or Billing agent
 * - Warehouse / Delivery sections: Admin or Warehouse agent
 * - Payment Details: Read-only for all
 */
const OrderDetail = ({ basePath = '/admin' }) => {
  const navigate = useNavigate()
  const { orderId } = useParams()
  const { user } = useAuth()
  const role = user?.role || ''
  const { isDark } = useTheme()

  const [updateModalVisible, setUpdateModalVisible] = useState(false)
  const [currentSection, setCurrentSection] = useState(null)
  const [form] = Form.useForm()
  const deliveryTypeWatch = Form.useWatch('deliveryType', form)

  const { data, isLoading, isError } = useGetOrderByIdQuery(orderId, { skip: !orderId })
  const [updateOrder, { isLoading: isUpdating }] = useUpdateOrderMutation()

  const orderData = data?.data || null

  const fmt = (d) => (d ? dayjs(d).format('YYYY-MM-DD hh:mm A') : '-')

  const backUrl = `${basePath}/orders`

  // ── Permission helpers ────────────────────────────────────────────────────────
  const canUpdate = (section) => {
    if (role === 'admin' || role === 'superadmin') return true
    if (section === 'retailer' || section === 'payment') return false
    if (section === 'billing' || section === 'billing_verification') return role === 'billing'
    if (section === 'warehouse_dispatch' || section === 'warehouse_delivery')
      return role === 'warehouse'
    return false
  }

  const showUpdateButton = (section) => {
    if (section === 'payment') return false
    if (section === 'retailer') return role === 'admin' || role === 'superadmin'
    return true
  }

  const isUpdateDisabled = (section) => !canUpdate(section)

  // ── Derived UI values ─────────────────────────────────────────────────────────
  const orderType = orderData?.type === 'retailer' ? 'retailer' : 'end_user'

  const stages = orderData
    ? [
        { key: 1, title: 'Paid', date: fmt(orderData.paymentDate), status: orderData.paymentStatus === 'Success' ? 'completed' : 'pending' },
        { key: 2, title: 'Billing Verification', date: fmt(orderData.billingVerifiedAt), status: orderData.billingVerified ? 'completed' : 'pending' },
        { key: 3, title: 'Billing Confirmation', date: fmt(orderData.billingTime), status: orderData.billingStatus === 'Completed' ? 'completed' : 'pending' },
        { key: 4, title: 'Warehouse Prepared', date: fmt(orderData.warehouseTime), status: orderData.warehouseStatus === 'Ready' ? 'completed' : 'pending' },
        { key: 5, title: 'Dispatched', date: fmt(orderData.dispatchTime), status: orderData.dispatchStatus === 'Dispatched' ? 'completed' : 'pending' },
        { key: 6, title: 'Delivered', date: fmt(orderData.deliveryTime), status: orderData.deliveryStatus === 'Delivered' ? 'completed' : 'pending' },
        { key: 7, title: 'Closed', date: null, status: orderData.finalStatus === 'Closed' ? 'completed' : 'pending' },
      ]
    : []

  const getStatusIcon = (status, key) => {
    if (status === 'completed')
      return <CheckCircleOutlined style={{ color: '#fff', fontSize: '24px' }} />
    return (
      <span style={{ fontSize: '18px', fontWeight: 'bold', color: isDark ? '#999' : '#999' }}>
        {key}
      </span>
    )
  }

  // ── Update flow ───────────────────────────────────────────────────────────────
  const handleUpdateClick = (section) => {
    if (isUpdateDisabled(section) || !orderData) return
    setCurrentSection(section)

    if (section === 'retailer') {
      form.setFieldsValue({
        contactName: orderData.contactName || orderData.fromName || orderData.retailer?.businessName || '',
        contactCountryCode: '+91',
        contactNumber: orderData.contactNumber || orderData.from || '',
        contactEmail: orderData.contactEmail || orderData.retailer?.email || '',
        deliveryAddress: orderData.deliveryAddress || '',
      })
    } else if (section === 'payment') {
      form.setFieldsValue({
        paymentStatus: orderData.paymentStatus,
        paymentMode: orderData.paymentMode,
        transactionId: orderData.transactionId,
        amount: orderData.amount,
      })
    } else if (section === 'billing_verification') {
      form.setFieldsValue({
        billingVerified: orderData.billingVerified ? 'yes' : 'no',
        notifyBillingVerification: orderData.notifyBillingVerification,
      })
    } else if (section === 'billing') {
      form.setFieldsValue({
        billingStatus: orderData.billingStatus,
        invoiceNumber: orderData.invoiceNumber,
        notifyBilling: orderData.notifyBilling,
      })
    } else if (section === 'warehouse_dispatch') {
      form.setFieldsValue({
        warehouseStatus: orderData.warehouseStatus,
        dispatchStatus: orderData.dispatchStatus,
        notifyDispatch: orderData.notifyDispatch,
      })
    } else if (section === 'warehouse_delivery') {
      form.setFieldsValue({
        deliveryType: orderData.deliveryType,
        deliveryTypeWarehouseStatus: orderData.deliveryTypeWarehouseStatus,
        deliveryStatus: orderData.deliveryStatus,
        porterPhone: orderData.porterPhone,
        porterVehicleNumber: orderData.porterVehicleNumber,
        porterName: orderData.porterName,
        porterTrackingUrl: orderData.porterTrackingUrl,
        courierDocumentNumber: orderData.courierDocumentNumber,
        courierAgent: orderData.courierAgent,
        courierLastTrackingUrl: orderData.courierLastTrackingUrl,
        notifyDelivery: orderData.notifyDelivery,
      })
    }
    setUpdateModalVisible(true)
  }

  const handleUpdateSubmit = async () => {
    try {
      const values = await form.validateFields()

      let payload = { orderId }

      if (currentSection === 'retailer') {
        payload = {
          ...payload,
          contactName: values.contactName,
          contactNumber: values.contactNumber,
          contactEmail: values.contactEmail,
          deliveryAddress: values.deliveryAddress,
        }
      } else if (currentSection === 'payment') {
        payload = { ...payload, paymentStatus: values.paymentStatus, paymentMode: values.paymentMode, transactionId: values.transactionId, amount: values.amount }
      } else if (currentSection === 'billing_verification') {
        payload = { ...payload, billingVerified: values.billingVerified === 'yes', notifyBillingVerification: values.notifyBillingVerification }
      } else if (currentSection === 'billing') {
        payload = { ...payload, billingStatus: values.billingStatus, invoiceNumber: values.invoiceNumber, notifyBilling: values.notifyBilling }
      } else if (currentSection === 'warehouse_dispatch') {
        payload = { ...payload, warehouseStatus: values.warehouseStatus, dispatchStatus: values.dispatchStatus, notifyDispatch: values.notifyDispatch }
      } else if (currentSection === 'warehouse_delivery') {
        const deliveryType = values.deliveryType || orderData?.deliveryType || 'warehouse_agent'
        const trackingVal = values.porterTrackingUrl?.trim() || values.courierLastTrackingUrl?.trim() || undefined
        payload = {
          ...payload,
          deliveryType: values.deliveryType,
          deliveryTypeWarehouseStatus: values.deliveryTypeWarehouseStatus,
          deliveryStatus: values.deliveryStatus,
          porterPhone: values.porterPhone,
          porterVehicleNumber: values.porterVehicleNumber,
          porterName: values.porterName,
          courierDocumentNumber: values.courierDocumentNumber,
          courierAgent: values.courierAgent,
          ...(trackingVal && deliveryType === 'porter' && { porterTrackingUrl: trackingVal }),
          ...(trackingVal && deliveryType === 'courier_service' && { courierLastTrackingUrl: trackingVal }),
        }
        if (values.deliveryStatus === 'Delivered') {
          payload.deliveryTime = new Date().toISOString()
        }
        payload.notifyDelivery = values.notifyDelivery
      }

      await updateOrder(payload).unwrap()
      message.success('Order updated successfully')
      setUpdateModalVisible(false)
      form.resetFields()
    } catch (err) {
      message.error(err?.data?.message || 'Update failed')
    }
  }

  const getModalTitle = () => ({
    retailer: 'Update Retailer / Customer Information',
    payment: 'Update Payment Details',
    billing_verification: 'Update Billing Verification',
    billing: 'Update Billing Details',
    warehouse_dispatch: 'Update Warehouse & Dispatch',
    warehouse_delivery: 'Update Delivery',
  }[currentSection] || 'Update Information')

  const renderModalContent = () => {
    switch (currentSection) {
      case 'retailer':
        return (
          <>
            <Form.Item name="contactName" label="User Name"><Input /></Form.Item>
            <PhoneInput countryCodeName="contactCountryCode" numberName="contactNumber" label="Contact Number" required />
            <Form.Item name="contactEmail" label="Email"><Input type="email" /></Form.Item>
            <Form.Item name="deliveryAddress" label="Delivery Address"><Input.TextArea rows={3} /></Form.Item>
          </>
        )
      case 'payment':
        return (
          <>
            <Form.Item name="paymentStatus" label="Payment Status">
              <Select>
                <Option value="Success">Success</Option>
                <Option value="Failed">Failed</Option>
                <Option value="Pending">Pending</Option>
              </Select>
            </Form.Item>
            <Form.Item name="paymentMode" label="Payment Mode">
              <Select>
                <Option value="UPI">UPI</Option>
                <Option value="PhonePe">PhonePe</Option>
                <Option value="Google Pay">Google Pay</Option>
                <Option value="Credit Card">Credit Card</Option>
                <Option value="Debit Card">Debit Card</Option>
              </Select>
            </Form.Item>
            <Form.Item name="transactionId" label="Transaction ID"><Input /></Form.Item>
            <Form.Item name="amount" label="Amount (₹)">
              <Input type="number" min={0} />
            </Form.Item>
          </>
        )
      case 'billing_verification':
        return (
          <>
            <Form.Item name="billingVerified" label="Verified">
              <Select>
                <Option value="yes">Yes</Option>
                <Option value="no">No</Option>
              </Select>
            </Form.Item>
            <Form.Item name="notifyBillingVerification" valuePropName="checked">
              <Checkbox>Notify customer on verification</Checkbox>
            </Form.Item>
          </>
        )
      case 'billing':
        return (
          <>
            <Form.Item name="billingStatus" label="Billing Status">
              <Select>
                <Option value="Pending">Pending</Option>
                <Option value="Completed">Completed</Option>
              </Select>
            </Form.Item>
            <Form.Item name="invoiceNumber" label="Invoice Number"><Input /></Form.Item>
            <Form.Item name="notifyBilling" valuePropName="checked">
              <Checkbox>Notify customer on update</Checkbox>
            </Form.Item>
          </>
        )
      case 'warehouse_dispatch':
        return (
          <>
            <Form.Item name="warehouseStatus" label="Warehouse Status">
              <Select>
                <Option value="Preparing">Preparing</Option>
                <Option value="Ready">Ready</Option>
              </Select>
            </Form.Item>
            <Form.Item name="dispatchStatus" label="Dispatch Status">
              <Select>
                <Option value="Pending">Pending</Option>
                <Option value="Dispatched">Dispatched</Option>
              </Select>
            </Form.Item>
            <Form.Item name="notifyDispatch" valuePropName="checked">
              <Checkbox>Notify on dispatch</Checkbox>
            </Form.Item>
          </>
        )
      case 'warehouse_delivery': {
        const deliveryType = deliveryTypeWatch || orderData?.deliveryType || 'warehouse_agent'
        return (
          <>
            <Card size="small" style={{ flex: 1, marginBottom: 12 }} title="Dispatch">
              <Text type="secondary">Time: {fmt(orderData?.dispatchTime)}</Text>
            </Card>
            <Form.Item name="deliveryType" label="Delivery Type">
              <Select placeholder="Select delivery type">
                <Option value="warehouse_agent">Warehouse Agent</Option>
                <Option value="porter">Porter</Option>
                <Option value="courier_service">Courier Service</Option>
              </Select>
            </Form.Item>
            {deliveryType === 'warehouse_agent' && (
              <>
                <Form.Item name="deliveryTypeWarehouseStatus" label="Delivery Status">
                  <Select>
                    <Option value="Pending">Pending</Option>
                    <Option value="Out for Delivery">Out for Delivery</Option>
                  </Select>
                </Form.Item>
                <Form.Item name="proofUploadWarehouse" label="Proof Upload">
                  <Upload maxCount={1} beforeUpload={() => false} accept=".pdf,.jpg,.jpeg,.png" showUploadList={{ showPreviewIcon: false }}>
                    <Button icon={<UploadOutlined />}>Upload proof</Button>
                  </Upload>
                </Form.Item>
              </>
            )}
            {deliveryType === 'porter' && (
              <>
                <Form.Item name="porterPhone" label="Phone Number"><Input placeholder="Enter phone number" /></Form.Item>
                <Form.Item name="porterVehicleNumber" label="Vehicle Number"><Input placeholder="Enter vehicle number" /></Form.Item>
                <Form.Item name="porterName" label="Name"><Input placeholder="Enter name" /></Form.Item>
                <Form.Item name="porterTrackingUrl" label="Tracking URL"><Input placeholder="Enter tracking URL" /></Form.Item>
              </>
            )}
            {deliveryType === 'courier_service' && (
              <>
                <Form.Item name="courierDocumentNumber" label="Document Number"><Input placeholder="Enter document number" /></Form.Item>
                <Form.Item name="courierAgent" label="Courier Agent">
                  <Select>
                    <Option value="Jaydeep Logistics">Jaydeep Logistics</Option>
                    <Option value="DTDC">DTDC</Option>
                  </Select>
                </Form.Item>
                <Form.Item name="proofUploadCourier" label="Proof Upload">
                  <Upload maxCount={1} beforeUpload={() => false} accept=".pdf,.jpg,.jpeg,.png" showUploadList={{ showPreviewIcon: false }}>
                    <Button icon={<UploadOutlined />}>Upload proof</Button>
                  </Upload>
                </Form.Item>
                <Form.Item name="courierLastTrackingUrl" label="Last Tracking URL">
                  <Input placeholder="Enter last tracking URL" />
                </Form.Item>
              </>
            )}
            <Form.Item name="deliveryStatus" label="Delivery Status">
              <Select placeholder="Select status">
                <Option value="Pending">Pending</Option>
                <Option value="In Transit">In Transit</Option>
                <Option value="Delivered">Delivered</Option>
              </Select>
            </Form.Item>
            <Form.Item name="notifyDelivery" valuePropName="checked">
              <Checkbox>Notify customer on delivery update</Checkbox>
            </Form.Item>
          </>
        )
      }
      default:
        return null
    }
  }

  const renderCardExtra = (section) => {
    if (!showUpdateButton(section)) return null
    return (
      <Button
        type="primary"
        icon={<EditOutlined />}
        onClick={() => handleUpdateClick(section)}
        disabled={isUpdateDisabled(section)}
      >
        Update
      </Button>
    )
  }

  // ── Loading / error states ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (isError || !orderData) {
    return (
      <div style={{ padding: 24 }}>
        <Alert message="Order not found or failed to load." type="error" showIcon />
        <Button style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />} onClick={() => navigate(backUrl)}>
          Back
        </Button>
      </div>
    )
  }

  // ── Derived display values ────────────────────────────────────────────────────
  const displayName =
    orderData.contactName || orderData.fromName || orderData.retailer?.businessName || '-'
  const displayPhone =
    orderData.contactNumber || orderData.from
      ? `+${orderData.contactNumber || orderData.from}`
      : '-'
  const displayEmail = orderData.contactEmail || orderData.retailer?.email || '-'
  const displayAddress = orderData.deliveryAddress || '-'
  const retailerData = orderData.retailer || {}
  const retailerPrimaryPhone = retailerData.whatsappNumber
    ? `${retailerData.whatsappCountryCode || ''}${retailerData.whatsappNumber}`
    : '-'
  const retailerAltPhone = retailerData.altContactNumber
    ? `${retailerData.altContactCountryCode || ''}${retailerData.altContactNumber}`
    : '-'
  const retailerAddress = [
    retailerData.street1,
    retailerData.street2,
    retailerData.city,
    retailerData.district,
    retailerData.state,
    retailerData.pincode,
  ].filter(Boolean).join(', ') || displayAddress

  const deliveryTypeLabel =
    orderData.deliveryType === 'warehouse_agent'
      ? 'Warehouse Agent'
      : orderData.deliveryType === 'porter'
      ? 'Porter'
      : orderData.deliveryType === 'courier_service'
      ? 'Courier Service'
      : '-'

  return (
    <div className="order-detail-responsive">
      <Breadcrumbs />
      <Space style={{ marginBottom: 24 }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(backUrl)}>
          Back
        </Button>
        <Title level={2} style={{ margin: 0 }}>
          Order Details
        </Title>
      </Space>

      {/* ── Status Timeline ───────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 24, borderRadius: '8px' }} className="order-detail-card">
        <Title level={4} style={{ marginBottom: 24, marginTop: 0, color: isDark ? '#fff' : '#000' }}>
          Order Status
        </Title>
        <div style={{ overflowX: 'auto', padding: '20px 0' }}>
          <div className="order-detail-timeline">
            {stages.map((stage, index) => {
              const isCompleted = stage.status === 'completed'
              const isPending = stage.status === 'pending'
              return (
                <div key={stage.key} className="order-detail-stage">
                  {index < stages.length - 1 && (
                    <div
                      className={`order-detail-connector ${isCompleted ? 'completed' : 'pending'}`}
                      style={{ backgroundColor: isCompleted ? '#15B9A4' : isDark ? '#434343' : '#d9d9d9' }}
                    />
                  )}
                  <div
                    className={`order-detail-circle ${isPending ? 'pending' : 'completed'}`}
                    style={{
                      backgroundColor: isCompleted ? '#15B9A4' : isDark ? '#2a2a2a' : '#f0f0f0',
                      border: isPending ? `2px solid ${isDark ? '#434343' : '#d9d9d9'}` : 'none',
                    }}
                  >
                    {getStatusIcon(stage.status, stage.key)}
                  </div>
                  <Text
                    strong
                    className="order-detail-stage-title"
                    style={{ color: isDark ? (isCompleted ? '#fff' : '#999') : isCompleted ? '#000' : '#999' }}
                  >
                    {stage.title}
                  </Text>
                  <div style={{ marginBottom: '8px' }}>
                    {isCompleted ? (
                      <Tag
                        color="#15B9A4"
                        style={{ border: 'none', borderRadius: '4px', padding: '2px 12px', fontSize: '12px', fontWeight: 500 }}
                      >
                        Completed
                      </Tag>
                    ) : (
                      <Tag
                        style={{
                          backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0',
                          color: '#999',
                          border: `1px solid ${isDark ? '#434343' : '#d9d9d9'}`,
                          borderRadius: '4px',
                          padding: '2px 12px',
                          fontSize: '12px',
                          fontWeight: 500,
                        }}
                      >
                        Pending
                      </Tag>
                    )}
                  </div>
                  {isCompleted && stage.date && stage.date !== '-' && (
                    <Text type="secondary" style={{ fontSize: '12px', textAlign: 'center', color: '#999' }}>
                      {stage.date}
                    </Text>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* ── Order Information ─────────────────────────────────────────────── */}
      <Card title="Order Information" style={{ marginBottom: 24 }} className="order-detail-card">
        <div className="order-detail-table-wrap">
          <Table
            dataSource={[{
              key: '1',
              'Order ID': <Text strong>{orderData.orderId}</Text>,
              'Reference ID': orderData.referenceId ? <Text copyable>{orderData.referenceId}</Text> : '-',
              'Order Date': fmt(orderData.createdAt),
              'Items': orderData.items?.map((i) => {
                const name = i.productName || i.productRetailerId || 'Product'
                const qty = i.quantity || 1
                const price = i.itemPrice != null ? i.itemPrice * qty : null
                return price != null ? `${name} x${qty} (₹${price.toLocaleString()})` : `${name} x${qty}`
              }).join(', ') || orderData.messageBody || '-',
              'Amount': <Text strong style={{ color: '#15B9A4', fontSize: '16px' }}>₹{(orderData.amount || 0).toLocaleString()}</Text>,
              'Type': <Tag color={orderData.type === 'retailer' ? 'blue' : 'default'}>{orderData.type === 'retailer' ? 'Retailer' : 'End User'}</Tag>,
              'Final Status': <Tag color={orderData.finalStatus === 'Closed' ? '#15B9A4' : '#6754A3'}>{orderData.finalStatus || 'Open'}</Tag>,
            }]}
            columns={[
              { title: 'Order ID', dataIndex: 'Order ID', key: 'orderId' },
              { title: 'Reference ID', dataIndex: 'Reference ID', key: 'referenceId' },
              { title: 'Order Date', dataIndex: 'Order Date', key: 'orderDate' },
              { title: 'Items', dataIndex: 'Items', key: 'items' },
              { title: 'Amount', dataIndex: 'Amount', key: 'amount' },
              { title: 'Type', dataIndex: 'Type', key: 'type' },
              { title: 'Final Status', dataIndex: 'Final Status', key: 'finalStatus' },
            ]}
            pagination={false}
            bordered
          />
        </div>
      </Card>

      {/* ── Retailer / Customer + Delivery Info ──────────────────────────── */}
      {orderType === 'retailer' && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
          <Card
            title="Retailer Information"
            style={{ flex: '0 0 calc(50% - 12px)', minWidth: 280, boxSizing: 'border-box' }}
            className="order-detail-card"
            extra={renderCardExtra('retailer')}
          >
            <div className="order-detail-table-wrap">
              <Table
                dataSource={[{
                  key: '1',
                  'Retailer ID': retailerData.retailerId || '-',
                  'Business Name': retailerData.businessName || displayName,
                  'Store Name': retailerData.storeName || (orderData.deliveryStoreName || '-'),
                  'Contact Person': retailerData.contactPerson || displayName,
                  'WhatsApp Number': retailerPrimaryPhone,
                  'Alternate Number': retailerAltPhone,
                  'Email': retailerData.email || displayEmail,
                  'GST': retailerData.gst || '-',
                  'PAN': retailerData.pan || '-',
                  'Address': retailerAddress,
                  'Branches': retailerData.branches || '-',
                  'Status': (
                    <Tag color={retailerData.status === 'active' ? '#15B9A4' : retailerData.status === 'pending_approval' ? '#faad14' : '#6754A3'}>
                      {retailerData.status || '-'}
                    </Tag>
                  ),
                }]}
                columns={[
                  { title: 'Retailer ID', dataIndex: 'Retailer ID', key: 'retailerId' },
                  { title: 'Business Name', dataIndex: 'Business Name', key: 'businessName' },
                  { title: 'Store Name', dataIndex: 'Store Name', key: 'storeName' },
                  { title: 'Contact Person', dataIndex: 'Contact Person', key: 'contactPerson' },
                  { title: 'WhatsApp Number', dataIndex: 'WhatsApp Number', key: 'whatsappNumber' },
                  { title: 'Alternate Number', dataIndex: 'Alternate Number', key: 'altNumber' },
                  { title: 'Email', dataIndex: 'Email', key: 'email' },
                  { title: 'GST', dataIndex: 'GST', key: 'gst' },
                  { title: 'PAN', dataIndex: 'PAN', key: 'pan' },
                  { title: 'Address', dataIndex: 'Address', key: 'address' },
                  { title: 'Branches', dataIndex: 'Branches', key: 'branches' },
                  { title: 'Status', dataIndex: 'Status', key: 'status' },
                ]}
                pagination={false}
                bordered
              />
            </div>
          </Card>
          <Card title="Retailer / Delivery Information" style={{ flex: '0 0 calc(50% - 12px)', minWidth: 280, boxSizing: 'border-box' }} className="order-detail-card" extra={renderCardExtra('retailer')}>
            <div className="order-detail-table-wrap">
              <Table
                dataSource={[{
                  key: '1',
                  'Store Name': orderData.deliveryStoreName || retailerData.storeName || '-',
                  'Customer Name': orderData.deliveryCustomerName || displayName,
                  'Street Name': orderData.deliveryStreetName || '-',
                  'Landmark': orderData.deliveryLandmark || '-',
                  'City': orderData.deliveryCity || '-',
                  'State': orderData.deliveryState || '-',
                  'PIN Code': orderData.deliveryPincode || '-',
                  'Mobile Number': orderData.deliveryMobileNumber || displayPhone,
                  'Alternate Number': orderData.deliveryAlternateNumber || retailerAltPhone || '-',
                  'Delivery Address': displayAddress,
                  'Delivery Status': <Tag color={orderData.deliveryStatus === 'Delivered' ? '#15B9A4' : orderData.deliveryStatus === 'In Transit' ? '#6754A3' : '#999'}>{orderData.deliveryStatus || 'Pending'}</Tag>,
                }]}
                columns={[
                  { title: 'Store Name', dataIndex: 'Store Name', key: 'storeName' },
                  { title: 'Customer Name', dataIndex: 'Customer Name', key: 'customerName' },
                  { title: 'Street Name', dataIndex: 'Street Name', key: 'streetName' },
                  { title: 'Landmark', dataIndex: 'Landmark', key: 'landmark' },
                  { title: 'City', dataIndex: 'City', key: 'city' },
                  { title: 'State', dataIndex: 'State', key: 'state' },
                  { title: 'PIN Code', dataIndex: 'PIN Code', key: 'pincode' },
                  { title: 'Mobile Number', dataIndex: 'Mobile Number', key: 'mobile' },
                  { title: 'Alternate Number', dataIndex: 'Alternate Number', key: 'altNumber' },
                  { title: 'Delivery Address', dataIndex: 'Delivery Address', key: 'address' },
                  { title: 'Delivery Status', dataIndex: 'Delivery Status', key: 'deliveryStatus' },
                ]}
                pagination={false}
                bordered
              />
            </div>
          </Card>
        </div>
      )}

      {orderType === 'end_user' && (
        <Card title="Customer / Delivery Information" style={{ marginBottom: 24 }} className="order-detail-card" extra={renderCardExtra('retailer')}>
          <div className="order-detail-table-wrap">
            <Table
              dataSource={[{
                key: '1',
                'Store Name': orderData.deliveryStoreName || '-',
                'Customer Name': orderData.deliveryCustomerName || displayName,
                'Street Name': orderData.deliveryStreetName || '-',
                'Landmark': orderData.deliveryLandmark || '-',
                'City': orderData.deliveryCity || '-',
                'State': orderData.deliveryState || '-',
                'PIN Code': orderData.deliveryPincode || '-',
                'Mobile Number': orderData.deliveryMobileNumber || displayPhone,
                'Alternate Number': orderData.deliveryAlternateNumber || '-',
                'Delivery Address': displayAddress,
                'Delivery Status': <Tag color={orderData.deliveryStatus === 'Delivered' ? '#15B9A4' : orderData.deliveryStatus === 'In Transit' ? '#6754A3' : '#999'}>{orderData.deliveryStatus || 'Pending'}</Tag>,
              }]}
              columns={[
                { title: 'Store Name', dataIndex: 'Store Name', key: 'storeName' },
                { title: 'Customer Name', dataIndex: 'Customer Name', key: 'customerName' },
                { title: 'Street Name', dataIndex: 'Street Name', key: 'streetName' },
                { title: 'Landmark', dataIndex: 'Landmark', key: 'landmark' },
                { title: 'City', dataIndex: 'City', key: 'city' },
                { title: 'State', dataIndex: 'State', key: 'state' },
                { title: 'PIN Code', dataIndex: 'PIN Code', key: 'pincode' },
                { title: 'Mobile Number', dataIndex: 'Mobile Number', key: 'mobile' },
                { title: 'Alternate Number', dataIndex: 'Alternate Number', key: 'altNumber' },
                { title: 'Delivery Address', dataIndex: 'Delivery Address', key: 'address' },
                { title: 'Delivery Status', dataIndex: 'Delivery Status', key: 'deliveryStatus' },
              ]}
              pagination={false}
              bordered
            />
          </div>
        </Card>
      )}

      {/* ── Payment Details ───────────────────────────────────────────────── */}
      <Card
        title="Payment Details"
        style={{ marginBottom: 24 }}
        className="order-detail-card"
        extra={role === 'admin' || role === 'superadmin' ? renderCardExtra('payment') : null}
      >
        <div className="order-detail-table-wrap">
          <Table
            dataSource={[{
              key: '1',
              'Payment Status': <Tag color={orderData.paymentStatus === 'Success' ? '#15B9A4' : orderData.paymentStatus === 'Failed' ? '#ff4d4f' : '#faad14'}>{orderData.paymentStatus || 'Pending'}</Tag>,
              'Payment Mode': orderData.paymentMode || '-',
              'Transaction ID': orderData.transactionId || '-',
              'Payment Date': fmt(orderData.paymentDate),
            }]}
            columns={[
              { title: 'Payment Status', dataIndex: 'Payment Status', key: 'paymentStatus' },
              { title: 'Payment Mode', dataIndex: 'Payment Mode', key: 'paymentMode' },
              { title: 'Transaction ID', dataIndex: 'Transaction ID', key: 'transactionId' },
              { title: 'Payment Date', dataIndex: 'Payment Date', key: 'paymentDate' },
            ]}
            pagination={false}
            bordered
          />
        </div>
      </Card>

      {/* ── Billing Verification + Billing Details ────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
        <Card
          title="Billing Verification"
          style={{ flex: 1, minWidth: 280 }}
          className="order-detail-card"
          extra={renderCardExtra('billing_verification')}
        >
          <div className="order-detail-table-wrap">
            <Table
              dataSource={[{
                key: '1',
                'Verified': <Tag color={orderData.billingVerified ? '#15B9A4' : '#faad14'}>{orderData.billingVerified ? 'Yes' : 'No'}</Tag>,
                'Verified By': orderData.billingVerifiedBy || '-',
                'Verified At': fmt(orderData.billingVerifiedAt),
              }]}
              columns={[
                { title: 'Verified', dataIndex: 'Verified', key: 'verified' },
                { title: 'Verified By', dataIndex: 'Verified By', key: 'verifiedBy' },
                { title: 'Verified At', dataIndex: 'Verified At', key: 'verifiedAt' },
              ]}
              pagination={false}
              bordered
            />
          </div>
        </Card>
        <Card
          title="Billing Details"
          style={{ flex: 1, minWidth: 280 }}
          className="order-detail-card"
          extra={renderCardExtra('billing')}
        >
          <div className="order-detail-table-wrap">
            <Table
              dataSource={[{
                key: '1',
                'Billing Status': <Tag color={orderData.billingStatus === 'Completed' ? '#15B9A4' : '#faad14'}>{orderData.billingStatus || 'Pending'}</Tag>,
                'Invoice Number': orderData.invoiceNumber || '-',
                'Billing Time': fmt(orderData.billingTime),
              }]}
              columns={[
                { title: 'Billing Status', dataIndex: 'Billing Status', key: 'billingStatus' },
                { title: 'Invoice Number', dataIndex: 'Invoice Number', key: 'invoiceNumber' },
                { title: 'Billing Time', dataIndex: 'Billing Time', key: 'billingTime' },
              ]}
              pagination={false}
              bordered
            />
          </div>
        </Card>
      </div>

      {/* ── Warehouse + Delivery ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
        <Card
          title="Warehouse"
          style={{ flex: 1, minWidth: 280 }}
          className="order-detail-card"
          extra={renderCardExtra('warehouse_dispatch')}
        >
          <div className="order-detail-table-wrap">
            <Table
              dataSource={[{
                key: '1',
                'Warehouse Status': <Tag color={orderData.warehouseStatus === 'Ready' ? '#15B9A4' : '#6754A3'}>{orderData.warehouseStatus || 'Preparing'}</Tag>,
                'Warehouse Time': fmt(orderData.warehouseTime),
                'Dispatch Status': <Tag color={orderData.dispatchStatus === 'Dispatched' ? '#15B9A4' : '#999'}>{orderData.dispatchStatus || 'Pending'}</Tag>,
              }]}
              columns={[
                { title: 'Warehouse Status', dataIndex: 'Warehouse Status', key: 'warehouseStatus' },
                { title: 'Warehouse Time', dataIndex: 'Warehouse Time', key: 'warehouseTime' },
                { title: 'Dispatch Status', dataIndex: 'Dispatch Status', key: 'dispatchStatus' },
              ]}
              pagination={false}
              bordered
            />
          </div>
        </Card>
        <Card
          title="Delivery"
          style={{ flex: 1, minWidth: 280 }}
          className="order-detail-card"
          extra={renderCardExtra('warehouse_delivery')}
        >
          <div className="order-detail-table-wrap">
            <Table
              dataSource={[{
                key: '1',
                'Delivery Type': deliveryTypeLabel,
                'Delivery Status': <Tag color={orderData.deliveryStatus === 'Delivered' ? '#15B9A4' : orderData.deliveryStatus === 'In Transit' ? '#6754A3' : '#999'}>{orderData.deliveryStatus || 'Pending'}</Tag>,
                'Delivery Time': fmt(orderData.deliveryTime),
                'Tracking URL': (orderData.trackingUrl || orderData.porterTrackingUrl || orderData.courierLastTrackingUrl)
                  ? (
                      <a
                        href={orderData.trackingUrl || orderData.porterTrackingUrl || orderData.courierLastTrackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <LinkOutlined /> Open tracking
                      </a>
                    )
                  : '-',
              }]}
              columns={[
                { title: 'Delivery Type', dataIndex: 'Delivery Type', key: 'deliveryType' },
                { title: 'Delivery Status', dataIndex: 'Delivery Status', key: 'deliveryStatus' },
                { title: 'Delivery Time', dataIndex: 'Delivery Time', key: 'deliveryTime' },
                { title: 'Tracking URL', dataIndex: 'Tracking URL', key: 'trackingUrl' },
              ]}
              pagination={false}
              bordered
            />
          </div>
        </Card>
      </div>

      {/* ── Update Modal ──────────────────────────────────────────────────── */}
      <Modal
        className="order-update-modal"
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: 44 }}>
            <span>{getModalTitle()}</span>
            <Text strong style={{ color: 'inherit', marginRight: 6 }}>{orderData.orderId}</Text>
          </div>
        }
        open={updateModalVisible}
        onOk={handleUpdateSubmit}
        onCancel={() => { setUpdateModalVisible(false); form.resetFields() }}
        confirmLoading={isUpdating}
        width={600}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical">
          {renderModalContent()}
        </Form>
      </Modal>
    </div>
  )
}

export default OrderDetail
