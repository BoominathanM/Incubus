import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const API_BASE = import.meta.env.VITE_API_URL || ''

const baseQueryWithAuth = async (args, api, extraOptions) => {
  const result = await fetchBaseQuery({
    baseUrl: API_BASE,
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('token')
      if (token) headers.set('Authorization', `Bearer ${token}`)
      headers.set('Content-Type', 'application/json')
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
  tagTypes: ['Users', 'CountryCodes', 'AskevaConfig', 'AskevaTemplates', 'EventMappings'],
  endpoints: () => ({}),
})
