/**
 * socketClient.ts
 * Singleton socket instance management
 * Ensures only ONE socket.io connection at a time
 */

import { io, Socket, SocketOptions } from 'socket.io-client'

let socketInstance: Socket | null = null

/**
 * Get or create singleton socket instance
 * Does NOT connect automatically (autoConnect: false)
 * Use connectSocket() to establish connection with token
 */
function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(
      import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000',
      {
        // Prevent auto-connect - we'll connect manually with token
        autoConnect: false,

        // Connection settings
        reconnection: false, // Disable socket.io auto-reconnect (we'll handle it)
        transports: ['websocket', 'polling'],

        // Auth will be added when connecting
      } as SocketOptions
    )
  }

  return socketInstance
}

/**
 * Connect socket with JWT token
 * Called from AuthProvider after successful login
 *
 * @param accessToken JWT token from authStore
 */
function connectSocket(accessToken: string): void {
  const socket = getSocket()

  // Already connected or connecting
  if (socket.connected || socket.disconnected === false) {
    console.warn('[SocketClient] Socket already connected or connecting')
    return
  }

  // Set auth token in handshake
  socket.auth = {
    token: accessToken,
  }

  // Connect
  socket.connect()
}

/**
 * Disconnect socket cleanly
 * Called from logout or during cleanup
 */
function disconnectSocket(): void {
  const socket = getSocket()

  if (socket.connected) {
    socket.disconnect()
  }
}

/**
 * Get current connection state
 */
function isConnected(): boolean {
  const socket = getSocket()
  return socket.connected
}

/**
 * Force new instance (useful for testing)
 * Never call in production
 */
function resetSocket(): void {
  if (socketInstance) {
    if (socketInstance.connected) {
      socketInstance.disconnect()
    }
    socketInstance = null
  }
}

export const socketClient = {
  getSocket,
  connectSocket,
  disconnectSocket,
  isConnected,
  resetSocket,
}
