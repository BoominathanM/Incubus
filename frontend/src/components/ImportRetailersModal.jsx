import React, { useState, useCallback } from 'react'
import { Modal, Button, Upload, Alert, Table, Select, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'

const MANDATORY_FIELDS = [
  'businessName',
  'contactPerson',
  'whatsappCountryCode',
  'whatsappNumber',
  'gst',
  'pan',
  'street1',
  'city',
  'district',
  'state',
  'pincode',
]

const APP_FIELD_OPTIONS = [
  { value: '', label: "Don't import" },
  { value: 'businessName', label: 'Business Name (required)' },
  { value: 'storeName', label: 'Store Name' },
  { value: 'contactPerson', label: 'Contact Person (required)' },
  { value: 'whatsappCountryCode', label: 'WhatsApp Country Code (required)' },
  { value: 'whatsappNumber', label: 'WhatsApp Number (required)' },
  { value: 'email', label: 'Email' },
  { value: 'gst', label: 'GST Number (required)' },
  { value: 'pan', label: 'PAN Number (required)' },
  { value: 'street1', label: 'Street 1 (required)' },
  { value: 'street2', label: 'Street 2' },
  { value: 'city', label: 'City (required)' },
  { value: 'district', label: 'District (required)' },
  { value: 'state', label: 'State (required)' },
  { value: 'pincode', label: 'Pincode (required)' },
  { value: 'branches', label: 'Branches' },
  { value: 'altContactCountryCode', label: 'Alt Contact Country Code' },
  { value: 'altContactNumber', label: 'Alt Contact Number' },
]

function getHeadersFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const firstSheet = wb.SheetNames[0]
        const ws = wb.Sheets[firstSheet]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        const headers = (raw[0] || []).map((h) => String(h || '').trim()).filter(Boolean)
        resolve(headers)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

export default function ImportRetailersModal({
  open,
  onCancel,
  onSuccess,
  onDownloadSample,
  importMutation,
  sampleLoading = false,
  successMessageFragment = 'View them in Approval Requests.',
  title = 'Import Retailers',
}) {
  const [step, setStep] = useState('upload')
  const [importFile, setImportFile] = useState(null)
  const [headers, setHeaders] = useState([])
  const [columnMapping, setColumnMapping] = useState({})
  const [importing, setImporting] = useState(false)

  const [triggerImport, { isLoading: importLoading }] = importMutation || []

  const reset = useCallback(() => {
    setStep('upload')
    setImportFile(null)
    setHeaders([])
    setColumnMapping({})
  }, [])

  const handleCancel = () => {
    reset()
    onCancel?.()
  }

  const handleFileSelect = async (file) => {
    const ext = (file.name || '').toLowerCase().split('.').pop()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      message.error('Only Excel (.xlsx, .xls) or CSV allowed')
      return false
    }
    setImportFile(file)
    try {
      const h = await getHeadersFromFile(file)
      if (!h.length) {
        message.warning('No headers found in the first row')
        return false
      }
      setHeaders(h)
      setColumnMapping({})
      setStep('mapping')
    } catch (e) {
      message.error(e?.message || 'Failed to read file headers')
      setImportFile(null)
      return false
    }
    return false
  }

  const setMappingForHeader = (excelHeader, appField) => {
    setColumnMapping((prev) => {
      const next = { ...prev }
      if (appField) next[excelHeader] = appField
      else delete next[excelHeader]
      return next
    })
  }

  const getMappingForSubmit = () => {
    const mapping = {}
    headers.forEach((h) => {
      const appField = columnMapping[h]
      if (appField) mapping[h] = appField
    })
    return mapping
  }

  const validateMapping = () => {
    const mapping = getMappingForSubmit()
    const mappedFields = new Set(Object.values(mapping))
    const missing = MANDATORY_FIELDS.filter((f) => !mappedFields.has(f))
    if (missing.length) {
      const labels = missing.map((f) => APP_FIELD_OPTIONS.find((o) => o.value === f)?.label || f).join(', ')
      message.warning(`Map all mandatory fields: ${labels}`)
      return false
    }
    return true
  }

  const handleImport = async () => {
    if (!importFile) {
      message.warning('Please select a file')
      return
    }
    if (step === 'upload') {
      message.warning('Please complete column mapping first')
      return
    }
    if (!validateMapping()) return

    const mapping = getMappingForSubmit()
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('mapping', JSON.stringify(mapping))
      formData.append('file', importFile)
      const result = await triggerImport(formData).unwrap()
      reset()
      onCancel?.()
      if (result.imported > 0) {
        onSuccess?.({ imported: result.imported, errors: result.errors })
        message.success(
          `${result.imported} retailer(s) imported. ${successMessageFragment}${result.errors?.length ? ` ${result.errors.length} row(s) had errors.` : ''}`
        )
      } else {
        const errMsg = result.errors?.length
          ? `No rows imported. ${result.errors.length} row(s) had errors (check mandatory fields and duplicate WhatsApp/email).`
          : 'No rows imported. Check mapping and data.'
        message.warning(errMsg)
      }
      if (result.errors?.length) console.warn('Import errors:', result.errors)
    } catch (e) {
      const errMsg = e?.data?.message || e?.data?.error || e?.message || 'Import failed'
      message.error(errMsg)
      console.error('Import error:', e?.data || e)
    } finally {
      setImporting(false)
    }
  }

  const isLoading = importLoading || importing

  const mappingDataSource = headers.map((h) => ({
    key: h,
    excelColumn: h,
    mapTo: columnMapping[h] ?? '',
  }))

  const footer = [
    <Button key="cancel" onClick={handleCancel}>
      Cancel
    </Button>,
    step === 'mapping' && (
      <Button key="back" onClick={() => { setStep('upload'); setImportFile(null); setHeaders([]); setColumnMapping({}) }}>
        Change file
      </Button>
    ),
    <Button key="sample" icon={<DownloadOutlined />} onClick={onDownloadSample} loading={sampleLoading}>
      Download Sample
    </Button>,
    step === 'mapping' && (
      <Button key="import" type="primary" onClick={handleImport} loading={isLoading}>
        Upload & Import
      </Button>
    ),
  ].filter(Boolean)

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleCancel}
      footer={footer}
      width={step === 'mapping' ? 640 : 520}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden' } }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Map your Excel/CSV columns to retailer fields. Mandatory fields must be mapped. Duplicate WhatsApp or email (in file or in DB) will be skipped."
      />

      {step === 'upload' && (
        <>
          <p style={{ marginBottom: 12 }}>
            Upload a file, then map each column to the correct field. Mandatory fields: Business Name, Contact Person, WhatsApp Country Code & Number, GST, PAN, Street1, City, District, State, Pincode.
          </p>
          <Upload.Dragger
            maxCount={1}
            accept=".xlsx,.xls,.csv"
            beforeUpload={handleFileSelect}
            onRemove={() => { setImportFile(null); setHeaders([]) }}
            fileList={importFile ? [{ name: importFile.name, uid: '-1' }] : []}
          >
            <p className="ant-upload-text">Click or drag file here</p>
            <p className="ant-upload-hint">Excel or CSV. First row must be headers.</p>
          </Upload.Dragger>
        </>
      )}

      {step === 'mapping' && (
        <>
          <p style={{ marginBottom: 12 }}>
            <strong>Map each column from your file to a field below.</strong> All mandatory fields must be mapped for import to succeed.
          </p>
          <Table
            dataSource={mappingDataSource}
            columns={[
              { title: 'Column in your file', dataIndex: 'excelColumn', key: 'excelColumn', width: 200, render: (t) => <strong>{t}</strong> },
              {
                title: 'Map to field',
                dataIndex: 'mapTo',
                key: 'mapTo',
                render: (_, record) => (
                  <Select
                    value={columnMapping[record.excelColumn] ?? ''}
                    onChange={(v) => setMappingForHeader(record.excelColumn, v)}
                    options={APP_FIELD_OPTIONS}
                    placeholder="Select field"
                    style={{ width: '100%' }}
                    allowClear
                  />
                ),
              },
            ]}
            pagination={false}
            size="small"
          />
        </>
      )}
    </Modal>
  )
}
