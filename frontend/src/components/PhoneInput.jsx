import React from 'react'
import { Form, Input, Select, Space } from 'antd'
import { useGetCountryCodesQuery } from '../store/api/countryCodesApi'

const { Option } = Select

const FALLBACK_COUNTRY_CODES = [
  { code: '+91', country: 'India', min: 10, max: 10, flag: '🇮🇳' },
  { code: '+1', country: 'USA/Canada', min: 10, max: 10, flag: '🇺🇸' },
  { code: '+44', country: 'UK', min: 10, max: 10, flag: '🇬🇧' },
]
const DEFAULT_COUNTRY_CODE = '+91'

/**
 * Renders country code (Select) + number (Input). Uses store API slice (country codes from backend).
 */
const PhoneInput = ({
  countryCodeName,
  numberName,
  required = false,
  label = 'Phone Number',
  numberProps = {},
  defaultCountryCode = DEFAULT_COUNTRY_CODE,
}) => {
  const form = Form.useFormInstance()
  const { data, isSuccess } = useGetCountryCodesQuery()
  const countryCodes = isSuccess && data?.success && Array.isArray(data.countryCodes) && data.countryCodes.length > 0
    ? data.countryCodes
    : FALLBACK_COUNTRY_CODES
  const defaultCode = data?.defaultCode || DEFAULT_COUNTRY_CODE
  const selectedCountryCode = Form.useWatch(countryCodeName, form)
  const activeCode = selectedCountryCode || defaultCountryCode || defaultCode
  const selectedCountry = countryCodes.find((c) => c.code === activeCode)
  const minDigits = selectedCountry?.min
  const maxDigits = selectedCountry?.max

  const numberRules = []
  if (required) {
    numberRules.push({ required: true, message: 'Number required' })
  }
  numberRules.push({
    validator: (_, value) => {
      const digits = String(value || '').replace(/\D/g, '')
      if (!digits) return Promise.resolve()
      if (!/^\d+$/.test(digits)) return Promise.reject(new Error('Only numbers are allowed'))
      if (typeof minDigits === 'number' && digits.length < minDigits) {
        return Promise.reject(new Error(`Number must be at least ${minDigits} digits for ${activeCode}`))
      }
      if (typeof maxDigits === 'number' && digits.length > maxDigits) {
        return Promise.reject(new Error(`Number must be at most ${maxDigits} digits for ${activeCode}`))
      }
      return Promise.resolve()
    },
  })

  return (
    <Form.Item label={label} required={required}>
      <Space.Compact style={{ width: '100%' }} block>
        <Form.Item
          name={countryCodeName}
          noStyle
          initialValue={defaultCountryCode || defaultCode}
          rules={required ? [{ required: true, message: 'Code' }] : undefined}
        >
          <Select placeholder="Code" style={{ width: 140 }} showSearch optionFilterProp="children">
            {countryCodes.map(({ code, country, flag }) => (
              <Option key={code} value={code}>
                {flag ? `${flag} ` : ''}{code} {country}
              </Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item
          name={numberName}
          noStyle
          rules={numberRules}
          getValueFromEvent={(e) => String(e?.target?.value || '').replace(/\D/g, '')}
        >
          <Input
            placeholder="Number"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={typeof maxDigits === 'number' ? maxDigits : undefined}
            style={{ flex: 1 }}
            {...numberProps}
          />
        </Form.Item>
      </Space.Compact>
    </Form.Item>
  )
}

export default PhoneInput
export { FALLBACK_COUNTRY_CODES as COUNTRY_CODES, DEFAULT_COUNTRY_CODE }
