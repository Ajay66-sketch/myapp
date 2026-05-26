/**
 * tokenManager.ts
 * Centralized token lifecycle management
 * Handles: storage, expiry calculation, refresh strategy
 * Prevents duplicate refresh requests via shared lock
 */

import axios from 'axios'

const TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'
const USER_KEY = 'authUser'

interface DecodedToken {
  exp?: number
  sub?: string
  userId?: string
  sessionId?: string
  deviceId?: string
  [key: string]: any
}

interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

interface RefreshLock {
  isRefreshing: boolean
  refreshPromise: Promise<RefreshResponse | null> | null
}

const refreshLock: RefreshLock = {
  isRefreshing: false,
  refreshPromise: null,
}

function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:4000'
}

function decodeToken(token: string): DecodedToken | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    return JSON.parse(atob(parts[1]))
  } catch (err) {
    console.error('[TokenManager] Failed to decode token:', err)
    return null
  }
}

function getSecondsUntilExpiry(token: string): number {
  const decoded = decodeToken(token)
  if (!decoded?.exp) return 0

  const now = Math.floor(Date.now() / 1000)
  return Math.max(0, decoded.exp - now)
}

function isTokenExpired(token: string): boolean {
  return getSecondsUntilExpiry(token) === 0
}

function isTokenExpiringSoon(token: string, threshold: number = 300): boolean {
  const secondsUntilExpiry = getSecondsUntilExpiry(token)
  return secondsUntilExpiry > 0 && secondsUntilExpiry <= threshold
}

function storeTokens(accessToken: string, refreshToken: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  } catch (err) {
    console.error('[TokenManager] Failed to store tokens:', err)
  }
}

function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch (err) {
    console.error('[TokenManager] Failed to get access token:', err)
    return null
  }
}

function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch (err) {
    console.error('[TokenManager] Failed to get refresh token:', err)
    return null
  }
}

function clearTokens(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch (err) {
    console.error('[TokenManager] Failed to clear tokens:', err)
  }
}

function storeUser(user: unknown): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch (err) {
    console.error('[TokenManager] Failed to store user:', err)
  }
}

function getUser<T = unknown>(): T | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch (err) {
    console.error('[TokenManager] Failed to get user:', err)
    return null
  }
}

function clearUser(): void {
  try {
    localStorage.removeItem(USER_KEY)
  } catch (err) {
    console.error('[TokenManager] Failed to clear user:', err)
  }
}

async function refreshAccessToken(): Promise<RefreshResponse | null> {
  if (refreshLock.isRefreshing && refreshLock.refreshPromise) {
    return refreshLock.refreshPromise
  }

  refreshLock.isRefreshing = true
  refreshLock.refreshPromise = (async () => {
    try {
      const refreshToken = getRefreshToken()
      if (!refreshToken) {
        console.warn('[TokenManager] No refresh token available')
        return null
      }

      const response = await axios.post<RefreshResponse>(
        `${getApiUrl()}/auth/refresh`,
        { refreshToken },
        { withCredentials: true }
      )

      const { accessToken, refreshToken: newRefreshToken } = response.data
      if (!accessToken || !newRefreshToken) {
        console.warn('[TokenManager] Invalid refresh response')
        return null
      }

      storeTokens(accessToken, newRefreshToken)

      return {
        accessToken,
        refreshToken: newRefreshToken,
      }
    } catch (err) {
      console.error('[TokenManager] Token refresh failed:', err)
      return null
    }
  })()

  try {
    return await refreshLock.refreshPromise
  } finally {
    refreshLock.isRefreshing = false
    refreshLock.refreshPromise = null
  }
}

export const tokenManager = {
  storeTokens,
  getAccessToken,
  getRefreshToken,
  clearTokens,
  decodeToken,
  getSecondsUntilExpiry,
  isTokenExpired,
  isTokenExpiringSoon,
  refreshAccessToken,
  storeUser,
  getUser,
  clearUser,
}
