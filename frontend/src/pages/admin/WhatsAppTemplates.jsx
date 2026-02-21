import React, { useState } from 'react'
import { Card, Form, Input, Button, Space, Typography, message, Tabs } from 'antd'
import { SaveOutlined } from '@ant-design/icons'

const { Title } = Typography
const { TextArea } = Input

const WhatsAppTemplates = () => {
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState('order')

  const handleSave = (templateType) => {
    form.validateFields().then(() => {
      message.success(`${templateType} template saved successfully`)
    })
  }

  const tabItems = [
    {
      key: 'order',
      label: 'Order Confirmation',
      children: (
        <Card>
          <Form form={form} layout="vertical">
            <Form.Item
              name="orderConfirmation"
              label="Order Confirmation Template"
              initialValue="Thank you for your order. Our team will process it shortly. Order ID: {orderId}"
            >
              <TextArea rows={4} />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => handleSave('Order Confirmation')}
              >
                Save Template
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'invoice',
      label: 'Invoice Generation',
      children: (
        <Card>
          <Form form={form} layout="vertical">
            <Form.Item
              name="invoiceGeneration"
              label="Invoice Generation Template"
              initialValue="Your order has been billed. Invoice Number: {invoiceNumber}"
            >
              <TextArea rows={4} />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => handleSave('Invoice Generation')}
              >
                Save Template
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'dispatch',
      label: 'Order Dispatch',
      children: (
        <Card>
          <Form form={form} layout="vertical">
            <Form.Item
              name="orderDispatch"
              label="Order Dispatch Template"
              initialValue="Your order is ready for dispatch. Tracking URL: {trackingUrl}"
            >
              <TextArea rows={4} />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => handleSave('Order Dispatch')}
              >
                Save Template
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'tracking',
      label: 'Order Tracking',
      children: (
        <Card>
          <Form form={form} layout="vertical">
            <Form.Item
              name="orderTracking"
              label="Order Tracking Template"
              initialValue="Your order is out for delivery. Track your order: {trackingUrl}"
            >
              <TextArea rows={4} />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => handleSave('Order Tracking')}
              >
                Save Template
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'delivery',
      label: 'Delivery Confirmation',
      children: (
        <Card>
          <Form form={form} layout="vertical">
            <Form.Item
              name="deliveryConfirmation"
              label="Delivery Confirmation Template"
              initialValue="Your order has been delivered successfully. Thank you for your business!"
            >
              <TextArea rows={4} />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => handleSave('Delivery Confirmation')}
              >
                Save Template
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
  ]

  return (
    <div>
      <Title level={2}>WhatsApp Template Management</Title>
      <p style={{ marginBottom: 24, color: '#666' }}>
        Configure automated WhatsApp notifications for order-related events. Once configured, all future messages will be sent automatically.
      </p>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />
    </div>
  )
}

export default WhatsAppTemplates
