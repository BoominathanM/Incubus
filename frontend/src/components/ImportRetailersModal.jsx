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
  { value: 'businessName', label: <>Business Name <span style={{ color: '#ff4d4f' }}>*</span></> },
  { value: 'storeName', label: 'Store Name' },
  { value: 'contactPerson', label: <>Contact Person <span style={{ color: '#ff4d4f' }}>*</span></> },
  { value: 'whatsappCountryCode', label: <>WhatsApp Country Code <span style={{ color: '#ff4d4f' }}>*</span></> },
  { value: 'whatsappNumber', label: <>WhatsApp Number <span style={{ color: '#ff4d4f' }}>*</span></> },
  { value: 'email', label: 'Email' },
  { value: 'gst', label: <>GST Number <span style={{ color: '#ff4d4f' }}>*</span></> },
  { value: 'pan', label: <>PAN Number <span style={{ color: '#ff4d4f' }}>*</span></> },
  { value: 'street1', label: <>Street 1 <span style={{ color: '#ff4d4f' }}>*</span></> },
  { value: 'street2', label: 'Street 2' },
  { value: 'city', label: <>City <span style={{ color: '#ff4d4f' }}>*</span></> },
  { value: 'district', label: <>District <span style={{ color: '#ff4d4f' }}>*</span></> },
  { value: 'state', label: <>State <span style={{ color: '#ff4d4f' }}>*</span></> },
  { value: 'pincode', label: <>Pincode <span style={{ color: '#ff4d4f' }}>*</span></> },
  { value: 'branches', label: 'Branches' },
  { value: 'altContactCountryCode', label: 'Alt Contact Country Code' },
  { value: 'altContactNumber', label: 'Alt Contact Number' },
]

const FIELD_LABELS = {
  businessName: 'Business Name',
  contactPerson: 'Contact Person',
  whatsappCountryCode: 'WhatsApp Country Code',
  whatsappNumber: 'WhatsApp Number',
  gst: 'GST Number',
  pan: 'PAN Number',
  street1: 'Street 1',
  city: 'City',
  district: 'District',
  state: 'State',
  pincode: 'Pincode',
}

const MANDATORY_SOURCE_HEADERS = new Set([
  'businessname',
  'contactperson',
  'whatsappcountrycode',
  'whatsappnumber',
  'gst',
  'pan',
  'street1',
  'city',
  'district',
  'state',
  'pincode',
])

function canonicalHeader(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function summarizeImportErrors(errors = []) {
  const summary = {
    duplicateInFileWhatsApp: 0,
    duplicateInFileEmail: 0,
    duplicateInDbWhatsApp: 0,
    duplicateInDbEmail: 0,
    mandatoryMissing: 0,
    other: 0,
  }

  for (const err of errors) {
    const msg = String(err?.message || '').toLowerCase()
    if (msg.includes('duplicate whatsapp number in file')) summary.duplicateInFileWhatsApp += 1
    else if (msg.includes('duplicate email in file')) summary.duplicateInFileEmail += 1
    else if (msg.includes('whatsapp number already exists')) summary.duplicateInDbWhatsApp += 1
    else if (msg.includes('email already exists')) summary.duplicateInDbEmail += 1
    else if (msg.includes('missing mandatory')) summary.mandatoryMissing += 1
    else summary.other += 1
  }

  summary.duplicateTotal =
    summary.duplicateInFileWhatsApp +
    summary.duplicateInFileEmail +
    summary.duplicateInDbWhatsApp +
    summary.duplicateInDbEmail

  summary.totalErrors = errors.length
  return summary
}

const AUTO_MANAGED_SOURCE_HEADERS = new Set([
  'status',
  'createdby',
  'createdat',
])

const AUTO_FIELD_BY_HEADER = {
  businessname: 'businessName',
  storename: 'storeName',
  contactperson: 'contactPerson',
  whatsappcountrycode: 'whatsappCountryCode',
  whatsappnumber: 'whatsappNumber',
  email: 'email',
  emailid: 'email',
  emailaddress: 'email',
  gst: 'gst',
  gstnumber: 'gst',
  gstno: 'gst',
  pan: 'pan',
  pannumber: 'pan',
  panno: 'pan',
  street1: 'street1',
  street2: 'street2',
  city: 'city',
  district: 'district',
  state: 'state',
  pincode: 'pincode',
  branches: 'branches',
  altcontactcountrycode: 'altContactCountryCode',
  altcontactnumber: 'altContactNumber',
}

function inferFieldFromHeader(header) {
  return AUTO_FIELD_BY_HEADER[canonicalHeader(header)] || ''
}

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
        const headerRow = (raw || []).find((row) =>
          Array.isArray(row) && row.some((cell) => String(cell || '').trim() !== '')
        ) || []
        const headers = headerRow
          .map((h) => String(h || '').trim())
          .filter(Boolean)
          .filter((h) => !AUTO_MANAGED_SOURCE_HEADERS.has(canonicalHeader(h)))
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
        message.warning('No usable headers found in the file')
        return false
      }
      setHeaders(h)
      setColumnMapping(buildAutoMapping(h))
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

  const buildAutoMapping = useCallback((fileHeaders) => {
    const next = {}
    const used = new Set()
    fileHeaders.forEach((h) => {
      const inferred = inferFieldFromHeader(h)
      if (!inferred || used.has(inferred)) return
      next[h] = inferred
      used.add(inferred)
    })
    return next
  }, [])

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
      const labels = missing.map((f) => FIELD_LABELS[f] || f).join(', ')
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
      const importedCount = Number(result?.imported || 0)
      const errors = Array.isArray(result?.errors) ? result.errors : []
      const stats = summarizeImportErrors(errors)
      reset()
      onCancel?.()

      if (importedCount > 0) {
        onSuccess?.({ imported: importedCount, errors })
        const parts = [`${importedCount} retailer(s) imported successfully.`]
        if (stats.duplicateTotal > 0) {
          parts.push(
            `Duplicates skipped: ${stats.duplicateTotal} (WhatsApp: ${stats.duplicateInFileWhatsApp + stats.duplicateInDbWhatsApp}, Email: ${stats.duplicateInFileEmail + stats.duplicateInDbEmail}).`
          )
        }
        if (stats.mandatoryMissing > 0) {
          parts.push(`${stats.mandatoryMissing} row(s) skipped due to missing mandatory fields.`)
        }
        const remaining = stats.totalErrors - stats.duplicateTotal - stats.mandatoryMissing
        if (remaining > 0) {
          parts.push(`${remaining} row(s) skipped due to data issues.`)
        }
        parts.push(successMessageFragment)
        message.success(parts.join(' '))
      } else {
        const errMsg = stats.totalErrors
          ? `No rows imported. Duplicates: ${stats.duplicateTotal}. Missing mandatory: ${stats.mandatoryMissing}. Other issues: ${stats.totalErrors - stats.duplicateTotal - stats.mandatoryMissing}.`
          : 'No rows imported. Check mapping and data.'
        message.warning(errMsg)
      }
      if (errors.length) console.warn('Import errors:', errors)
    } catch (e) {
      message.error('Import failed. Please verify mapping and data, then try again.')
      console.error('Import error:', e?.data || e)
    } finally {
      setImporting(false)
    }
  }

  const isLoading = importLoading || importing

  const mappingDataSource = headers.map((h) => ({
    key: h,
    excelColumn: h,
    mapTo: columnMapping[h],
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
              {
                title: 'Column in your file',
                dataIndex: 'excelColumn',
                key: 'excelColumn',
                width: 200,
                render: (t) => {
                  const isMandatory = MANDATORY_SOURCE_HEADERS.has(canonicalHeader(t))
                  return (
                    <strong>
                      {t}
                      {isMandatory ? <span style={{ color: '#ff4d4f' }}> *</span> : null}
                    </strong>
                  )
                },
              },
              {
                title: 'Map to field',
                dataIndex: 'mapTo',
                key: 'mapTo',
                render: (_, record) => (
                  <Select
                    value={columnMapping[record.excelColumn]}
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
