import React, { useState, useCallback } from 'react'
import { Tabs, Table, Tag, Button, Space, Input, Modal, Form, message, Typography, Upload, Row, Col, DatePicker, Alert } from 'antd'
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
} from '@ant-design/icons'
import Breadcrumbs from '../../components/Breadcrumbs'
import PhoneInput from '../../components/PhoneInput'
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
import { getUploadErrorMessage } from '../../utils/uploadErrors'

const { Title } = Typography
const { Link } = Typography
const { RangePicker } = DatePicker

const ALLOWED_UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png'
const STATUS_DISPLAY = {
  pending_approval: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  active: 'Active',
  disabled: 'Disabled',
}

const CustomerBoard = () => {
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
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting] = useState(false)
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
  const { data: listData, isLoading: listLoading } = useGetRetailersQuery(listParams)
  const retailers = listData?.retailers ?? []
  const [createRetailer, { isLoading: creating }] = useCreateRetailerMutation()
  const [updateRetailer, { isLoading: updating }] = useUpdateRetailerMutation()
  const [deleteRetailer] = useDeleteRetailerMutation()
  const [uploadFile, { isLoading: uploading }] = useUploadRetailerFileMutation()
  const [triggerExport, { isLoading: exporting }] = useLazyExportRetailersQuery()
  const [triggerSample, { isLoading: sampleLoading }] = useLazyDownloadImportSampleQuery()
  const [importRetailers, { isLoading: importMutationLoading }] = useImportRetailersMutation()

  const isOwn = (record) => user?._id && record.createdById === user._id

  const requestColumns = [
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
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => {
              setViewRetailer(record)
              setViewModalVisible(true)
            }}
          >
            View
          </Button>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedRetailer(record)
              form.setFieldsValue(retailerToForm(record))
              setEditModalVisible(true)
            }}
          >
            Edit
          </Button>
          {isOwn(record) && record.status === 'pending_approval' && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={async () => {
                try {
                  await deleteRetailer(record._id).unwrap()
                  message.success('Request removed')
                } catch (e) {
                  message.error(e?.data?.message || 'Remove failed')
                }
              }}
            >
              Remove
            </Button>
          )}
        </Space>
      ),
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
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => {
              setViewRetailer(record)
              setViewModalVisible(true)
            }}
          >
            View
          </Button>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedRetailer(record)
              form.setFieldsValue(retailerToForm(record))
              setEditModalVisible(true)
            }}
          >
            Edit
          </Button>
        </Space>
      ),
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
      width: 140,
      render: (_, record) => (
        <Space size="small" wrap>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setViewRetailer(record)
              setViewModalVisible(true)
            }}
          >
            View
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedRetailer(record)
              form.setFieldsValue(retailerToForm(record))
              setEditModalVisible(true)
            }}
          >
            Edit
          </Button>
        </Space>
      ),
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
    try {
      const blob = await triggerExport(listParams).unwrap()
      downloadExportBlob(blob)
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

  const handleImport = async () => {
    if (!importFile) {
      message.warning('Please select a file')
      return
    }
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      const result = await importRetailers(formData).unwrap()
      setImportModalVisible(false)
      setImportFile(null)
      if (result.imported > 0) {
        setActiveTab('requests')
        message.success(`${result.imported} retailer(s) imported. View them in My Requests.${result.errors?.length ? ` ${result.errors.length} row(s) had errors.` : ''}`)
      } else {
        const errMsg = result.errors?.length
          ? `No rows imported. ${result.errors.length} row(s) had errors (check headers match sample and no duplicate WhatsApp/email).`
          : 'No rows imported. Check that column headers match the sample file.'
        message.warning(errMsg)
      }
      if (result.errors?.length) console.warn('Import errors:', result.errors)
    } catch (e) {
      message.error(e?.data?.message || e?.message || 'Import failed')
    } finally {
      setImporting(false)
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
          pagination={{ pageSize: 10 }}
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
          pagination={{ pageSize: 10 }}
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
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
        />
      ),
    },
  ]

  const sharedFormItems = (formInstance, isCreate, attachmentUrls = {}) => {
    const { gstUrl = '', panUrl = '' } = attachmentUrls
    if (!formInstance) return null
    return (
      <>
        <Form.Item name="businessName" label="Business Name" rules={[{ required: true }]}>
          <Input placeholder="Business / company name" />
        </Form.Item>
        <Form.Item name="storeName" label="Store Name">
          <Input placeholder="Store / outlet name (optional)" />
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
            <Form.Item name="gstAttachmentUrl" hidden>
              <Input type="hidden" />
            </Form.Item>
            <Form.Item label="GST Attachment" help="PDF, JPEG, JPG, PNG only">
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
        <Row gutter={12}>
          <Col span={14}>
            <Form.Item name="pan" label="PAN Number" rules={[{ required: true }]}>
              <Input placeholder="PAN Number" />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="panAttachmentUrl" hidden>
              <Input type="hidden" />
            </Form.Item>
            <Form.Item label="PAN Attachment" help="PDF, JPEG, JPG, PNG only">
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
          <Input type="number" min={1} />
        </Form.Item>
      </>
    )
  }

  return (
    <div>
      <Breadcrumbs />
      <Space style={{ marginBottom: 24, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Title level={2}>Customer Board</Title>
        <Space wrap>
          <Input
            placeholder="Search by Business Name, Store, Contact, GST"
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
      >
        <Form form={createForm} layout="vertical">
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
      >
        <Form form={form} layout="vertical">
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
      >
        {viewRetailer && (
          <div style={{ maxHeight: 480, overflow: 'auto' }}>
            <p><strong>Business Name:</strong> {viewRetailer.businessName}</p>
            <p><strong>Store Name:</strong> {viewRetailer.storeName || '—'}</p>
            <p><strong>Contact Person:</strong> {viewRetailer.contactPerson}</p>
            <p><strong>WhatsApp:</strong> {viewRetailer.whatsappCountryCode} {viewRetailer.whatsappNumber}</p>
            <p><strong>Email:</strong> {viewRetailer.email || '—'}</p>
            <p><strong>GST:</strong> {viewRetailer.gst}</p>
            <p>
              <strong>GST Document:</strong>{' '}
              {viewRetailer.gstAttachmentUrl ? (
                <Link href={viewRetailer.gstAttachmentUrl} target="_blank" rel="noopener noreferrer">View file</Link>
              ) : '—'}
            </p>
            <p><strong>PAN:</strong> {viewRetailer.pan}</p>
            <p>
              <strong>PAN Document:</strong>{' '}
              {viewRetailer.panAttachmentUrl ? (
                <Link href={viewRetailer.panAttachmentUrl} target="_blank" rel="noopener noreferrer">View file</Link>
              ) : '—'}
            </p>
            <p><strong>Address:</strong> {[viewRetailer.street1, viewRetailer.street2, viewRetailer.city, viewRetailer.district, viewRetailer.state, viewRetailer.pincode].filter(Boolean).join(', ')}</p>
            <p><strong>Branches:</strong> {viewRetailer.branches ?? '—'}</p>
            <p><strong>Status:</strong> <Tag style={{ margin: 0, padding: '2px 10px' }}>{STATUS_DISPLAY[viewRetailer.status] ?? viewRetailer.status}</Tag></p>
            {viewRetailer.status === 'rejected' && (
              <>
                <p><strong>Reject Reason:</strong> {viewRetailer.rejectedReason || '—'}</p>
                <p><strong>Rejected At:</strong> {viewRetailer.rejectedAt ? new Date(viewRetailer.rejectedAt).toLocaleString() : '—'}</p>
              </>
            )}
            <p><strong>Created By:</strong> {viewRetailer.createdBy}</p>
            <p><strong>Created At:</strong> {viewRetailer.createdAt || '—'}</p>
          </div>
        )}
      </Modal>

      <Modal
        title="Import Wholesalers / Customers"
        open={importModalVisible}
        onCancel={() => {
          setImportModalVisible(false)
          setImportFile(null)
        }}
        footer={[
          <Button key="cancel" onClick={() => { setImportModalVisible(false); setImportFile(null); }}>
            Cancel
          </Button>,
          <Button key="sample" icon={<DownloadOutlined />} onClick={handleDownloadSample} loading={sampleLoading}>
            Download Sample
          </Button>,
          <Button key="submit" type="primary" onClick={handleImport} loading={importing || importMutationLoading} disabled={!importFile}>
            Upload & Import
          </Button>,
        ]}
        width={520}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Only mandatory columns are allowed. Duplicate WhatsApp number or email (in DB or in file) will be skipped."
        />
        <p style={{ marginBottom: 12 }}>
          Allowed columns: Business Name, Store Name, Contact Person, WhatsApp Country Code, WhatsApp Number, Email, GST, PAN, Street1, Street2, City, District, State, Pincode, Branches, Alt Contact Country Code, Alt Contact Number.
        </p>
        <Upload.Dragger
          maxCount={1}
          accept=".xlsx,.xls,.csv"
          beforeUpload={(file) => {
            setImportFile(file)
            return false
          }}
          onRemove={() => setImportFile(null)}
          fileList={importFile ? [{ name: importFile.name, uid: '-1' }] : []}
        >
          <p className="ant-upload-text">Click or drag file to this area</p>
          <p className="ant-upload-hint">Excel or CSV only. No extra columns.</p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default CustomerBoard
