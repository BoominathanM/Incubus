import React, { useState } from 'react'
import { Tabs, Table, Tag, Button, Space, Input, Modal, Form, Select, message, Typography, Upload, Row, Col, DatePicker } from 'antd'
import {
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserOutlined,
  DeleteOutlined,
  StopOutlined,
  UploadOutlined,
  ImportOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'
import PhoneInput from '../../components/PhoneInput'
import dayjs from 'dayjs'

const { Title } = Typography
const { Option } = Select
const { RangePicker } = DatePicker

const RetailerBoard = () => {
  const [activeTab, setActiveTab] = useState('requests')
  const [searchText, setSearchText] = useState('')
  const [dateRange, setDateRange] = useState(null)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [selectedRetailer, setSelectedRetailer] = useState(null)
  const [form] = Form.useForm()
  const [createForm] = Form.useForm()
  const [importModalVisible, setImportModalVisible] = useState(false)

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
      render: (_, r) => {
        if (r.whatsappCountryCode && r.whatsappNumber) {
          return r.whatsappCountryCode + ' ' + r.whatsappNumber
        }
        return r.whatsapp || '-'
      },
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
      title: 'Created By',
      dataIndex: 'createdBy',
      key: 'createdBy',
      render: (by) => <Tag>{by}</Tag>,
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (t) => t || '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {record.status === 'Pending' && (
            <>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => handleApprove(record)}
              >
                Approve
              </Button>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => handleReject(record)}
              >
                Reject
              </Button>
            </>
          )}
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedRetailer(record)
              form.setFieldsValue(record)
              setEditModalVisible(true)
            }}
          >
            Edit
          </Button>
        </Space>
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
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedRetailer(record)
              form.setFieldsValue(record)
              setEditModalVisible(true)
            }}
          >
            Edit
          </Button>
          {record.status === 'Active' ? (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={() => handleDisable(record)}
            >
              Disable
            </Button>
          ) : (
            <Button
              type="primary"
              onClick={() => handleActivate(record)}
            >
              Activate
            </Button>
          )}
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleRemove(record)}
          >
            Remove
          </Button>
        </Space>
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
      createdBy: 'WhatsApp',
      createdAt: '2024-01-15 10:00 AM',
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
      status: 'Pending',
      createdBy: 'Agent',
      createdAt: '2024-01-14 02:30 PM',
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
      createdBy: 'Admin',
      createdAt: '2024-01-10 09:00 AM',
    },
  ]

  const filterRetailers = (list) => {
    if (!list) return []
    let out = list
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      out = out.filter(
        (r) =>
          (r.businessName && r.businessName.toLowerCase().includes(q)) ||
          (r.contactPerson && r.contactPerson.toLowerCase().includes(q)) ||
          (r.gst && r.gst.toLowerCase().includes(q))
      )
    }
    if (dateRange && dateRange[0] && dateRange[1]) {
      const start = dateRange[0].startOf('day')
      const end = dateRange[1].endOf('day')
      out = out.filter((r) => {
        const d = r.createdAt ? dayjs(r.createdAt) : null
        return d && d.isValid() && !d.isBefore(start) && !d.isAfter(end)
      })
    }
    return out
  }

  const handleApprove = (record) => {
    message.success(`${record.businessName} has been approved`)
  }

  const handleReject = (record) => {
    message.warning(`${record.businessName} has been rejected`)
  }

  const handleActivate = (record) => {
    message.success(`${record.businessName} has been activated`)
  }

  const handleDisable = (record) => {
    message.warning(`${record.businessName} has been disabled`)
  }

  const handleRemove = (record) => {
    message.error(`${record.businessName} has been removed`)
  }

  const handleCreate = () => {
    createForm.validateFields().then(() => {
      message.success('Retailer created successfully')
      setCreateModalVisible(false)
      createForm.resetFields()
    })
  }

  const handleEdit = () => {
    form.validateFields().then(() => {
      message.success('Retailer updated successfully')
      setEditModalVisible(false)
    })
  }

  const tabItems = [
    {
      key: 'requests',
      label: 'Approval Requests',
      children: (
        <Table
          columns={requestColumns}
          dataSource={filterRetailers(mockRequests)}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
    {
      key: 'approved',
      label: 'Approved Retailers',
      children: (
        <Table
          columns={approvedColumns}
          dataSource={filterRetailers(mockApproved)}
          pagination={{ pageSize: 10 }}
        />
      ),
    },
  ]

  return (
    <div>
      <Breadcrumbs />
      <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={2}>Retailer Board</Title>
        <Space wrap>
          <Input
            placeholder="Search by Business Name, Contact or GST"
            prefix={<SearchOutlined />}
            style={{ width: 280 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <RangePicker value={dateRange} onChange={setDateRange} allowClear />
          <Button icon={<ExportOutlined />} onClick={() => message.info('Export – connect to API')}>
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
            Create Retailer
          </Button>
        </Space>
      </Space>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />

      <Modal
        title="Create Retailer"
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
        title="Edit Retailer"
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
          <Form.Item name="status" label="Status">
            <Select>
              <Option value="Pending">Pending</Option>
              <Option value="Approved">Approved</Option>
              <Option value="Rejected">Rejected</Option>
              <Option value="Active">Active</Option>
              <Option value="Disabled">Disabled</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Import Retailers"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setImportModalVisible(false)}>Cancel</Button>,
          <Button key="submit" type="primary" onClick={() => { message.success('Import will process uploaded file'); setImportModalVisible(false); }}>Upload & Import</Button>,
        ]}
        width={480}
      >
        <p style={{ marginBottom: 16 }}>Upload a CSV or Excel file with retailer details. Columns: Business Name, Contact Person, WhatsApp Country Code, WhatsApp Number, Email, GST, PAN, Street1, Street2, City, State, Pincode, Branches, Alt Contact Country Code, Alt Contact Number.</p>
        <Upload.Dragger maxCount={1} beforeUpload={() => false} accept=".csv,.xlsx,.xls">
          <p className="ant-upload-text">Click or drag file to this area</p>
          <p className="ant-upload-hint">CSV or Excel only</p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default RetailerBoard
