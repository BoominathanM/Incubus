import { baseApi } from './baseApi'

export const orderApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getOrders: builder.query({
      query: (params = {}) => ({
        url: '/api/orders',
        params,
      }),
      providesTags: ['Orders'],
      keepUnusedDataFor: 60, // Cache 60s to reduce duplicate fetches
    }),

    getOrderById: builder.query({
      query: (orderId) => `/api/orders/${orderId}`,
      providesTags: (result, error, orderId) => [{ type: 'Orders', id: orderId }],
    }),

    updateOrder: builder.mutation({
      query: ({ orderId, ...body }) => ({
        url: `/api/orders/${orderId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (result, error, { orderId }) => [
        'Orders',
        { type: 'Orders', id: orderId },
      ],
    }),

    createOrder: builder.mutation({
      query: (body) => ({
        url: '/api/orders',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Orders'],
    }),

    backfillOrders: builder.mutation({
      query: () => ({
        url: '/api/orders/backfill',
        method: 'POST',
      }),
      invalidatesTags: ['Orders'],
    }),

    resetOrderCounter: builder.mutation({
      query: () => ({
        url: '/api/orders/reset-counter',
        method: 'POST',
      }),
      invalidatesTags: ['Orders'],
    }),
  }),
})

export const {
  useGetOrdersQuery,
  useGetOrderByIdQuery,
  useUpdateOrderMutation,
  useCreateOrderMutation,
  useBackfillOrdersMutation,
  useResetOrderCounterMutation,
} = orderApi
