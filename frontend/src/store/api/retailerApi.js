import { baseApi } from './baseApi'
import { getApiBase } from '../../utils/api'

export const retailerApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getRetailers: build.query({
      query: (params) => ({ url: '/api/retailers', params }),
      providesTags: (result) =>
        result?.retailers
          ? [...result.retailers.map(({ _id }) => ({ type: 'Retailers', id: _id })), { type: 'Retailers', id: 'LIST' }]
          : [{ type: 'Retailers', id: 'LIST' }],
    }),
    getRetailerStats: build.query({
      query: () => '/api/retailers/stats',
      providesTags: [{ type: 'Retailers', id: 'LIST' }],
    }),
    getRetailerById: build.query({
      query: (id) => `/api/retailers/${id}`,
      providesTags: (_result, _err, id) => [{ type: 'Retailers', id }],
    }),
    createRetailer: build.mutation({
      query: (body) => ({ url: '/api/retailers', method: 'POST', body }),
      invalidatesTags: [{ type: 'Retailers', id: 'LIST' }],
    }),
    updateRetailer: build.mutation({
      query: ({ id, ...body }) => ({ url: `/api/retailers/${id}`, method: 'PUT', body }),
      invalidatesTags: (_result, _err, { id }) => [{ type: 'Retailers', id }, { type: 'Retailers', id: 'LIST' }],
    }),
    deleteRetailer: build.mutation({
      query: (id) => ({ url: `/api/retailers/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _err, id) => [{ type: 'Retailers', id }, { type: 'Retailers', id: 'LIST' }],
    }),
    approveRetailer: build.mutation({
      query: (id) => ({ url: `/api/retailers/${id}/approve`, method: 'POST' }),
      invalidatesTags: (_result, _err, id) => [{ type: 'Retailers', id }, { type: 'Retailers', id: 'LIST' }],
    }),
    rejectRetailer: build.mutation({
      query: ({ id, reason }) => ({ url: `/api/retailers/${id}/reject`, method: 'POST', body: { reason } }),
      invalidatesTags: (_result, _err, { id }) => [{ type: 'Retailers', id }, { type: 'Retailers', id: 'LIST' }],
    }),
    setRetailerStatus: build.mutation({
      query: ({ id, status }) => ({ url: `/api/retailers/${id}/status`, method: 'PATCH', body: { status } }),
      invalidatesTags: (_result, _err, { id }) => [{ type: 'Retailers', id }, { type: 'Retailers', id: 'LIST' }],
    }),
    uploadRetailerFile: build.mutation({
      query: (formData) => ({ url: '/api/retailers/upload', method: 'POST', body: formData }),
    }),
    exportRetailers: build.query({
      query: (params) => ({
        url: '/api/retailers/export',
        params,
        responseHandler: (response) => response.blob(),
      }),
    }),
    downloadImportSample: build.query({
      query: () => ({
        url: '/api/retailers/import/sample',
        responseHandler: (response) => response.blob(),
      }),
    }),
    importRetailers: build.mutation({
      query: (formData) => ({ url: '/api/retailers/import', method: 'POST', body: formData }),
      invalidatesTags: [{ type: 'Retailers', id: 'LIST' }],
    }),
  }),
})

export const {
  useGetRetailersQuery,
  useLazyGetRetailersQuery,
  useGetRetailerByIdQuery,
  useGetRetailerStatsQuery,
  useCreateRetailerMutation,
  useUpdateRetailerMutation,
  useDeleteRetailerMutation,
  useApproveRetailerMutation,
  useRejectRetailerMutation,
  useSetRetailerStatusMutation,
  useUploadRetailerFileMutation,
  useLazyExportRetailersQuery,
  useLazyDownloadImportSampleQuery,
  useImportRetailersMutation,
} = retailerApi

export function downloadExportBlob(blob, filename = 'retailers-export.xlsx') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadSampleBlob(blob, filename = 'retailers-import-sample.xlsx') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
