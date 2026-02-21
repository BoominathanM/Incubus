import { baseApi } from './baseApi'

export const countryCodesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCountryCodes: build.query({
      query: () => '/api/country-codes',
      providesTags: [{ type: 'CountryCodes', id: 'LIST' }],
    }),
  }),
})

export const { useGetCountryCodesQuery } = countryCodesApi
