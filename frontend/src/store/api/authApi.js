import { baseApi } from './baseApi'

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation({
      query: (body) => ({
        url: '/api/auth/login',
        method: 'POST',
        body,
      }),
    }),
    logout: build.mutation({
      query: () => ({
        url: '/api/auth/logout',
        method: 'POST',
      }),
    }),
  }),
})

export const { useLoginMutation, useLogoutMutation } = authApi
