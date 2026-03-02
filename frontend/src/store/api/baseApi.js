import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { getApiBase } from '../../utils/api'

const baseQueryWithAuth = async (args, api, extraOptions) => {
  const isFormData = args?.body instanceof FormData
  const result = await fetchBaseQuery({
    baseUrl: getApiBase(),
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('token')
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (!isFormData) headers.set('Content-Type', 'application/json')
      return headers
    },
  })(args, api, extraOptions)
  if (result.error?.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }
  return result
}

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Users', 'CountryCodes', 'AskevaConfig', 'AskevaTemplates', 'EventMappings', 'Retailers', 'WebhookMessages'],
  endpoints: () => ({}),
})
