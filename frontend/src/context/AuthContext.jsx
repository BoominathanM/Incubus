import React, { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext()

const API_BASE = import.meta.env.VITE_API_URL || ''

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

const VALID_ROLES = ['admin', 'executive', 'billing', 'warehouse', 'superadmin']

const AUTH_COOKIE_NAME = 'auth_token'
const AUTH_COOKIE_MAX_AGE_DAYS = 7

/** Set auth token in a cookie so it appears in the browser Cookies section */
function setAuthCookie(token) {
  const maxAge = AUTH_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 // seconds
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`
}

/** Clear all auth-related storage: cookies (same-origin), localStorage, sessionStorage */
function clearAuthStorage() {
  try {
    const cookies = document.cookie.split(';')
    for (let i = 0; i < cookies.length; i++) {
      const name = cookies[i].trim().split('=')[0]
      if (name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`
      }
    }
  } catch (_) {}
  document.cookie = `${AUTH_COOKIE_NAME}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
  localStorage.removeItem('user')
  localStorage.removeItem('token')
  sessionStorage.removeItem('user')
  sessionStorage.removeItem('token')
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedUser = localStorage.getItem('user')
    const token = localStorage.getItem('token')
    if (savedUser && token) {
      try {
        const parsed = JSON.parse(savedUser)
        if (parsed && VALID_ROLES.includes(parsed.role)) {
          setUser(parsed)
        } else {
          clearAuthStorage()
        }
      } catch {
        clearAuthStorage()
      }
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    if (!email?.trim() || !password) {
      return { success: false, message: 'Email and password are required' }
    }
    try {
      const { data } = await axios.post(`${API_BASE}/api/auth/login`, {
        email: email.trim().toLowerCase(),
        password,
      })
      if (data.success && data.user && data.token) {
        setUser(data.user)
        localStorage.setItem('user', JSON.stringify(data.user))
        localStorage.setItem('token', data.token)
        setAuthCookie(data.token)
        return { success: true }
      }
      return { success: false, message: data.message || 'Invalid email or password' }
    } catch (err) {
      const msg = err.response?.data?.message
      const message =
        msg ||
        (err.response?.status === 401 ? 'Invalid email or password' : err.response?.status === 403 ? 'Your account has been deactivated. Please contact your administrator.' : err.message || 'Login failed')
      return { success: false, message }
    }
  }

  const logout = async () => {
    const token = localStorage.getItem('token')
    try {
      if (token) {
        await axios.post(`${API_BASE}/api/auth/logout`, null, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }
    } catch {
    } finally {
      setUser(null)
      clearAuthStorage()
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
