import { socketClient } from './socketClient'

type SocketEventHandler = (...args: any[]) => void

export const socketManager = {
  connect: (accessToken: string) => {
    socketClient.connectSocket(accessToken)
  },

  disconnect: () => {
    socketClient.disconnectSocket()
  },

  emit: (eventName: string, data?: any, ack?: (response: any) => void) => {
    const socket = socketClient.getSocket()
    if (!socket.connected) {
      console.warn(`[SocketManager] Cannot emit ${eventName}: socket not connected`)
      return
    }
    if (ack) {
      socket.emit(eventName, data, ack)
    } else {
      socket.emit(eventName, data)
    }
  },

  on: (eventName: string, handler: SocketEventHandler) => {
    socketClient.getSocket().on(eventName, handler)
  },

  off: (eventName: string, handler: SocketEventHandler) => {
    socketClient.getSocket().off(eventName, handler)
  },

  sendReauth: (accessToken: string) => {
    socketClient.getSocket().emit('socket:reauth', { token: accessToken })
  },

  isConnected: () => socketClient.isConnected(),
}
