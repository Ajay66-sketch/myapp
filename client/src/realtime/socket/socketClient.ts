import { io, Socket, SocketOptions } from 'socket.io-client'
import { VITE_SOCKET_URL } from '../env'

export type ChatMessage = {
  id: string
  type: 'chat_message'
  room: 'global'
  message: string
  user: {
    userId: string
    username: string
  }
  timestamp: number
}

export const CHAT_MESSAGE_SCHEMA = {
  id: 'string',
  type: 'chat_message',
  room: 'global',
  message: 'string',
  user: {
    userId: 'string',
    username: 'string',
  },
  timestamp: 'number',
} as const

const isChatMessage = (value: unknown): value is ChatMessage => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    candidate.type === 'chat_message' &&
    candidate.room === 'global' &&
    typeof candidate.message === 'string' &&
    typeof candidate.timestamp === 'number' &&
    typeof candidate.user === 'object' &&
    candidate.user !== null &&
    typeof (candidate.user as Record<string, unknown>).userId === 'string' &&
    typeof (candidate.user as Record<string, unknown>).username === 'string'
  )
}

let socketInstance: Socket | null = null

function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(VITE_SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
      timeout: 20000,
    } as SocketOptions)
  }

  return socketInstance
}

function connectSocket(accessToken: string): void {
  const socket = getSocket()

  if (socket.connected) {
    console.warn('[SocketClient] Socket already connected')
    return
  }

  socket.auth = {
    token: accessToken,
  }
  socket.connect()
}

function disconnectSocket(): void {
  const socket = getSocket()
  if (socket.connected) {
    socket.disconnect()
  }
}

function isConnected(): boolean {
  return socketInstance?.connected ?? false
}

function onChatMessage(handler: (message: ChatMessage) => void): () => void {
  const socket = getSocket()
  const wrapper = (payload: unknown) => {
    if (isChatMessage(payload)) {
      handler(payload)
    } else {
      console.warn('[SocketClient] Ignoring malformed chat message payload', payload)
    }
  }

  socket.on('chat:message', wrapper as (...args: any[]) => void)
  return () => socket.off('chat:message', wrapper as (...args: any[]) => void)
}

function sendChatMessage(message: string, ack?: (response: any) => void): void {
  const socket = getSocket()
  if (!socket.connected) {
    console.warn('[SocketClient] Cannot send message: socket not connected')
    return
  }
  socket.emit('chat:message', { message }, ack)
}

export const socketClient = {
  getSocket,
  connectSocket,
  disconnectSocket,
  isConnected,
  onChatMessage,
  sendChatMessage,
}
