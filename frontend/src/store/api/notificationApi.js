import { baseApi } from './baseApi'

export const notificationApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getNotifications: build.query({
      query: (params) => ({ url: '/api/notifications', params }),
      providesTags: (result) =>
        result?.data?.notifications
          ? [
              ...result.data.notifications.map((n) => ({ type: 'Notifications', id: n._id })),
              { type: 'Notifications', id: 'LIST' },
            ]
          : [{ type: 'Notifications', id: 'LIST' }],
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }),
    getUnreadCount: build.query({
      query: () => '/api/notifications/unread-count',
      providesTags: [{ type: 'Notifications', id: 'LIST' }],
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }),
    markNotificationRead: build.mutation({
      query: (id) => ({ url: `/api/notifications/${id}/read`, method: 'PATCH' }),
      invalidatesTags: (_result, _err, id) => [{ type: 'Notifications', id }, { type: 'Notifications', id: 'LIST' }],
    }),
    markAllNotificationsRead: build.mutation({
      query: () => ({ url: '/api/notifications/mark-all-read', method: 'POST' }),
      invalidatesTags: [{ type: 'Notifications', id: 'LIST' }],
    }),
    deleteNotification: build.mutation({
      query: (id) => ({ url: `/api/notifications/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _err, id) => [{ type: 'Notifications', id }, { type: 'Notifications', id: 'LIST' }],
    }),
    clearAllNotifications: build.mutation({
      query: () => ({ url: '/api/notifications/clear-all', method: 'DELETE' }),
      invalidatesTags: [{ type: 'Notifications', id: 'LIST' }],
    }),
  }),
})

export const {
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useLazyGetNotificationsQuery,
  useLazyGetUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useDeleteNotificationMutation,
  useClearAllNotificationsMutation,
} = notificationApi
