/**
 * AuthProvider.tsx
 * React context provider for authentication
 * Initializes: authStore hydration, socket connection, event handlers
 * Wraps entire app
 */

import { ReactNode, useEffect } from 'react'
import { useAuthStore } from '../auth/authStore'
import { socketManager } from '../socket/socketManager'
import { attachEventHandlers, detachEventHandlers } from '../socket/eventHandlers'

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const {
    hydrate,
    isHydrated,
    isAuthenticated,
    accessToken,
  } = useAuthStore((state) => ({
    hydrate: state.hydrate,
    isHydrated: state.isHydrated,
    isAuthenticated: state.isAuthenticated,
    accessToken: state.accessToken,
  }))

  useEffect(() => {
    hydrate()
    attachEventHandlers()

    return () => {
      detachEventHandlers()
      if (socketManager.isConnected()) {
        socketManager.disconnect()
      }
    }
  }, [hydrate])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    if (isAuthenticated && accessToken && !socketManager.isConnected()) {
      socketManager.connect(accessToken)
    }

    if (!isAuthenticated && socketManager.isConnected()) {
      socketManager.disconnect()
    }
  }, [isHydrated, isAuthenticated, accessToken])

  if (!isHydrated) {
    return <div>Loading...</div>
  }

  return <>{children}</>
}
