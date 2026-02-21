import { baseApi } from './baseApi'

export const userApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getUsers: build.query({
      query: () => '/api/users',
      providesTags: (result) =>
        result?.users
          ? [...result.users.map(({ id }) => ({ type: 'Users', id })), { type: 'Users', id: 'LIST' }]
          : [{ type: 'Users', id: 'LIST' }],
    }),
    createUser: build.mutation({
      query: (body) => ({
        url: '/api/users',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Users', id: 'LIST' }],
    }),
    updateUser: build.mutation({
      query: ({ id, ...body }) => ({
        url: `/api/users/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _err, { id }) => [{ type: 'Users', id }, { type: 'Users', id: 'LIST' }],
    }),
    updateUserStatus: build.mutation({
      query: ({ id, status }) => ({
        url: `/api/users/${id}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: (_result, _err, { id }) => [{ type: 'Users', id }, { type: 'Users', id: 'LIST' }],
    }),
    deleteUser: build.mutation({
      query: (id) => ({
        url: `/api/users/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _err, id) => [{ type: 'Users', id }, { type: 'Users', id: 'LIST' }],
    }),
  }),
})

export const {
  useGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useUpdateUserStatusMutation,
  useDeleteUserMutation,
} = userApi
