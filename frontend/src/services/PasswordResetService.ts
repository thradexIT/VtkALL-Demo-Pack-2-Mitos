import axiosInstance from './axiosInstance'
import env from '@/config/env.config'

export interface ResetPasswordPayload {
  userId: string
  email: string
  token: string
  password: string
}

export const requestPasswordReset = (email: string): Promise<number> =>
  axiosInstance
    .post(`/api/request-password-reset/${env.APP_TYPE}`, { email })
    .then((res) => res.status)

export const validatePasswordReset = (
  userId: string,
  email: string,
  token: string,
): Promise<number> =>
  axiosInstance
    .get(
      `/api/validate-password-reset/${env.APP_TYPE}/${encodeURIComponent(userId)}/${encodeURIComponent(email)}/${encodeURIComponent(token)}`,
    )
    .then((res) => res.status)

export const resetPassword = (payload: ResetPasswordPayload): Promise<number> =>
  axiosInstance
    .post(`/api/reset-password/${env.APP_TYPE}`, payload)
    .then((res) => res.status)
