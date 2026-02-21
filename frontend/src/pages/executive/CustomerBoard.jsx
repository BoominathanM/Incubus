import React, { useState } from 'react'
import { Tabs, Table, Tag, Button, Space, Input, Modal, Form, message, Typography, Upload, Row, Col } from 'antd'
import {
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  ExportOutlined,
  ImportOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'
import PhoneInput from '../../components/PhoneInput'

const { Title } = Typography

const CustomerBoard = () => {
  const [activeTab, setActiveTab] = useState('requests')
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [createForm] = Form.useForm()

  const requestColumns = [
    {
      title: 'Business Name',
      dataIndex: 'businessName',
      key: 'businessName',
    },
    {
      title: 'Contact Person',
      dataIndex: 'contactPerson',
      key: 'contactPerson',
    },
    {
      title: 'WhatsApp Number',
      key: 'whatsapp',
      render: (_, r) => r.whatsappCountryCode && r.whatsappNumber ? `${r.whatsappCountryCode} ${r.whatsappNumber}` : (r.whatsapp || '—'),
    },
    {
      title: 'GST Number',
      dataIndex: 'gst',
      key: 'gst',
    },
    {
      title: 'Address',
      key: 'address',
      render: (_, r) => {
        if (r.city) {
          const parts = [r.street1, r.city, r.district, r.state, r.pincode].filter(Boolean)
          return parts.join(', ') || '-'
        }
        return r.location || '-'
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'Approved' ? 'green' : status === 'Rejected' ? 'red' : 'orange'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Button
          icon={<EditOutlined />}
          onClick={() => {
            form.setFieldsValue(record)
            setEditModalVisible(true)
          }}
        >
          Edit
        </Button>
      ),
    },
  ]

  const approvedColumns = [
    ...requestColumns.slice(0, -1),
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'Active' ? 'green' : 'red'}>{status}</Tag>
      ),
    },
  ]

  const mockRequests = [
    {
      key: '1',
      businessName: 'ABC Store',
      contactPerson: 'John Doe',
      whatsappCountryCode: '+91',
      whatsappNumber: '9876543210',
      email: 'abc@store.com',
      gst: 'GST123456',
      pan: 'PAN123456',
      street1: '123 Main Road',
      street2: 'Near Park',
      city: 'Mumbai',
      district: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      location: 'Mumbai',
      branches: 2,
      altContactCountryCode: '+91',
      altContactNumber: '9876543211',
      status: 'Pending',
    },
    {
      key: '2',
      businessName: 'XYZ Mart',
      contactPerson: 'Jane Smith',
      whatsappCountryCode: '+91',
      whatsappNumber: '9876543211',
      email: 'xyz@mart.com',
      gst: 'GST123457',
      pan: 'PAN123457',
      street1: '45 Sector 2',
      street2: '',
      city: 'Delhi',
      district: 'Central Delhi',
      state: 'Delhi',
      pincode: '110001',
      location: 'Delhi',
      branches: 1,
      altContactCountryCode: '+91',
      altContactNumber: '9876543212',
      status: 'Approved',
    },
  ]

  const mockApproved = [
    {
      key: '3',
      businessName: 'Super Shop',
      contactPerson: 'Bob Wilson',
      whatsappCountryCode: '+91',
      whatsappNumber: '9876543212',
      email: 'super@shop.com',
      gst: 'GST123458',
      pan: 'PAN123458',
      street1: '78 MG Road',
      street2: 'Block A',
      city: 'Bangalore',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      pincode: '560001',
      location: 'Bangalore',
      branches: 3,
      altContactCountryCode: '+91',
      altContactNumber: '9876543213',
      status: 'Active',
    },
  ]

  const handleCreate = () => {
    createForm.validateFields().then(() => {
      message.success('Wholesaler request submitted for approval')
      setCreateModalVisible(false)
      createForm.resetFields()
    })
  }

  const handleEdit = () => {
    form.validateFields().then(() => {
      message.success('Wholesaler details updated')
      setEditModalVisible(false)
    })
  }

  const tabItems = [
    {
      key: 'requests',
      label: 'My Requests',
      children: (
        <Table
          columns={requestColumns}
          dataSource={mockRequests}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
    {
      key: 'approved',
      label: 'Existing Customers',
      children: (
        <Table
          columns={approvedColumns}
          dataSource={mockApproved}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
  ]

  return (
    <div>
      <Breadcrumbs />
      <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between' }}>
        <Title level={2}>Customer Board</Title>
        <Space>
          <Input
            placeholder="Search customers"
            prefix={<SearchOutlined />}
            style={{ width: 300 }}
          />
          <Button icon={<ExportOutlined />} onClick={() => message.success('Export current list (CSV/Excel) – connect to API')}>
            Export
          </Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportModalVisible(true)}>
            Import
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalVisible(true)}
          >
            Create Wholesaler
          </Button>
        </Space>
      </Space>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />

      <Modal
        title="Create Wholesaler"
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalVisible(false)
          createForm.resetFields()
        }}
        width={640}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="businessName" label="Business / Store Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contactPerson" label="Contact Person Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <PhoneInput countryCodeName="whatsappCountryCode" numberName="whatsappNumber" label="WhatsApp Number" required />
          <PhoneInput countryCodeName="altContactCountryCode" numberName="altContactNumber" label="Alternative Contact Number" required={false} />
          <Form.Item name="email" label="Email ID">
            <Input type="email" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="gst" label="GST Number" rules={[{ required: true }]}>
                <Input placeholder="GST Number" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="gstCertificate" label="GST Attachment" valuePropName="fileList">
                <Upload maxCount={1} beforeUpload={() => false} accept=".pdf,.jpg,.jpeg,.png" showUploadList={false}>
                  <Button icon={<UploadOutlined />}>Upload</Button>
                </Upload>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="pan" label="PAN Number" rules={[{ required: true }]}>
                <Input placeholder="PAN Number" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="panCertificate" label="PAN Attachment" valuePropName="fileList">
                <Upload maxCount={1} beforeUpload={() => false} accept=".pdf,.jpg,.jpeg,.png" showUploadList={false}>
                  <Button icon={<UploadOutlined />}>Upload</Button>
                </Upload>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="street1" label="Street Name 1" rules={[{ required: true }]}>
            <Input placeholder="Street / building / area" />
          </Form.Item>
          <Form.Item name="street2" label="Street Name 2">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="city" label="City Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="district" label="District Name" rules={[{ required: true }]}>
            <Input placeholder="District" />
          </Form.Item>
          <Form.Item name="state" label="State Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="pincode" label="Pin Code" rules={[{ required: true }]}>
            <Input placeholder="e.g. 400001" />
          </Form.Item>
          <Form.Item name="branches" label="Number of Branches">
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Wholesaler"
        open={editModalVisible}
        onOk={handleEdit}
        onCancel={() => setEditModalVisible(false)}
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="businessName" label="Business / Store Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contactPerson" label="Contact Person Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <PhoneInput countryCodeName="whatsappCountryCode" numberName="whatsappNumber" label="WhatsApp Number" required />
          <PhoneInput countryCodeName="altContactCountryCode" numberName="altContactNumber" label="Alternative Contact Number" required={false} />
          <Form.Item name="email" label="Email ID">
            <Input type="email" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="gst" label="GST Number" rules={[{ required: true }]}>
                <Input placeholder="GST Number" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="gstCertificate" label="GST Attachment" valuePropName="fileList">
                <Upload maxCount={1} beforeUpload={() => false} accept=".pdf,.jpg,.jpeg,.png" showUploadList={false}>
                  <Button icon={<UploadOutlined />}>Upload</Button>
                </Upload>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="pan" label="PAN Number" rules={[{ required: true }]}>
                <Input placeholder="PAN Number" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="panCertificate" label="PAN Attachment" valuePropName="fileList">
                <Upload maxCount={1} beforeUpload={() => false} accept=".pdf,.jpg,.jpeg,.png" showUploadList={false}>
                  <Button icon={<UploadOutlined />}>Upload</Button>
                </Upload>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="street1" label="Street Name 1" rules={[{ required: true }]}>
            <Input placeholder="Street / building / area" />
          </Form.Item>
          <Form.Item name="street2" label="Street Name 2">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item name="city" label="City Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="district" label="District Name" rules={[{ required: true }]}>
            <Input placeholder="District" />
          </Form.Item>
          <Form.Item name="state" label="State Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="pincode" label="Pin Code" rules={[{ required: true }]}>
            <Input placeholder="e.g. 400001" />
          </Form.Item>
          <Form.Item name="branches" label="Number of Branches">
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Import Wholesalers / Customers"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setImportModalVisible(false)}>Cancel</Button>,
          <Button key="submit" type="primary" onClick={() => { message.success('Import will process uploaded file'); setImportModalVisible(false); }}>Upload & Import</Button>,
        ]}
        width={480}
      >
        <p style={{ marginBottom: 16 }}>Upload a CSV or Excel file with retailer/wholesaler details. Columns: Business Name, Contact Person, WhatsApp Country Code, WhatsApp Number, Email, GST, PAN, Street1, Street2, City, State, Pincode, Branches, Alt Contact Country Code, Alt Contact Number.</p>
        <Upload.Dragger maxCount={1} beforeUpload={() => false} accept=".csv,.xlsx,.xls">
          <p className="ant-upload-text">Click or drag file to this area</p>
          <p className="ant-upload-hint">CSV or Excel only</p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default CustomerBoard
