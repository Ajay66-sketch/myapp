/**
 * eventHandlers.ts
 * Centralized socket event listeners
 * Attached once at app initialization via attachEventHandlers()
 * No UI rendering, no React hooks - pure event handling
 */

import { socketManager } from './socketManager'
import { useAuthStore } from '../auth/authStore'

let handlersAttached = false
let authExpiringHandler: ((payload: { secondsUntilExpiry: number }) => void) | null = null

const handleConnect = () => {
  console.log('[EventHandlers] Socket connected')
}

const handleDisconnect = (reason: string) => {
  console.log(`[EventHandlers] Socket disconnected: ${reason}`)
}

const handleRoomState = (data: any) => {
  console.log('[EventHandlers] Room state updated:', data)
}

const handleRoomMessage = (data: any) => {
  console.log('[EventHandlers] Room message:', data)
}

const handleTimerTick = (data: any) => {
  console.log('[EventHandlers] Timer tick:', data)
}

export function attachEventHandlers(): void {
  if (handlersAttached) {
    console.warn('[EventHandlers] Handlers already attached')
    return
  }

  authExpiringHandler = ({ secondsUntilExpiry }: { secondsUntilExpiry: number }) => {
    console.log(`[EventHandlers] Token expiring in ${secondsUntilExpiry}s`)

    const authStore = useAuthStore.getState()
    authStore.silentRefresh().then((newToken) => {
      if (newToken) {
        socketManager.sendReauth(newToken)
        console.log('[EventHandlers] Sent socket:reauth with new token')
      } else {
        console.error('[EventHandlers] Silent refresh failed')
      }
    })
  }

  socketManager.on('auth:expiring', authExpiringHandler)
  socketManager.on('connect', handleConnect)
  socketManager.on('disconnect', handleDisconnect)
  socketManager.on('room:state', handleRoomState)
  socketManager.on('room:message', handleRoomMessage)
  socketManager.on('timer:tick', handleTimerTick)

  handlersAttached = true
  console.log('[EventHandlers] All event handlers attached')
}

export function detachEventHandlers(): void {
  if (!handlersAttached) {
    return
  }

  if (authExpiringHandler) {
    socketManager.off('auth:expiring', authExpiringHandler)
    authExpiringHandler = null
  }

  socketManager.off('connect', handleConnect)
  socketManager.off('disconnect', handleDisconnect)
  socketManager.off('room:state', handleRoomState)
  socketManager.off('room:message', handleRoomMessage)
  socketManager.off('timer:tick', handleTimerTick)

  handlersAttached = false
  console.log('[EventHandlers] All event handlers detached')
}

export function areHandlersAttached(): boolean {
  return handlersAttached
}
