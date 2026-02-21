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
  const { data, isSuccess } = useGetCountryCodesQuery()
  const countryCodes = isSuccess && data?.success && Array.isArray(data.countryCodes) && data.countryCodes.length > 0
    ? data.countryCodes
    : FALLBACK_COUNTRY_CODES
  const defaultCode = data?.defaultCode || DEFAULT_COUNTRY_CODE

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
          rules={required ? [{ required: true, message: 'Number required' }] : undefined}
        >
          <Input placeholder="Number" type="tel" style={{ flex: 1 }} {...numberProps} />
        </Form.Item>
      </Space.Compact>
    </Form.Item>
  )
}

export default PhoneInput
export { FALLBACK_COUNTRY_CODES as COUNTRY_CODES, DEFAULT_COUNTRY_CODE }
