const mongoose = require('mongoose')
const Retailer = require('../models/Retailer')
const { validateFileType, uploadToCloudinary } = require('../utils/uploadCloudinary')
const { generateRetailerId } = require('../utils/retailerId')
const XLSX = require('xlsx')

const MANDATORY_IMPORT_COLUMNS = [
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
const ALLOWED_IMPORT_COLUMNS = new Set([
  ...MANDATORY_IMPORT_COLUMNS,
  'storeName',
  'email',
  'street2',
  'branches',
  'altContactCountryCode',
  'altContactNumber',
])

function normalizeRow(row) {
  const out = {}
  const canonical = (s) => String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  const map = {
    businessname: 'businessName',
    storename: 'storeName',
    contactperson: 'contactPerson',
    whatsappcountrycode: 'whatsappCountryCode',
    whatsappnumber: 'whatsappNumber',
    altcontactcountrycode: 'altContactCountryCode',
    altcontactnumber: 'altContactNumber',
    street1: 'street1',
    street2: 'street2',
    city: 'city',
    district: 'district',
    state: 'state',
    pincode: 'pincode',
    branches: 'branches',
    gst: 'gst',
    gstnumber: 'gst',
    gstno: 'gst',
    pan: 'pan',
    pannumber: 'pan',
    panno: 'pan',
    email: 'email',
    emailid: 'email',
    emailaddress: 'email',
  }
  for (const [k, v] of Object.entries(row)) {
    const key = String(k || '').trim()
    if (!key) continue
    const norm = canonical(key)
    if (!norm) continue
    const field = map[norm] || map[norm.replace(/\d+$/, '')]
    if (field && ALLOWED_IMPORT_COLUMNS.has(field)) {
      let val = v == null ? '' : (typeof v === 'string' ? v.trim() : String(v).trim())
      if (field === 'branches') {
        const n = parseInt(val, 10)
        out[field] = (Number.isNaN(n) || n < 1) ? 1 : n
      } else {
        out[field] = val
      }
    }
  }
  return out
}

async function list(req, res) {
  try {
    const { status, search, dateFrom, dateTo } = req.query
    const isAdmin = ['admin', 'superadmin'].includes(req.user?.role)
    const userId = req.user?.id

    let query = {}
    if (status) {
      if (status === 'requests') query.status = 'pending_approval'
      else if (status === 'approved') query.status = { $in: ['approved', 'active', 'disabled'] }
      else if (status === 'rejected') query.status = 'rejected'
      else query.status = status
    }
    if (!isAdmin && userId) {
      if (status === 'requests') query.createdBy = userId
      if (status === 'rejected') query.createdBy = userId
      // for approved tab: show all approved/active/disabled (no createdBy filter)
    }

    if (search && search.trim()) {
      const s = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(s, 'i')
      query.$or = [
        { retailerId: regex },
        { businessName: regex },
        { storeName: regex },
        { contactPerson: regex },
        { gst: regex },
        { email: regex },
        { whatsappNumber: regex },
      ]
    }
    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
      if (dateTo) query.createdAt.$lte = new Date(dateTo)
    }

    const list = await Retailer.find(query)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean()

    const withCreatedBy = list.map((r) => ({
      ...r,
      createdBy: r.createdBy?.name || r.createdBy?.email || '—',
      createdById: r.createdBy?._id?.toString() || null,
      createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
    }))

    return res.json({ success: true, retailers: withCreatedBy })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, message: err.message || 'Failed to list retailers' })
  }
}

async function getById(req, res) {
  try {
    const r = await Retailer.findById(req.params.id).populate('createdBy', 'name email').lean()
    if (!r) return res.status(404).json({ success: false, message: 'Retailer not found' })
    const isAdmin = ['admin', 'superadmin'].includes(req.user?.role)
    if (!isAdmin && r.createdBy?._id?.toString() !== req.user?.id && r.status === 'pending_approval') {
      return res.status(403).json({ success: false, message: 'Not allowed' })
    }
    return res.json({ success: true, retailer: r })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to get retailer' })
  }
}

async function create(req, res) {
  try {
    const body = { ...req.body }
    const whatsappCountryCode = (body.whatsappCountryCode || '').trim() || '+91'
    const whatsappNumber = (body.whatsappNumber || '').trim()
    const email = (body.email || '').trim().toLowerCase()

    const existingByWhatsApp = await Retailer.findOne({
      whatsappCountryCode,
      whatsappNumber,
    })
    if (existingByWhatsApp) {
      return res.status(400).json({ success: false, message: 'A retailer with this WhatsApp number already exists.' })
    }
    if (email) {
      const existingByEmail = await Retailer.findOne({ email })
      if (existingByEmail) {
        return res.status(400).json({ success: false, message: 'A retailer with this email already exists.' })
      }
    }

    if (req.user?.role && ['admin', 'superadmin', 'executive'].includes(req.user.role)) {
      body.createdBy = req.user.id
    }
    body.retailerId = await generateRetailerId()
    if (!body.status) body.status = 'pending_approval'
    const retailer = await Retailer.create(body)
    const populated = await Retailer.findById(retailer._id).populate('createdBy', 'name email').lean()
    return res.status(201).json({ success: true, retailer: populated })
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || 'Failed to create retailer' })
  }
}

async function update(req, res) {
  try {
    const existing = await Retailer.findById(req.params.id)
    if (!existing) return res.status(404).json({ success: false, message: 'Retailer not found' })
    const isAdmin = ['admin', 'superadmin'].includes(req.user?.role)
    if (!isAdmin && existing.createdBy?.toString() !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Not allowed to edit this retailer' })
    }
    const allowed = [
      'businessName', 'storeName', 'contactPerson', 'email', 'whatsappCountryCode', 'whatsappNumber',
      'altContactCountryCode', 'altContactNumber', 'gst', 'pan', 'gstAttachmentUrl', 'panAttachmentUrl',
      'street1', 'street2', 'city', 'district', 'state', 'pincode', 'branches',
    ]
    if (isAdmin) allowed.push('status')
    for (const k of allowed) {
      if (req.body[k] !== undefined) existing[k] = req.body[k]
    }

    const whatsappCountryCode = (existing.whatsappCountryCode || '').trim() || '+91'
    const whatsappNumber = (existing.whatsappNumber || '').trim()
    const email = (existing.email || '').trim().toLowerCase()

    const duplicateWhatsApp = await Retailer.findOne({
      whatsappCountryCode,
      whatsappNumber,
      _id: { $ne: existing._id },
    })
    if (duplicateWhatsApp) {
      return res.status(400).json({ success: false, message: 'Another retailer already has this WhatsApp number.' })
    }
    if (email) {
      const duplicateEmail = await Retailer.findOne({
        email,
        _id: { $ne: existing._id },
      })
      if (duplicateEmail) {
        return res.status(400).json({ success: false, message: 'Another retailer already has this email.' })
      }
    }

    await existing.save()
    const populated = await Retailer.findById(existing._id).populate('createdBy', 'name email').lean()
    return res.json({ success: true, retailer: populated })
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || 'Failed to update retailer' })
  }
}

async function remove(req, res) {
  try {
    const existing = await Retailer.findById(req.params.id)
    if (!existing) return res.status(404).json({ success: false, message: 'Retailer not found' })
    const isAdmin = ['admin', 'superadmin'].includes(req.user?.role)
    if (!isAdmin && existing.createdBy?.toString() !== req.user?.id) {
      return res.status(403).json({ success: false, message: 'Not allowed to delete' })
    }
    await Retailer.findByIdAndDelete(req.params.id)
    return res.json({ success: true, message: 'Retailer removed' })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to delete' })
  }
}

async function approve(req, res) {
  try {
    const r = await Retailer.findById(req.params.id)
    if (!r) return res.status(404).json({ success: false, message: 'Retailer not found' })
    if (r.status !== 'pending_approval') {
      return res.status(400).json({ success: false, message: 'Retailer is not pending approval' })
    }
    r.status = 'active'
    r.approvedAt = new Date()
    await r.save()
    let retailer = r.toObject ? r.toObject() : r
    try {
      const populated = await Retailer.findById(r._id).populate('createdBy', 'name email').lean()
      if (populated) retailer = populated
    } catch (_) {
      // Populate failed (e.g. deleted user ref); approval still succeeded
    }
    return res.json({ success: true, retailer })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Approve failed' })
  }
}

async function reject(req, res) {
  try {
    const reason = (req.body?.reason || req.body?.rejectedReason || '').trim()
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reject reason is required' })
    }
    const r = await Retailer.findById(req.params.id)
    if (!r) return res.status(404).json({ success: false, message: 'Retailer not found' })
    if (r.status !== 'pending_approval') {
      return res.status(400).json({ success: false, message: 'Retailer is not pending approval' })
    }
    r.status = 'rejected'
    r.rejectedReason = reason
    r.rejectedAt = new Date()
    await r.save()
    let retailer = r.toObject ? r.toObject() : r
    try {
      const populated = await Retailer.findById(r._id).populate('createdBy', 'name email').lean()
      if (populated) retailer = populated
    } catch (_) {}
    return res.json({ success: true, retailer })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Reject failed' })
  }
}

async function setStatus(req, res) {
  try {
    const { status } = req.body
    if (!['active', 'disabled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be active or disabled' })
    }
    const r = await Retailer.findById(req.params.id)
    if (!r) return res.status(404).json({ success: false, message: 'Retailer not found' })
    if (!['approved', 'active', 'disabled'].includes(r.status)) {
      return res.status(400).json({ success: false, message: 'Can only activate/disable approved retailers' })
    }
    r.status = status
    await r.save()
    let retailer = r.toObject ? r.toObject() : r
    try {
      const populated = await Retailer.findById(r._id).populate('createdBy', 'name email').lean()
      if (populated) retailer = populated
    } catch (_) {}
    return res.json({ success: true, retailer })
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Update status failed' })
  }
}

async function upload(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No file uploaded' })
    }
    const validation = validateFileType(req.file)
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message })
    }
    const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim()
    if (!cloudName || !process.env.CLOUDINARY_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'Cloudinary not configured. In backend .env set CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY (get Cloud Name from https://console.cloudinary.com → Dashboard).',
      })
    }
    const folder = req.body?.folder || 'incubus/retailers'
    const url = await uploadToCloudinary(req.file.buffer, folder, null)
    return res.json({ success: true, url })
  } catch (err) {
    console.error(err)
    const msg = (err && err.message) ? String(err.message) : ''
    let userMessage = 'File upload failed. Please use a PDF, JPEG, JPG or PNG file (max 25MB) and try again.'
    if (msg.includes('File too large') || msg.includes('LIMIT_FILE_SIZE')) userMessage = 'File is too large. Maximum size is 25MB.'
    else if (msg.includes('cloud_name') || msg.includes('Cloudinary')) userMessage = 'File upload service is not configured correctly. Please contact support.'
    else if (msg.includes('Invalid') || msg.includes('format')) userMessage = 'Invalid file. Only PDF, JPEG, JPG and PNG are allowed.'
    return res.status(500).json({ success: false, message: userMessage })
  }
}

async function exportRetailers(req, res) {
  try {
    const { status, search, dateFrom, dateTo } = req.query
    const isAdmin = ['admin', 'superadmin'].includes(req.user?.role)
    const userId = req.user?.id

    let query = {}
    if (status === 'requests') query.status = 'pending_approval'
    else if (status === 'approved') query.status = { $in: ['approved', 'active', 'disabled'] }
    else if (status) query.status = status

    if (!isAdmin && userId && status === 'requests') query.createdBy = userId

    if (search && search.trim()) {
      const s = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.$or = [
        { retailerId: new RegExp(s, 'i') },
        { businessName: new RegExp(s, 'i') },
        { storeName: new RegExp(s, 'i') },
        { contactPerson: new RegExp(s, 'i') },
        { gst: new RegExp(s, 'i') },
        { email: new RegExp(s, 'i') },
        { whatsappNumber: new RegExp(s, 'i') },
      ]
    }
    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
      if (dateTo) query.createdAt.$lte = new Date(dateTo)
    }

    const list = await Retailer.find(query).populate('createdBy', 'name email').sort({ createdAt: -1 }).lean()
    const rows = list.map((r) => ({
      RetailerId: r.retailerId || '',
      BusinessName: r.businessName,
      StoreName: r.storeName || '',
      ContactPerson: r.contactPerson,
      WhatsAppCountryCode: r.whatsappCountryCode || '',
      WhatsAppNumber: r.whatsappNumber,
      Email: r.email || '',
      GST: r.gst,
      PAN: r.pan,
      Street1: r.street1,
      Street2: r.street2 || '',
      City: r.city,
      District: r.district,
      State: r.state,
      Pincode: r.pincode,
      Branches: r.branches ?? '',
      AltContactCountryCode: r.altContactCountryCode || '',
      AltContactNumber: r.altContactNumber || '',
      Status: r.status,
      CreatedBy: r.createdBy?.name || r.createdBy?.email || '',
      CreatedAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    }))
    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'No data to export' })
    }
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Retailers')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=retailers-export.xlsx')
    return res.send(buf)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, message: err.message || 'Export failed' })
  }
}

async function importSample(req, res) {
  try {
    const rows = [
      {
        BusinessName: 'Sample Business',
        StoreName: 'Sample Store',
        ContactPerson: 'Contact Name',
        WhatsAppCountryCode: '+91',
        WhatsAppNumber: '9876543210',
        Email: 'sample@example.com',
        GST: 'GST123456',
        PAN: 'PAN123456',
        Street1: 'Street 1',
        Street2: '',
        City: 'City',
        District: 'District',
        State: 'State',
        Pincode: '400001',
        Branches: 1,
        AltContactCountryCode: '+91',
        AltContactNumber: '',
      },
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Retailers')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=retailers-import-sample.xlsx')
    return res.send(buf)
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Sample download failed' })
  }
}

function applyMapping(rawRow, mapping) {
  if (!mapping || typeof mapping !== 'object') return null
  const out = {}
  const rawKeys = Object.keys(rawRow || {}).reduce((acc, k) => { acc[String(k).trim()] = rawRow[k]; return acc }, {})
  for (const [excelHeader, appField] of Object.entries(mapping)) {
    if (!appField || appField === '') continue
    const val = rawKeys[String(excelHeader).trim()]
    if (val === undefined || val === null) continue
    const s = typeof val === 'string' ? val.trim() : String(val).trim()
    if (s === '') continue
    if (appField === 'branches') {
      const n = parseInt(s, 10)
      out[appField] = (Number.isNaN(n) || n < 1) ? 1 : n
    } else {
      out[appField] = s
    }
  }
  return out
}

async function importRetailers(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No file uploaded' })
    }
    let mapping = null
    const rawBody = req.body && typeof req.body === 'object' ? req.body : {}
    const mappingRaw = rawBody.mapping
    if (mappingRaw) {
      try {
        mapping = typeof mappingRaw === 'string' ? JSON.parse(mappingRaw) : mappingRaw
        if (mapping && typeof mapping !== 'object') mapping = null
        if (mapping && Object.keys(mapping).length === 0) mapping = null
      } catch (_) {
        return res.status(400).json({ success: false, message: 'Invalid mapping JSON' })
      }
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' })
    const firstSheet = wb.SheetNames[0]
    const ws = wb.Sheets[firstSheet]
    const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
    const createdBy = req.user?.id || null
    const inserted = []
    const errors = []
    const seenWhatsApp = new Set()
    const seenEmail = new Set()

    for (let i = 0; i < raw.length; i++) {
      let row = null
      if (mapping) {
        row = { ...normalizeRow(raw[i]), ...(applyMapping(raw[i], mapping) || {}) }
      } else {
        row = normalizeRow(raw[i])
      }
      if (mapping && row) {
        const trimmed = {}
        for (const [k, v] of Object.entries(row)) {
          if (v != null && ALLOWED_IMPORT_COLUMNS.has(k)) trimmed[k] = k === 'branches' ? (Number(v) || 1) : String(v).trim()
        }
        row = trimmed
      }
      if (!row || Object.keys(row).length === 0) continue
      const missing = MANDATORY_IMPORT_COLUMNS.filter((col) => !(row[col] != null && String(row[col]).trim() !== ''))
      if (missing.length) {
        errors.push({ row: i + 2, message: `Missing mandatory: ${missing.join(', ')}` })
        continue
      }
      const whatsappKey = `${(row.whatsappCountryCode || '').trim()}|${(row.whatsappNumber || '').trim()}`
      if (seenWhatsApp.has(whatsappKey)) {
        errors.push({ row: i + 2, message: 'Duplicate WhatsApp number in file' })
        continue
      }
      const emailVal = (row.email || '').trim().toLowerCase()
      if (emailVal && seenEmail.has(emailVal)) {
        errors.push({ row: i + 2, message: 'Duplicate email in file' })
        continue
      }

      const existingByWhatsApp = await Retailer.findOne({
        whatsappCountryCode: (row.whatsappCountryCode || '').trim(),
        whatsappNumber: (row.whatsappNumber || '').trim(),
      })
      if (existingByWhatsApp) {
        errors.push({ row: i + 2, message: 'WhatsApp number already exists' })
        continue
      }
      if (emailVal) {
        const existingByEmail = await Retailer.findOne({ email: emailVal })
        if (existingByEmail) {
          errors.push({ row: i + 2, message: 'Email already exists' })
          continue
        }
      }

      seenWhatsApp.add(whatsappKey)
      if (emailVal) seenEmail.add(emailVal)

      const trim = (s) => (s != null ? String(s).trim() : '')
      const doc = {
        retailerId: await generateRetailerId(),
        businessName: trim(row.businessName),
        storeName: trim(row.storeName) || '',
        contactPerson: trim(row.contactPerson),
        email: (trim(row.email) || '').toLowerCase(),
        whatsappCountryCode: trim(row.whatsappCountryCode) || '+91',
        whatsappNumber: trim(row.whatsappNumber),
        altContactCountryCode: trim(row.altContactCountryCode) || '',
        altContactNumber: trim(row.altContactNumber) || '',
        gst: trim(row.gst),
        pan: trim(row.pan),
        street1: trim(row.street1),
        street2: trim(row.street2) || '',
        city: trim(row.city),
        district: trim(row.district),
        state: trim(row.state),
        pincode: trim(row.pincode),
        branches: Number.isNaN(parseInt(row.branches, 10)) ? 1 : Math.max(1, parseInt(row.branches, 10)),
        status: 'pending_approval',
        createdBy: createdBy ? (mongoose.Types.ObjectId.isValid(createdBy) ? new mongoose.Types.ObjectId(createdBy) : undefined) : undefined,
      }
      const created = await Retailer.create(doc)
      inserted.push(created._id)
    }

    return res.json({
      success: true,
      imported: inserted.length,
      errors: errors.length ? errors : undefined,
    })
  } catch (err) {
    console.error('Import error:', err)
    const msg = err.message || 'Import failed'
    return res.status(500).json({ success: false, message: msg })
  }
}

async function stats(req, res) {
  try {
    const isAdmin = ['admin', 'superadmin'].includes(req.user?.role)
    const userId = req.user?.id
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(todayStart)
    todayEnd.setDate(todayEnd.getDate() + 1)

    const baseQuery = isAdmin ? {} : { createdBy: userId }

    const approvedTodayQuery = {
      status: { $in: ['approved', 'active', 'disabled'] },
      approvedAt: { $gte: todayStart, $lt: todayEnd },
    }

    const [total, pending, approvedToday, rejectedToday, rejectedTotal, approvedTodayList] = await Promise.all([
      Retailer.countDocuments(isAdmin ? {} : { createdBy: userId }),
      Retailer.countDocuments({ ...baseQuery, status: 'pending_approval' }),
      Retailer.countDocuments(approvedTodayQuery),
      Retailer.countDocuments({
        status: 'rejected',
        rejectedAt: { $gte: todayStart, $lt: todayEnd },
      }),
      Retailer.countDocuments({ ...baseQuery, status: 'rejected' }),
      isAdmin
        ? Retailer.find(approvedTodayQuery)
            .select('retailerId businessName storeName approvedAt createdBy')
            .populate('createdBy', 'name email')
            .sort({ approvedAt: -1 })
            .lean()
        : [],
    ])

    const activeCount = await Retailer.countDocuments({ status: 'active' })
    const statsPayload = {
      totalRetailers: isAdmin ? total : undefined,
      activeRetailers: isAdmin ? activeCount : undefined,
      pendingApprovals: pending,
      approvedToday: isAdmin ? approvedToday : undefined,
      rejectedToday: isAdmin ? rejectedToday : undefined,
      rejectedTotal: rejectedTotal,
      requestsRaised: !isAdmin ? total : undefined,
      onboarded: !isAdmin ? await Retailer.countDocuments({ createdBy: userId, status: { $in: ['approved', 'active', 'disabled'] } }) : undefined,
    }
    if (isAdmin && Array.isArray(approvedTodayList)) {
      statsPayload.approvedTodayList = approvedTodayList.map((r) => ({
        _id: r._id,
        retailerId: r.retailerId || '',
        businessName: r.businessName,
        storeName: r.storeName,
        agentName: r.createdBy?.name || r.createdBy?.email || '-',
        approvedAt: r.approvedAt ? new Date(r.approvedAt).toISOString() : null,
      }))
    }
    return res.json({ success: true, stats: statsPayload })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, message: err.message || 'Failed to get stats' })
  }
}

async function statsByDate(req, res) {
  try {
    const isAdmin = ['admin', 'superadmin'].includes(req.user?.role)
    const userId = req.user?.id
    const group = (req.query.group || 'day').toLowerCase()
    const byMonth = group === 'month'

    const matchQuery = isAdmin ? {} : {}
    if (!isAdmin && userId) matchQuery.createdBy = new mongoose.Types.ObjectId(userId)
    const daysBack = byMonth ? 365 : 30
    const start = new Date()
    start.setDate(start.getDate() - daysBack)
    start.setHours(0, 0, 0, 0)
    matchQuery.createdAt = { $gte: start }

    const dateFormat = byMonth ? { $dateToString: { format: '%Y-%m', date: '$createdAt' } } : { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
    const pipeline = [
      { $match: matchQuery },
      { $group: { _id: dateFormat, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]
    const results = await Retailer.aggregate(pipeline)

    const labelKey = byMonth ? 'month' : 'date'
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const data = results.map((r) => {
      const id = r._id
      if (byMonth && id) {
        const [y, m] = id.split('-')
        const monthLabel = `${monthNames[parseInt(m, 10) - 1]} ${y}`
        return { [labelKey]: monthLabel, date: id, count: r.count }
      }
      return { [labelKey]: id, date: id, count: r.count }
    })

    return res.json({ success: true, data })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, message: err.message || 'Failed to get stats by date' })
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  approve,
  reject,
  setStatus,
  upload,
  exportRetailers,
  importSample,
  importRetailers,
  stats,
  statsByDate,
}
