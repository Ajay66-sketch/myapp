import { useMemo } from 'react'
import { useAuthStore, User } from './authStore'

export function useAuth() {
  const { user, accessToken, isAuthenticated, isRefreshing, isExpired, login, logout, silentRefresh } = useAuthStore(
    (state) => ({
      user: state.user,
      accessToken: state.accessToken,
      isAuthenticated: state.isAuthenticated,
      isRefreshing: state.isRefreshing,
      isExpired: state.isExpired,
      login: state.login,
      logout: state.logout,
      silentRefresh: state.silentRefresh,
    })
  )

  return useMemo(
    () => ({
      user,
      accessToken,
      isAuthenticated,
      isRefreshing,
      isExpired,
      login,
      logout,
      silentRefresh,
    }),
    [user, accessToken, isAuthenticated, isRefreshing, isExpired, login, logout, silentRefresh]
  )
}

export type UseAuthReturn = ReturnType<typeof useAuth>
