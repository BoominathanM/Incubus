import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Typography, Space, Tag, Button, Table, Modal, Form, Input, Select, Checkbox, message, Upload } from 'antd'
import Breadcrumbs from './Breadcrumbs'
import PhoneInput from './PhoneInput'
import { ArrowLeftOutlined, CheckCircleOutlined, EditOutlined, UploadOutlined } from '@ant-design/icons'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import './OrderDetail.css'

const { Option } = Select
const { Title, Text } = Typography

/**
 * Shared OrderDetail - role-based update buttons:
 * - Order Information & Retailer Information: Update only for admin (super admin)
 * - Billing Details: Update for admin or billing agent; disabled for others
 * - Warehouse & Dispatch: Update for admin or warehouse agent; disabled for others
 * - Delivery Details: Update for admin or warehouse (Warehouse & Delivery) agent; disabled for others
 * - Payment Details: No update button (read-only)
 * @param {string} basePath - '/admin' | '/billing' | '/warehouse'
 */
const OrderDetail = ({ basePath = '/admin' }) => {
  const navigate = useNavigate()
  const { orderId } = useParams()
  const { user } = useAuth()
  const role = user?.role || ''
  const { isDark } = useTheme()
  const [updateModalVisible, setUpdateModalVisible] = useState(false)
  const [currentSection, setCurrentSection] = useState(null)
  const [deliverySubModal, setDeliverySubModal] = useState(null) // 'dispatch' | 'delivery' for courier 50-50 modals
  const [form] = Form.useForm()
  const [deliverySubForm] = Form.useForm()
  const deliveryTypeWatch = Form.useWatch('deliveryType', form)

  useEffect(() => {
    if (deliverySubModal === 'dispatch') {
      deliverySubForm.setFieldsValue({ subAwb: orderData.awb, subDispatchTime: orderData.dispatchTime, subCourier: orderData.courier })
    } else if (deliverySubModal === 'delivery') {
      deliverySubForm.setFieldsValue({ subDeliveryStatus: orderData.deliveryStatus, subDeliveryTime: orderData.deliveryTime, subTrackingUrl: orderData.trackingUrl })
    }
  }, [deliverySubModal])

  const backUrl = `${basePath}/orders`

  // Mock data per orderId so type (retailer vs end user) and details match the list
  const orderDataByOrderId = {
    'ORD-001': { isReseller: true, retailer: 'ABC Store', retailerContact: '+91 9876543210', retailerContactCountryCode: '+91', retailerContactNumber: '9876543210', retailerEmail: 'abc@store.com', amount: '15,000', billingStatus: 'Completed', invoiceNumber: 'INV-001', deliveryAddress: '123 Main Street, Mumbai, Maharashtra 400001' },
    'ORD-002': { isReseller: false, retailer: 'XYZ Mart', retailerContact: '+91 9123456789', retailerContactCountryCode: '+91', retailerContactNumber: '9123456789', retailerEmail: 'xyz@mart.com', amount: '22,500', billingStatus: 'Pending', invoiceNumber: '-', deliveryAddress: '456 Park Ave, Delhi 110001' },
    'ORD-003': { isReseller: true, retailer: 'Super Shop', retailerContact: '+91 9988776655', retailerContactCountryCode: '+91', retailerContactNumber: '9988776655', retailerEmail: 'super@shop.com', amount: '8,900', billingStatus: 'Completed', invoiceNumber: 'INV-003', deliveryAddress: '789 Market Rd, Bangalore 560001' },
  }

  const currentOrderId = orderId || 'ORD-001'
  const overrides = orderDataByOrderId[currentOrderId] || orderDataByOrderId['ORD-001']

  const orderData = {
    orderId: currentOrderId,
    isReseller: overrides.isReseller,
    retailer: overrides.retailer,
    retailerContact: overrides.retailerContact,
    retailerContactCountryCode: overrides.retailerContactCountryCode || '+91',
    retailerContactNumber: overrides.retailerContactNumber || '',
    retailerEmail: overrides.retailerEmail,
    product: 'Product A',
    quantity: 10,
    amount: overrides.amount || '15,000',
    paymentStatus: 'Success',
    paymentMode: 'UPI',
    transactionId: 'TXN123456',
    paymentDate: '2024-01-15 10:30 AM',
    billingStatus: overrides.billingStatus || 'Completed',
    invoiceNumber: overrides.invoiceNumber || 'INV-001',
    billingTime: '2024-01-15 11:00 AM',
    warehouseStatus: 'Ready',
    warehouseTime: '2024-01-15 02:00 PM',
    dispatchStatus: 'Dispatched',
    // dispatchTime: '2024-01-15 03:30 PM',
    // awb: 'AWB123456',
    // courier: 'BlueDart',
    deliveryStatus: 'In Transit',
    deliveryTime: null,
    trackingUrl: 'https://track.bluedart.com/123456',
    // notify: true,
    finalStatus: 'Open',
    orderDate: '2024-01-15 10:00 AM',
    deliveryAddress: overrides.deliveryAddress || '123 Main Street, Mumbai, Maharashtra 400001',
    billingVerified: true,
    billingVerifiedBy: 'Billing Agent',
    billingVerifiedAt: '2024-01-15 10:45 AM',
    notifyBilling: false,
    notifyDispatch: false,
    // Delivery type and type-specific fields (for Warehouse & Delivery modal)
    deliveryType: 'warehouse_agent', // 'warehouse_agent' | 'porter' | 'courier_service'
    deliveryTypeWarehouseStatus: 'Pending', // Pending | Out for Delivery
    porterPhone: '',
    porterVehicleNumber: '',
    porterName: '',
    porterTrackingUrl: '',
    courierDocumentNumber: '',
    courierAgent: 'Jaydeep Logistics', // Jaydeep Logistics | DTDC
    courierLastTrackingUrl: '',
  }

  const canUpdate = (section) => {
    if (role === 'admin') return true
    if (section === 'retailer' || section === 'payment') return false
    if (section === 'billing' || section === 'billing_verification') return role === 'billing'
    if (section === 'warehouse_dispatch' || section === 'warehouse_delivery') return role === 'warehouse' || role === 'admin'
    return false
  }

  const showUpdateButton = (section) => {
    if (section === 'retailer') return role === 'admin'
    if (section === 'payment') return role === 'admin'
    return true
  }

  const isUpdateDisabled = (section) => !canUpdate(section)

  // Type: 'retailer' => show Retailer Information + Delivery Information; 'end_user' => show only Delivery Information
  const orderType = orderData.isReseller ? 'retailer' : 'end_user'

  const stages = [
    { key: 1, title: 'Paid', date: orderData.paymentDate, status: orderData.paymentStatus === 'Success' ? 'completed' : 'pending' },
    { key: 2, title: 'Billing Verification', date: orderData.billingVerifiedAt, status: orderData.billingVerified ? 'completed' : 'pending' },
    { key: 3, title: 'Billing Confirmation', date: orderData.billingTime, status: orderData.billingStatus === 'Completed' ? 'completed' : 'pending' },
    { key: 4, title: 'Warehouse Prepared', date: orderData.warehouseTime, status: orderData.warehouseStatus === 'Ready' ? 'completed' : 'pending' },
    { key: 5, title: 'Dispatched', date: orderData.dispatchTime, status: orderData.dispatchStatus === 'Dispatched' ? 'completed' : 'pending' },
    { key: 6, title: 'Delivered', date: orderData.deliveryTime, status: orderData.deliveryStatus === 'Delivered' ? 'completed' : 'pending' },
    { key: 7, title: 'Closed', date: null, status: orderData.finalStatus === 'Closed' ? 'completed' : 'pending' },
  ]

  const getStatusIcon = (status, key) => {
    if (status === 'completed') return <CheckCircleOutlined style={{ color: '#fff', fontSize: '24px' }} />
    return <span style={{ fontSize: '18px', fontWeight: 'bold', color: isDark ? '#999' : '#999' }}>{key}</span>
  }

  const handleUpdateClick = (section) => {
    if (isUpdateDisabled(section)) return
    setCurrentSection(section)
    if (section === 'retailer') {
      form.setFieldsValue({
        retailer: orderData.retailer,
        contactCountryCode: orderData.retailerContactCountryCode || '+91',
        contactNumber: orderData.retailerContactNumber || orderData.retailerContact?.replace(/^\+\d+\s*/, '') || '',
        email: orderData.retailerEmail,
        address: orderData.deliveryAddress,
      })
    } else if (section === 'payment') {
      form.setFieldsValue({ paymentStatus: orderData.paymentStatus, paymentMode: orderData.paymentMode, transactionId: orderData.transactionId })
    } else if (section === 'billing_verification') {
      form.setFieldsValue({ billingVerified: orderData.billingVerified ? 'yes' : 'no' })
    } else if (section === 'billing') {
      form.setFieldsValue({ billingStatus: orderData.billingStatus, invoiceNumber: orderData.invoiceNumber, notifyBilling: orderData.notifyBilling })
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
        porterPhone: orderData.porterPhone,
        porterVehicleNumber: orderData.porterVehicleNumber,
        porterName: orderData.porterName,
        porterTrackingUrl: orderData.porterTrackingUrl,
        courierDocumentNumber: orderData.courierDocumentNumber,
        courierAgent: orderData.courierAgent,
        courierLastTrackingUrl: orderData.courierLastTrackingUrl,
      })
    }
    setUpdateModalVisible(true)
  }

  const handleUpdateSubmit = () => {
    form.validateFields().then(() => {
      const msg = currentSection === 'warehouse_dispatch' ? 'Warehouse & Dispatch updated successfully' : currentSection === 'warehouse_delivery' ? 'Delivery details updated successfully' : currentSection === 'billing_verification' ? 'Billing verification updated successfully' : `${currentSection} information updated successfully`
      message.success(msg)
      setUpdateModalVisible(false)
      form.resetFields()
    })
  }

  const getModalTitle = () => {
    const titles = {
      retailer: 'Update Retailer Information',
      payment: 'Update Payment Details',
      billing_verification: 'Update Billing Verification',
      billing: 'Update Billing Details',
      warehouse_dispatch: 'Update Warehouse & Dispatch',
      warehouse_delivery: 'Update Delivery',
    }
    return titles[currentSection] || 'Update Information'
  }

  const renderModalContent = () => {
    switch (currentSection) {
      case 'retailer':
        return (
          <>
            <Form.Item name="retailer" label="User Name"><Input /></Form.Item>
            <PhoneInput countryCodeName="contactCountryCode" numberName="contactNumber" label="Contact Number" required />
            <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
            <Form.Item name="address" label="Delivery Address"><Input.TextArea rows={3} /></Form.Item>
          </>
        )
      case 'payment':
        return (
          <>
            <Form.Item name="paymentStatus" label="Payment Status">
              <Select><Option value="Success">Success</Option><Option value="Failed">Failed</Option><Option value="Pending">Pending</Option></Select>
            </Form.Item>
            <Form.Item name="paymentMode" label="Payment Mode">
              <Select><Option value="UPI">UPI</Option><Option value="PhonePe">PhonePe</Option><Option value="Google Pay">Google Pay</Option><Option value="Credit Card">Credit Card</Option><Option value="Debit Card">Debit Card</Option></Select>
            </Form.Item>
            <Form.Item name="transactionId" label="Transaction ID"><Input /></Form.Item>
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
          </>
        )
      case 'billing':
        return (
          <>
            <Form.Item name="billingStatus" label="Billing Status">
              <Select><Option value="Pending">Pending</Option><Option value="Completed">Completed</Option></Select>
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
              <Select><Option value="Preparing">Preparing</Option><Option value="Ready">Ready</Option></Select>
            </Form.Item>
            <Form.Item name="dispatchStatus" label="Dispatch Status">
              <Select><Option value="Pending">Pending</Option><Option value="Dispatched">Dispatched</Option></Select>
            </Form.Item>
            <Form.Item name="notifyDispatch" valuePropName="checked">
              <Checkbox>Notify on dispatch</Checkbox>
            </Form.Item>
          </>
        )
      case 'warehouse_delivery': {
        const deliveryType = deliveryTypeWatch || orderData.deliveryType || 'warehouse_agent'
        return (
          <>
            <Card size="small" style={{ flex: 1 }} title="Dispatch">
              <Text type="secondary">Time: {orderData.dispatchTime || '-'}</Text>
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
                <Form.Item name="courierLastTrackingUrl" label="Last Tracking URL"><Input placeholder="Enter last tracking URL" /></Form.Item>
                <div style={{ display: 'flex', gap: 16, marginTop: 16, marginBottom: 8 }}>
                  {/* <Card size="small" style={{ flex: 1 }} title="Dispatch" extra={<Button type="primary" size="small" onClick={() => setDeliverySubModal('dispatch')}>Update</Button>}>
                    <Text type="secondary">AWB: {orderData.awb || '-'}</Text><br />
                    <Text type="secondary">Time: {orderData.dispatchTime || '-'}</Text>
                  </Card> */}
                  <Card size="small" style={{ flex: 1 }} title="Delivery" extra={<Button type="primary" size="small" onClick={() => setDeliverySubModal('delivery')}>Update</Button>}>
                    <Text type="secondary">Status: {orderData.deliveryStatus || 'Pending'}</Text><br />
                    <Text type="secondary">Time: {orderData.deliveryTime || '-'}</Text>
                  </Card>
                </div>
              </>
            )}

          </>
        )
      }
      default:
        return null
    }
  }

  const renderCardExtra = (section) => {
    if (section === 'payment' || !showUpdateButton(section)) return null
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

  return (
    <div className="order-detail-responsive">
      <Breadcrumbs />
      <Space style={{ marginBottom: 24 }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(backUrl)}>Back</Button>
        <Title level={2} style={{ margin: 0 }}>Order Details</Title>
      </Space>

      <Card style={{ marginBottom: 24, borderRadius: '8px' }} className="order-detail-card">
        <Title level={4} style={{ marginBottom: 24, marginTop: 0, color: isDark ? '#fff' : '#000' }}>Order Status</Title>
        <div style={{ overflowX: 'auto', padding: '20px 0' }}>
          <div className="order-detail-timeline">
            {stages.map((stage, index) => {
              const isCompleted = stage.status === 'completed'
              const isPending = stage.status === 'pending'
              return (
                <div key={stage.key} className="order-detail-stage">
                  {index < stages.length - 1 && (
                    <div className={`order-detail-connector ${isCompleted ? 'completed' : 'pending'}`} style={{ backgroundColor: isCompleted ? '#15B9A4' : isDark ? '#434343' : '#d9d9d9' }} />
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
                  <Text strong className="order-detail-stage-title" style={{ color: isDark ? (isCompleted ? '#fff' : '#999') : (isCompleted ? '#000' : '#999') }}>{stage.title}</Text>
                  <div style={{ marginBottom: '8px' }}>
                    {isCompleted ? (
                      <Tag color="#15B9A4" style={{ border: 'none', borderRadius: '4px', padding: '2px 12px', fontSize: '12px', fontWeight: 500 }}>Completed</Tag>
                    ) : (
                      <Tag style={{ backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0', color: '#999', border: `1px solid ${isDark ? '#434343' : '#d9d9d9'}`, borderRadius: '4px', padding: '2px 12px', fontSize: '12px', fontWeight: 500 }}>Pending</Tag>
                    )}
                  </div>
                  {isCompleted && stage.date && <Text type="secondary" style={{ fontSize: '12px', textAlign: 'center', color: '#999' }}>{stage.date}</Text>}
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <Card title="Order Information" style={{ marginBottom: 24 }} className="order-detail-card">
        <div className="order-detail-table-wrap">
          <Table
            dataSource={[{ key: '1', 'Order ID': <Text strong>{orderData.orderId}</Text>, 'Order Date': orderData.orderDate, 'Product': orderData.product, 'Quantity': orderData.quantity, 'Amount': <Text strong style={{ color: '#15B9A4', fontSize: '16px' }}>₹{orderData.amount}</Text>, 'Final Status': <Tag color={orderData.finalStatus === 'Closed' ? '#15B9A4' : '#6754A3'}>{orderData.finalStatus}</Tag> }]}
            columns={[{ title: 'Order ID', dataIndex: 'Order ID', key: 'orderId' }, { title: 'Order Date', dataIndex: 'Order Date', key: 'orderDate' }, { title: 'Product', dataIndex: 'Product', key: 'product' }, { title: 'Quantity', dataIndex: 'Quantity', key: 'quantity' }, { title: 'Amount', dataIndex: 'Amount', key: 'amount' }, { title: 'Final Status', dataIndex: 'Final Status', key: 'finalStatus' }]}
            pagination={false}
            bordered
          />
        </div>
      </Card>

      {orderType === 'retailer' && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
          <Card title="Retailer Information" style={{ flex: 1, minWidth: 280 }} className="order-detail-card" extra={renderCardExtra('retailer')}>
            <div className="order-detail-table-wrap">
              <Table
                dataSource={[{ key: '1', 'User Name': orderData.retailer, 'Contact Number': orderData.retailerContact, 'Email': orderData.retailerEmail, 'Delivery Address': orderData.deliveryAddress }]}
                columns={[{ title: 'User Name', dataIndex: 'User Name', key: 'retailer' }, { title: 'Contact Number', dataIndex: 'Contact Number', key: 'contact' }, { title: 'Email', dataIndex: 'Email', key: 'email' }, { title: 'Delivery Address', dataIndex: 'Delivery Address', key: 'address' }]}
                pagination={false}
                bordered
              />
            </div>
          </Card>
          <Card title="Delivery Information" style={{ flex: 1, minWidth: 280 }} className="order-detail-card">
            <div className="order-detail-table-wrap">
              <Table
                dataSource={[{
                  key: '1',
                  'Delivery Address': orderData.deliveryAddress,
                  'Courier': orderData.courier || '-',
                  'Tracking URL': orderData.trackingUrl ? <a href={orderData.trackingUrl} target="_blank" rel="noopener noreferrer">Track</a> : '-',
                  'Delivery Status': <Tag color={orderData.deliveryStatus === 'Delivered' ? '#15B9A4' : orderData.deliveryStatus === 'In Transit' ? '#6754A3' : '#999'}>{orderData.deliveryStatus || 'Pending'}</Tag>,
                  'Delivery Time': orderData.deliveryTime || '-',
                }]}
                columns={[{ title: 'Delivery Address', dataIndex: 'Delivery Address', key: 'address' }, { title: 'Courier', dataIndex: 'Courier', key: 'courier' }, { title: 'Tracking URL', dataIndex: 'Tracking URL', key: 'trackingUrl' }, { title: 'Delivery Status', dataIndex: 'Delivery Status', key: 'deliveryStatus' }, { title: 'Delivery Time', dataIndex: 'Delivery Time', key: 'deliveryTime' }]}
                pagination={false}
                bordered
              />
            </div>
          </Card>
        </div>
      )}

      {orderType === 'end_user' && (
        <Card title="Delivery Information" style={{ marginBottom: 24 }} className="order-detail-card">
          <div className="order-detail-table-wrap">
            <Table
              dataSource={[{
                key: '1',
                'Delivery Address': orderData.deliveryAddress,
                'Courier': orderData.courier || '-',
                'Tracking URL': orderData.trackingUrl ? <a href={orderData.trackingUrl} target="_blank" rel="noopener noreferrer">Track</a> : '-',
                'Delivery Status': <Tag color={orderData.deliveryStatus === 'Delivered' ? '#15B9A4' : orderData.deliveryStatus === 'In Transit' ? '#6754A3' : '#999'}>{orderData.deliveryStatus || 'Pending'}</Tag>,
                'Delivery Time': orderData.deliveryTime || '-',
              }]}
              columns={[{ title: 'Delivery Address', dataIndex: 'Delivery Address', key: 'address' }, { title: 'Courier', dataIndex: 'Courier', key: 'courier' }, { title: 'Tracking URL', dataIndex: 'Tracking URL', key: 'trackingUrl' }, { title: 'Delivery Status', dataIndex: 'Delivery Status', key: 'deliveryStatus' }, { title: 'Delivery Time', dataIndex: 'Delivery Time', key: 'deliveryTime' }]}
              pagination={false}
              bordered
            />
          </div>
        </Card>
      )}

      <Card title="Payment Details" style={{ marginBottom: 24 }} className="order-detail-card" extra={renderCardExtra('payment')}>
        <div className="order-detail-table-wrap">
          <Table
            dataSource={[{ key: '1', 'Payment Status': <Tag color={orderData.paymentStatus === 'Success' ? '#15B9A4' : '#ff4d4f'}>{orderData.paymentStatus}</Tag>, 'Payment Mode': orderData.paymentMode, 'Transaction ID': orderData.transactionId, 'Payment Date': orderData.paymentDate }]}
            columns={[{ title: 'Payment Status', dataIndex: 'Payment Status', key: 'paymentStatus' }, { title: 'Payment Mode', dataIndex: 'Payment Mode', key: 'paymentMode' }, { title: 'Transaction ID', dataIndex: 'Transaction ID', key: 'transactionId' }, { title: 'Payment Date', dataIndex: 'Payment Date', key: 'paymentDate' }]}
            pagination={false}
            bordered
          />
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
        <Card title="Billing Verification" style={{ flex: 1, minWidth: 280 }} className="order-detail-card" extra={renderCardExtra('billing_verification')}>
          <div className="order-detail-table-wrap">
            <Table
              dataSource={[{ key: '1', 'Verified': <Tag color={orderData.billingVerified ? '#15B9A4' : '#faad14'}>{orderData.billingVerified ? 'Yes' : 'No'}</Tag>, 'Verified By': orderData.billingVerifiedBy || '-', 'Verified At': orderData.billingVerifiedAt || '-' }]}
              columns={[{ title: 'Verified', dataIndex: 'Verified', key: 'verified' }, { title: 'Verified By', dataIndex: 'Verified By', key: 'verifiedBy' }, { title: 'Verified At', dataIndex: 'Verified At', key: 'verifiedAt' }]}
              pagination={false}
              bordered
            />
          </div>
        </Card>
        <Card title="Billing Details" style={{ flex: 1, minWidth: 280 }} className="order-detail-card" extra={renderCardExtra('billing')}>
          <div className="order-detail-table-wrap">
            <Table
              dataSource={[{ key: '1', 'Billing Status': <Tag color={orderData.billingStatus === 'Completed' ? '#15B9A4' : '#faad14'}>{orderData.billingStatus}</Tag>, 'Invoice Number': orderData.invoiceNumber, 'Billing Time': orderData.billingTime }]}
              columns={[{ title: 'Billing Status', dataIndex: 'Billing Status', key: 'billingStatus' }, { title: 'Invoice Number', dataIndex: 'Invoice Number', key: 'invoiceNumber' }, { title: 'Billing Time', dataIndex: 'Billing Time', key: 'billingTime' }]}
              pagination={false}
              bordered
            />
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
        <Card title="Warehouse" style={{ flex: 1, minWidth: 280 }} className="order-detail-card" extra={renderCardExtra('warehouse_dispatch')}>
          <div className="order-detail-table-wrap">
            <Table
              dataSource={[{
                key: '1',
                'Warehouse Status': <Tag color={orderData.warehouseStatus === 'Ready' ? '#15B9A4' : '#6754A3'}>{orderData.warehouseStatus}</Tag>,
                'Warehouse Time': orderData.warehouseTime,
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
        <Card title="Delivery" style={{ flex: 1, minWidth: 280 }} className="order-detail-card" extra={renderCardExtra('warehouse_delivery')}>
          <div className="order-detail-table-wrap">
            <Table
              dataSource={[{
                key: '1',
                'Delivery Type': orderData.deliveryType === 'warehouse_agent' ? 'Warehouse Agent' : orderData.deliveryType === 'porter' ? 'Porter' : orderData.deliveryType === 'courier_service' ? 'Courier Service' : '-',
                'Delivery Status': <Tag color={orderData.deliveryStatus === 'Delivered' ? '#15B9A4' : orderData.deliveryStatus === 'In Transit' ? '#6754A3' : '#999'}>{orderData.deliveryStatus || 'Pending'}</Tag>,
                'Delivery Time': orderData.deliveryTime || '-',
                'Tracking URL': orderData.trackingUrl ? <a href={orderData.trackingUrl} target="_blank" rel="noopener noreferrer">Track</a> : '-',
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

      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: 8 }}>
            <span>{getModalTitle()}</span>
            <Text strong style={{ color: 'inherit' }}>{orderData.orderId}</Text>
          </div>
        }
        open={updateModalVisible}
        onOk={handleUpdateSubmit}
        onCancel={() => { setUpdateModalVisible(false); form.resetFields(); setDeliverySubModal(null) }}
        width={600}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical">{renderModalContent()}</Form>
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: 8 }}>
            <span>Update Dispatch</span>
            <Text strong style={{ color: 'inherit' }}>{orderData.orderId}</Text>
          </div>
        }
        open={deliverySubModal === 'dispatch'}
        onOk={() => { deliverySubForm.validateFields().then(() => { message.success('Dispatch details updated'); setDeliverySubModal(null); deliverySubForm.resetFields() }) }}
        onCancel={() => { setDeliverySubModal(null); deliverySubForm.resetFields() }}
        width={440}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={deliverySubForm} layout="vertical">
          <Form.Item name="subCourier" label="Courier"><Input placeholder="Enter courier name" /></Form.Item>
          <Form.Item name="subDispatchTime" label="Dispatch Time"><Input placeholder="e.g. 2024-01-15 03:30 PM" /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: 8 }}>
            <span>Update Delivery</span>
            <Text strong style={{ color: 'inherit' }}>{orderData.orderId}</Text>
          </div>
        }
        open={deliverySubModal === 'delivery'}
        onOk={() => { deliverySubForm.validateFields().then(() => { message.success('Delivery details updated'); setDeliverySubModal(null); deliverySubForm.resetFields() }) }}
        onCancel={() => { setDeliverySubModal(null); deliverySubForm.resetFields() }}
        width={440}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={deliverySubForm} layout="vertical">
          <Form.Item name="subDeliveryStatus" label="Delivery Status">
            <Select><Option value="Pending">Pending</Option><Option value="In Transit">In Transit</Option><Option value="Delivered">Delivered</Option></Select>
          </Form.Item>
          <Form.Item name="subDeliveryTime" label="Delivery Time"><Input placeholder="e.g. 2024-01-16 11:00 AM" /></Form.Item>
          <Form.Item name="subTrackingUrl" label="Tracking URL"><Input placeholder="Enter tracking URL" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default OrderDetail
