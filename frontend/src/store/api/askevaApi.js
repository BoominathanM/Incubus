import { baseApi } from './baseApi'

export const askevaApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAskevaConfig: build.query({
      query: () => '/api/askeva/config',
      providesTags: [{ type: 'AskevaConfig', id: 'CONFIG' }],
    }),
    getAskevaCredentials: build.query({
      query: () => '/api/askeva/credentials',
      providesTags: [{ type: 'AskevaConfig', id: 'CREDENTIALS' }],
    }),
    saveAskevaConfig: build.mutation({
      query: (body) => ({
        url: '/api/askeva/config',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'AskevaConfig', id: 'CONFIG' }, { type: 'AskevaConfig', id: 'CREDENTIALS' }],
    }),
    testAskevaConnection: build.mutation({
      query: (body) => ({
        url: '/api/askeva/test-connection',
        method: 'POST',
        body: body || {},
      }),
      invalidatesTags: [{ type: 'AskevaConfig', id: 'CONFIG' }],
    }),
    disconnectAskeva: build.mutation({
      query: () => ({
        url: '/api/askeva/disconnect',
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'AskevaConfig', id: 'CONFIG' }, { type: 'AskevaConfig', id: 'CREDENTIALS' }],
    }),
    syncAskevaTemplates: build.mutation({
      query: () => ({
        url: '/api/askeva/sync-templates',
        method: 'POST',
      }),
      invalidatesTags: [{ type: 'AskevaConfig', id: 'CONFIG' }, { type: 'AskevaTemplates', id: 'LIST' }],
    }),
    getAskevaTemplates: build.query({
      query: (params) => ({
        url: '/api/askeva/templates',
        params: params || { page: 1, limit: 10 },
      }),
      providesTags: (result) =>
        result?.data?.templates
          ? [
              ...result.data.templates.map((t) => ({ type: 'AskevaTemplates', id: t._id })),
              { type: 'AskevaTemplates', id: 'LIST' },
            ]
          : [{ type: 'AskevaTemplates', id: 'LIST' }],
    }),
    getEventTemplateMappings: build.query({
      query: () => '/api/askeva/event-mappings',
      providesTags: (result) =>
        result?.data?.mappings
          ? [
              ...result.data.mappings.map((m) => ({ type: 'EventMappings', id: m._id })),
              { type: 'EventMappings', id: 'LIST' },
            ]
          : [{ type: 'EventMappings', id: 'LIST' }],
    }),
    saveEventTemplateMapping: build.mutation({
      query: (body) => {
        const { id, ...rest } = body
        return {
          url: id ? `/api/askeva/event-mappings/${id}` : '/api/askeva/event-mappings',
          method: id ? 'PUT' : 'POST',
          body: id ? rest : body,
        }
      },
      invalidatesTags: [{ type: 'EventMappings', id: 'LIST' }],
    }),
    deleteEventTemplateMapping: build.mutation({
      query: (id) => ({
        url: `/api/askeva/event-mappings/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, id) => [{ type: 'EventMappings', id }, { type: 'EventMappings', id: 'LIST' }],
    }),
  }),
})

export const {
  useGetAskevaConfigQuery,
  useGetAskevaCredentialsQuery,
  useSaveAskevaConfigMutation,
  useTestAskevaConnectionMutation,
  useDisconnectAskevaMutation,
  useSyncAskevaTemplatesMutation,
  useGetAskevaTemplatesQuery,
  useGetEventTemplateMappingsQuery,
  useSaveEventTemplateMappingMutation,
  useDeleteEventTemplateMappingMutation,
} = askevaApi
