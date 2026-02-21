const express = require('express')
const router = express.Router()
const { getDefaultCountryCode, getCountryCodesForApi, phoneUtils } = require('../utils/countryCodes')

// GET /api/country-codes – list all countries with limits, India first; defaultCode: +91
router.get('/', (req, res) => {
  res.json({
    success: true,
    countryCodes: getCountryCodesForApi(),
    defaultCode: getDefaultCountryCode(),
  })
})

// POST /api/country-codes/validate – validate mobile number for a country code (body: { countryCode, mobileNumber })
router.post('/validate', (req, res) => {
  const { countryCode, mobileNumber } = req.body || {}
  if (countryCode == null || mobileNumber == null) {
    return res.status(400).json({ success: false, message: 'countryCode and mobileNumber required' })
  }
  const valid = phoneUtils.validateMobileNumber(countryCode, mobileNumber)
  const limits = phoneUtils.getLimits(countryCode)
  res.json({
    success: true,
    valid,
    limits: limits || null,
  })
})

module.exports = router
