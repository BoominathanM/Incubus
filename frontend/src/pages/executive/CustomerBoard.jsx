import React, { useState, useCallback } from 'react'
import { Tabs, Table, Tag, Button, Space, Input, Modal, Form, message, Typography, Upload, Row, Col, DatePicker, Alert, Dropdown, Grid } from 'antd'
import {
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  EyeOutlined,
  ExportOutlined,
  ImportOutlined,
  UploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  MoreOutlined,
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'
import PhoneInput from '../../components/PhoneInput'
import ImportRetailersModal from '../../components/ImportRetailersModal'
import { useAuth } from '../../context/AuthContext'
import {
  useGetRetailersQuery,
  useCreateRetailerMutation,
  useUpdateRetailerMutation,
  useDeleteRetailerMutation,
  useUploadRetailerFileMutation,
  useLazyExportRetailersQuery,
  useLazyDownloadImportSampleQuery,
  useImportRetailersMutation,
  downloadExportBlob,
  downloadSampleBlob,
} from '../../store/api/retailerApi'
import { RETAILER_POLLING_OPTIONS } from '../../store/api/queryOptions'
import { getUploadErrorMessage } from '../../utils/uploadErrors'
import dayjs from 'dayjs'

const { Title } = Typography
const { Link } = Typography
const { RangePicker } = DatePicker
const { useBreakpoint } = Grid

const ALLOWED_UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png'
const STATUS_DISPLAY = {
  pending_approval: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  active: 'Active',
  disabled: 'Disabled',
}

const CustomerBoard = () => {
  const screens = useBreakpoint()
  const isSmallScreen = !screens.md
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('requests')
  const [searchText, setSearchText] = useState('')
  const [dateRange, setDateRange] = useState(null)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [selectedRetailer, setSelectedRetailer] = useState(null)
  const [form] = Form.useForm()
  const [createForm] = Form.useForm()
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [viewModalVisible, setViewModalVisible] = useState(false)
  const [viewRetailer, setViewRetailer] = useState(null)

  const gstUrlCreate = Form.useWatch('gstAttachmentUrl', createForm)
  const panUrlCreate = Form.useWatch('panAttachmentUrl', createForm)
  const gstUrlEdit = Form.useWatch('gstAttachmentUrl', form)
  const panUrlEdit = Form.useWatch('panAttachmentUrl', form)

  const listParams = {
    status: activeTab === 'requests' ? 'requests' : activeTab === 'rejected' ? 'rejected' : 'approved',
    search: searchText.trim() || undefined,
    dateFrom: dateRange?.[0]?.startOf('day').toISOString?.(),
    dateTo: dateRange?.[1]?.endOf('day').toISOString?.(),
  }
  const { data: listData, isLoading: listLoading } = useGetRetailersQuery(listParams, RETAILER_POLLING_OPTIONS)
  const retailers = listData?.retailers ?? []
  const [createRetailer, { isLoading: creating }] = useCreateRetailerMutation()
  const [updateRetailer, { isLoading: updating }] = useUpdateRetailerMutation()
  const [deleteRetailer] = useDeleteRetailerMutation()
  const [uploadFile, { isLoading: uploading }] = useUploadRetailerFileMutation()
  const [triggerExport, { isLoading: exporting }] = useLazyExportRetailersQuery()
  const [triggerSample, { isLoading: sampleLoading }] = useLazyDownloadImportSampleQuery()
  const [importRetailers, { isLoading: importMutationLoading }] = useImportRetailersMutation()
  const handleImportSuccess = useCallback(({ imported }) => { if (imported > 0) setActiveTab('requests') }, [])

  const isOwn = (record) => user?._id && record.createdById === user._id

  const requestColumns = [
    { title: 'Retailer ID', dataIndex: 'retailerId', key: 'retailerId', render: (v) => v || '-' },
    { title: 'Business Name', dataIndex: 'businessName', key: 'businessName' },
    { title: 'Store Name', dataIndex: 'storeName', key: 'storeName', render: (v) => v || '—' },
    { title: 'Contact Person', dataIndex: 'contactPerson', key: 'contactPerson' },
    {
      title: 'WhatsApp Number',
      key: 'whatsapp',
      render: (_, r) =>
        r.whatsappCountryCode && r.whatsappNumber ? `${r.whatsappCountryCode} ${r.whatsappNumber}` : '—',
    },
    { title: 'GST Number', dataIndex: 'gst', key: 'gst' },
    {
      title: 'Address',
      key: 'address',
      render: (_, r) => {
        const parts = [r.street1, r.city, r.district, r.state, r.pincode].filter(Boolean)
        return parts.length ? parts.join(', ') : '—'
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'approved' ? 'green' : status === 'rejected' ? 'red' : 'orange'} style={{ margin: 0, padding: '2px 10px', lineHeight: '22px' }}>
          {STATUS_DISPLAY[status] ?? status}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 72,
      render: (_, record) => {
        const menuItems = [
          { key: 'view', icon: <EyeOutlined />, label: 'View', onClick: () => { setViewRetailer(record); setViewModalVisible(true) } },
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setSelectedRetailer(record); form.setFieldsValue(retailerToForm(record)); setEditModalVisible(true) } },
          ...(isOwn(record) && record.status === 'pending_approval'
            ? [{ key: 'remove', icon: <DeleteOutlined />, label: 'Remove', danger: true, onClick: async () => { try { await deleteRetailer(record._id).unwrap(); message.success('Request removed') } catch (e) { message.error(e?.data?.message || 'Remove failed') } } }]
            : []),
        ]
        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        )
      },
    },
  ]

  const approvedColumns = [
    ...requestColumns.slice(0, -2),
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : 'red'} style={{ margin: 0, padding: '2px 10px', lineHeight: '22px' }}>{STATUS_DISPLAY[status] ?? status}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 72,
      render: (_, record) => {
        const menuItems = [
          { key: 'view', icon: <EyeOutlined />, label: 'View', onClick: () => { setViewRetailer(record); setViewModalVisible(true) } },
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setSelectedRetailer(record); form.setFieldsValue(retailerToForm(record)); setEditModalVisible(true) } },
        ]
        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        )
      },
    },
  ]

  const rejectedColumns = [
    ...requestColumns.slice(0, -2),
    {
      title: 'Reject Reason',
      dataIndex: 'rejectedReason',
      key: 'rejectedReason',
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'Rejected At',
      dataIndex: 'rejectedAt',
      key: 'rejectedAt',
      width: 160,
      render: (t) => (t ? new Date(t).toLocaleString() : '—'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 72,
      render: (_, record) => {
        const menuItems = [
          { key: 'view', icon: <EyeOutlined />, label: 'View', onClick: () => { setViewRetailer(record); setViewModalVisible(true) } },
          { key: 'edit', icon: <EditOutlined />, label: 'Edit', onClick: () => { setSelectedRetailer(record); form.setFieldsValue(retailerToForm(record)); setEditModalVisible(true) } },
        ]
        return (
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        )
      },
    },
  ]

  function retailerToForm(r) {
    if (!r) return {}
    return {
      businessName: r.businessName,
      storeName: r.storeName ?? '',
      contactPerson: r.contactPerson,
      email: r.email ?? '',
      whatsappCountryCode: r.whatsappCountryCode ?? '+91',
      whatsappNumber: r.whatsappNumber,
      altContactCountryCode: r.altContactCountryCode ?? '',
      altContactNumber: r.altContactNumber ?? '',
      gst: r.gst,
      pan: r.pan,
      gstAttachmentUrl: r.gstAttachmentUrl ?? '',
      panAttachmentUrl: r.panAttachmentUrl ?? '',
      street1: r.street1,
      street2: r.street2 ?? '',
      city: r.city,
      district: r.district,
      state: r.state,
      pincode: r.pincode,
      branches: r.branches ?? 1,
    }
  }

  function formToBody(values) {
    return {
      businessName: values.businessName,
      storeName: values.storeName ?? '',
      contactPerson: values.contactPerson,
      email: values.email ?? '',
      whatsappCountryCode: values.whatsappCountryCode ?? '+91',
      whatsappNumber: values.whatsappNumber,
      altContactCountryCode: values.altContactCountryCode ?? '',
      altContactNumber: values.altContactNumber ?? '',
      gst: values.gst,
      pan: values.pan,
      gstAttachmentUrl: values.gstAttachmentUrl ?? '',
      panAttachmentUrl: values.panAttachmentUrl ?? '',
      street1: values.street1,
      street2: values.street2 ?? '',
      city: values.city,
      district: values.district,
      state: values.state,
      pincode: values.pincode,
      branches: values.branches ?? 1,
    }
  }

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      await createRetailer(formToBody(values)).unwrap()
      message.success('Wholesaler request submitted for approval')
      setCreateModalVisible(false)
      createForm.resetFields()
    } catch (e) {
      if (e?.errorFields) return
      message.error(e?.data?.message || 'Create failed')
    }
  }

  const handleEdit = async () => {
    try {
      const values = await form.validateFields()
      await updateRetailer({ id: selectedRetailer._id, ...formToBody(values) }).unwrap()
      message.success('Wholesaler details updated')
      setEditModalVisible(false)
    } catch (e) {
      if (e?.errorFields) return
      message.error(e?.data?.message || 'Update failed')
    }
  }

  const handleExport = async () => {
    if (!retailers.length) {
      message.error('No data to export')
      return
    }
    try {
      const blob = await triggerExport(listParams).unwrap()
      const tabLabelMap = {
        requests: 'My-Requests',
        approved: 'Existing-Customers',
        rejected: 'Rejected',
      }
      const tabLabel = tabLabelMap[activeTab] || 'Customers'
      const fileName = `${tabLabel}-${dayjs().format('YYYYMMDD')}.xlsx`
      downloadExportBlob(blob, fileName)
      message.success('Export downloaded')
    } catch (e) {
      message.error(e?.data?.message || e?.message || 'Export failed')
    }
  }

  const handleDownloadSample = async () => {
    try {
      const blob = await triggerSample().unwrap()
      downloadSampleBlob(blob)
      message.success('Sample file downloaded')
    } catch (e) {
      message.error(e?.data?.message || e?.message || 'Download failed')
    }
  }

  const handleFileUpload = useCallback(
    async (formInstance, file, fieldName) => {
      const ext = (file.name || '').toLowerCase().split('.').pop()
      if (!['pdf', 'jpeg', 'jpg', 'png'].includes(ext)) {
        message.error('Only PDF, JPEG, JPG and PNG are allowed')
        return
      }
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await uploadFile(fd).unwrap()
        if (res?.url) formInstance.setFieldValue(fieldName, res.url)
      } catch (err) {
        message.error(getUploadErrorMessage(err))
      }
    },
    [uploadFile]
  )

  const tabItems = [
    {
      key: 'requests',
      label: 'My Requests',
      children: (
        <Table
          rowKey="_id"
          columns={requestColumns}
          dataSource={retailers}
          loading={listLoading}
          pagination={{ pageSize: 10, responsive: true, size: isSmallScreen ? 'small' : 'default' }}
          size={isSmallScreen ? 'small' : 'middle'}
          scroll={{ x: 'max-content' }}
        />
      ),
    },
    {
      key: 'approved',
      label: 'Existing Customers',
      children: (
        <Table
          rowKey="_id"
          columns={approvedColumns}
          dataSource={retailers}
          loading={listLoading}
          pagination={{ pageSize: 10, responsive: true, size: isSmallScreen ? 'small' : 'default' }}
          size={isSmallScreen ? 'small' : 'middle'}
          scroll={{ x: 'max-content' }}
        />
      ),
    },
    {
      key: 'rejected',
      label: 'Rejected',
      children: (
        <Table
          rowKey="_id"
          columns={rejectedColumns}
          dataSource={retailers}
          loading={listLoading}
          pagination={{ pageSize: 10, responsive: true, size: isSmallScreen ? 'small' : 'default' }}
          size={isSmallScreen ? 'small' : 'middle'}
          scroll={{ x: 'max-content' }}
        />
      ),
    },
  ]

  const formItemStyle = { marginBottom: 20 }

  const sharedFormItems = (formInstance, isCreate, attachmentUrls = {}) => {
    const { gstUrl = '', panUrl = '' } = attachmentUrls
    if (!formInstance) return null
    return (
      <Space direction="vertical" size="large" style={{ width: '100%', display: 'block' }}>
        <Form.Item name="businessName" label="Business Name" rules={[{ required: true }]} style={formItemStyle}>
          <Input placeholder="Business / company name" />
        </Form.Item>
        <Form.Item name="storeName" label="Store Name" rules={[{ required: true, message: 'Store Name is required' }]} style={formItemStyle}>
          <Input placeholder="Store / outlet name" />
        </Form.Item>
        <Form.Item name="contactPerson" label="Contact Person Name" rules={[{ required: true }]} style={formItemStyle}>
          <Input />
        </Form.Item>
        <div style={formItemStyle}>
          <PhoneInput countryCodeName="whatsappCountryCode" numberName="whatsappNumber" label="WhatsApp Number" required />
        </div>
        <div style={formItemStyle}>
          <PhoneInput countryCodeName="altContactCountryCode" numberName="altContactNumber" label="Alternative Contact Number" required={false} />
        </div>
        <Form.Item
          name="email"
          label="Email ID"
          rules={[
            { required: true, message: 'Email is required' },
            { type: 'email', message: 'Enter a valid email' },
          ]}
          style={formItemStyle}
        >
          <Input type="email" />
        </Form.Item>
        <Row gutter={12} style={{ marginBottom: 20 }}>
          <Col span={14}>
            <Form.Item name="gst" label="GST Number" rules={[{ required: true }]}>
              <Input placeholder="GST Number" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="gstAttachmentUrl" hidden>
              <Input type="hidden" />
            </Form.Item>
            <Form.Item label="GST Attachment" tooltip="PDF, JPEG, JPG, PNG only">
              <Space>
                <Upload
                  maxCount={1}
                  accept={ALLOWED_UPLOAD_ACCEPT}
                  beforeUpload={(file) => {
                    handleFileUpload(formInstance, file, 'gstAttachmentUrl')
                    return false
                  }}
                  showUploadList={{ showPreviewIcon: false }}
                >
                  <Button icon={<UploadOutlined />} loading={uploading}>Upload</Button>
                </Upload>
                {gstUrl && <Link href={gstUrl} target="_blank" rel="noopener noreferrer">View file</Link>}
              </Space>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12} style={{ marginBottom: 20 }}>
          <Col span={14}>
            <Form.Item name="pan" label="PAN Number" rules={[{ required: true }]}>
              <Input placeholder="PAN Number" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="panAttachmentUrl" hidden>
              <Input type="hidden" />
            </Form.Item>
            <Form.Item label="PAN Attachment" tooltip="PDF, JPEG, JPG, PNG only">
              <Space>
                <Upload
                  maxCount={1}
                  accept={ALLOWED_UPLOAD_ACCEPT}
                  beforeUpload={(file) => {
                    handleFileUpload(formInstance, file, 'panAttachmentUrl')
                    return false
                  }}
                  showUploadList={{ showPreviewIcon: false }}
                >
                  <Button icon={<UploadOutlined />} loading={uploading}>Upload</Button>
                </Upload>
                {panUrl && <Link href={panUrl} target="_blank" rel="noopener noreferrer">View file</Link>}
              </Space>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="street1" label="Street Name 1" rules={[{ required: true }]} style={formItemStyle}>
          <Input placeholder="Street / building / area" />
        </Form.Item>
        <Form.Item name="street2" label="Street Name 2" style={formItemStyle}>
          <Input placeholder="Optional" />
        </Form.Item>
        <Form.Item name="city" label="City Name" rules={[{ required: true }]} style={formItemStyle}>
          <Input />
        </Form.Item>
        <Form.Item name="district" label="District Name" rules={[{ required: true }]} style={formItemStyle}>
          <Input placeholder="District" />
        </Form.Item>
        <Form.Item name="state" label="State Name" rules={[{ required: true }]} style={formItemStyle}>
          <Input />
        </Form.Item>
        <Form.Item name="pincode" label="Pin Code" rules={[{ required: true }]} style={formItemStyle}>
          <Input placeholder="e.g. 400001" />
        </Form.Item>
        <Form.Item name="branches" label="Number of Branches" style={formItemStyle}>
          <Input type="number" min={1} />
        </Form.Item>
      </Space>
    )
  }

  return (
    <div>
      <Breadcrumbs />
      <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={2}>Customer Board</Title>
        <Space wrap>
          <Input
            placeholder="Search by Retailer ID, Business Name, Store, Contact, GST"
            prefix={<SearchOutlined />}
            style={{ width: 280 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <RangePicker value={dateRange} onChange={setDateRange} allowClear />
          <Button icon={<ExportOutlined />} onClick={handleExport} loading={exporting}>
            Export
          </Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportModalVisible(true)}>
            Import
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
            Create Wholesaler
          </Button>
        </Space>
      </Space>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <Modal
        title="Create Wholesaler"
        open={createModalVisible}
        onOk={handleCreate}
        onCancel={() => {
          setCreateModalVisible(false)
          createForm.resetFields()
        }}
        width={640}
        confirmLoading={creating}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden', paddingRight: 16 } }}
      >
        <Form form={createForm} layout="vertical" style={{ maxWidth: '100%' }}>
          {sharedFormItems(createForm, true, { gstUrl: gstUrlCreate, panUrl: panUrlCreate })}
        </Form>
      </Modal>

      <Modal
        title="Edit Wholesaler"
        open={editModalVisible}
        onOk={handleEdit}
        onCancel={() => setEditModalVisible(false)}
        width={640}
        confirmLoading={updating}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden', paddingRight: 16 } }}
      >
        <Form form={form} layout="vertical" style={{ maxWidth: '100%' }}>
          {sharedFormItems(form, false, { gstUrl: gstUrlEdit, panUrl: panUrlEdit })}
        </Form>
      </Modal>

      <Modal
        title="View Wholesaler / Customer"
        open={viewModalVisible}
        onCancel={() => { setViewModalVisible(false); setViewRetailer(null) }}
        footer={[
          <Button key="close" onClick={() => { setViewModalVisible(false); setViewRetailer(null) }}>Close</Button>,
          viewRetailer && (
            <Button
              key="edit"
              type="primary"
              icon={<EditOutlined />}
              onClick={() => {
                setViewModalVisible(false)
                setSelectedRetailer(viewRetailer)
                form.setFieldsValue(retailerToForm(viewRetailer))
                setEditModalVisible(true)
                setViewRetailer(null)
              }}
            >
              Edit
            </Button>
          ),
        ]}
        width={560}
        styles={{ body: { maxHeight: 'none', overflow: 'visible', overflowX: 'hidden' } }}
      >
        {viewRetailer && (() => {
          const viewRows = [
            { key: '0', field: 'Retailer ID', value: viewRetailer.retailerId || '-' },
            { key: '1', field: 'Business Name', value: viewRetailer.businessName },
            { key: '2', field: 'Store Name', value: viewRetailer.storeName || '—' },
            { key: '3', field: 'Contact Person', value: viewRetailer.contactPerson },
            { key: '4', field: 'WhatsApp', value: [viewRetailer.whatsappCountryCode, viewRetailer.whatsappNumber].filter(Boolean).join(' ') || '—' },
            { key: '5', field: 'Email', value: viewRetailer.email || '—' },
            { key: '6', field: 'GST', value: viewRetailer.gst },
            { key: '7', field: 'GST Document', value: viewRetailer.gstAttachmentUrl ? <Link href={viewRetailer.gstAttachmentUrl} target="_blank" rel="noopener noreferrer">View file</Link> : '—' },
            { key: '8', field: 'PAN', value: viewRetailer.pan },
            { key: '9', field: 'PAN Document', value: viewRetailer.panAttachmentUrl ? <Link href={viewRetailer.panAttachmentUrl} target="_blank" rel="noopener noreferrer">View file</Link> : '—' },
            { key: '10', field: 'Address', value: [viewRetailer.street1, viewRetailer.street2, viewRetailer.city, viewRetailer.district, viewRetailer.state, viewRetailer.pincode].filter(Boolean).join(', ') || '—' },
            { key: '11', field: 'Branches', value: viewRetailer.branches ?? '—' },
            { key: '12', field: 'Status', value: <Tag style={{ margin: 0, padding: '2px 10px' }}>{STATUS_DISPLAY[viewRetailer.status] ?? viewRetailer.status}</Tag> },
            ...(viewRetailer.status === 'rejected' ? [
              { key: 'r1', field: 'Reject Reason', value: viewRetailer.rejectedReason || '—' },
              { key: 'r2', field: 'Rejected At', value: viewRetailer.rejectedAt ? new Date(viewRetailer.rejectedAt).toLocaleString() : '—' },
            ] : []),
            { key: '13', field: 'Created By', value: viewRetailer.createdBy || '—' },
            { key: '14', field: 'Created At', value: viewRetailer.createdAt || '—' },
          ]
          return (
            <Table
              dataSource={viewRows}
              columns={[{ title: 'Field', dataIndex: 'field', width: 140, render: (t) => <strong>{t}</strong> }, { title: 'Value', dataIndex: 'value' }]}
              pagination={false}
              size="small"
              showHeader
            />
          )
        })()}
      </Modal>

      <ImportRetailersModal
        title="Import Wholesalers / Customers"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        onSuccess={handleImportSuccess}
        onDownloadSample={handleDownloadSample}
        importMutation={[importRetailers, { isLoading: importMutationLoading }]}
        sampleLoading={sampleLoading}
        successMessageFragment="View them in My Requests."
      />
    </div>
  )
}

export default CustomerBoard
