/**
 * socketManager.ts
 * Clean abstraction layer over socket.io-client
 * Handles: connect, disconnect, emit, on/off
 * Single responsibility: transport lifecycle management
 */

import { Socket } from 'socket.io-client'
import { socketClient } from './socketClient'

type SocketEventHandler = (...args: any[]) => void

interface SocketManagerInterface {
  connect: (accessToken: string) => void
  disconnect: () => void
  emit: (eventName: string, data?: any, ack?: (response: any) => void) => void
  on: (eventName: string, handler: SocketEventHandler) => void
  off: (eventName: string, handler: SocketEventHandler) => void
  sendReauth: (accessToken: string) => void
  isConnected: () => boolean
}

/**
 * Socket manager: transport-only abstraction
 * No business logic, no state management beyond transport
 */
export const socketManager: SocketManagerInterface = {
  /**
   * Connect socket with JWT token
   * Wrapper around socketClient.connectSocket()
   */
  connect: (accessToken: string) => {
    try {
      socketClient.connectSocket(accessToken)
    } catch (err) {
      console.error('[SocketManager] Connect failed:', err)
      throw err
    }
  },

  /**
   * Disconnect socket cleanly
   */
  disconnect: () => {
    try {
      socketClient.disconnectSocket()
    } catch (err) {
      console.error('[SocketManager] Disconnect failed:', err)
      throw err
    }
  },

  /**
   * Emit event to server
   * Optional ack callback for request-response pattern
   */
  emit: (eventName: string, data?: any, ack?: (response: any) => void) => {
    const socket = socketClient.getSocket()

    if (!socket.connected) {
      console.warn(`[SocketManager] Socket not connected, cannot emit ${eventName}`)
      return
    }

    if (ack) {
      socket.emit(eventName, data, ack)
    } else {
      socket.emit(eventName, data)
    }
  },

  /**
   * Listen for event from server
   */
  on: (eventName: string, handler: SocketEventHandler) => {
    const socket = socketClient.getSocket()
    socket.on(eventName, handler)
  },

  /**
   * Stop listening for event
   */
  off: (eventName: string, handler: SocketEventHandler) => {
    const socket = socketClient.getSocket()
    socket.off(eventName, handler)
  },

  /**
   * Send re-authentication with new token
   * Called after silent token refresh
   * Backend validates token and updates socket.data.tokenExpiry
   */
  sendReauth: (accessToken: string) => {
    socketManager.emit('socket:reauth', { token: accessToken }, (response: any) => {
      if (response?.error) {
        console.error('[SocketManager] Reauth failed:', response.error)
      } else {
        console.log('[SocketManager] Reauth successful')
      }
    })
  },

  /**
   * Check if socket currently connected
   */
  isConnected: () => {
    return socketClient.isConnected()
  },
}
