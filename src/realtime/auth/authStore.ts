/**
 * authStore.ts
 * Zustand store for centralized authentication state
 * Single source of truth for auth across the application
 */

import { create } from 'zustand'
import { tokenManager } from './tokenManager'

export interface User {
  id: string
  username: string
  email: string
  [key: string]: any
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isRefreshing: boolean
  isExpired: boolean
  isHydrated: boolean

  hydrate: () => void
  login: (user: User, accessToken: string, refreshToken: string) => void
  logout: () => void
  setTokens: (accessToken: string, refreshToken: string) => void
  setIsExpired: (isExpired: boolean) => void
  silentRefresh: () => Promise<string | null>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isRefreshing: false,
  isExpired: false,
  isHydrated: false,

  hydrate: () => {
    const state = get()
    if (state.isHydrated) {
      return
    }

    const accessToken = tokenManager.getAccessToken()
    const refreshToken = tokenManager.getRefreshToken()
    const user = tokenManager.getUser<User>()

    if (accessToken && !tokenManager.isTokenExpired(accessToken) && user) {
      set({
        user,
        accessToken,
        refreshToken,
        isAuthenticated: true,
        isHydrated: true,
      })
    } else {
      tokenManager.clearTokens()
      tokenManager.clearUser()
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isHydrated: true,
      })
    }
  },

  login: (user, accessToken, refreshToken) => {
    tokenManager.storeTokens(accessToken, refreshToken)
    tokenManager.storeUser(user)
    set({
      user,
      accessToken,
      refreshToken,
      isAuthenticated: true,
      isExpired: false,
    })
  },

  logout: () => {
    tokenManager.clearTokens()
    tokenManager.clearUser()
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isRefreshing: false,
      isExpired: false,
    })
  },

  setTokens: (accessToken, refreshToken) => {
    tokenManager.storeTokens(accessToken, refreshToken)
    set({
      accessToken,
      refreshToken,
      isExpired: false,
    })
  },

  setIsExpired: (isExpired) => {
    set({ isExpired })
  },

  silentRefresh: async () => {
    set({ isRefreshing: true })

    try {
      const result = await tokenManager.refreshAccessToken()

      if (!result) {
        set({ isExpired: true, isRefreshing: false })
        return null
      }

      set({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        isExpired: false,
        isRefreshing: false,
      })

      return result.accessToken
    } catch (err) {
      console.error('[AuthStore] Silent refresh error:', err)
      set({ isExpired: true, isRefreshing: false })
      return null
    }
  },
}))
