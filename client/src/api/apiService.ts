// client/src/api/apiService.ts
import { VITE_API_URL } from '../realtime/env'

let tokenInMemory = localStorage.getItem('accessToken') || ''

export const setAccessToken = (token: string) => {
  tokenInMemory = token
  if (token) {
    localStorage.setItem('accessToken', token)
  } else {
    localStorage.removeItem('accessToken')
  }
}

export const getAccessToken = () => tokenInMemory

let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb)
}

const onRefreshed = (token: string) => {
  refreshSubscribers.map((cb) => cb(token))
  refreshSubscribers = []
}

function getCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || ''
  return ''
}

// Low-level fetch wrapper with automatic re-auth / refresh interceptor
async function request(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${VITE_API_URL}${path}`
  const headers = new Headers(options.headers || {})

  if (tokenInMemory) {
    headers.set('Authorization', `Bearer ${tokenInMemory}`)
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  // Double-Submit Cookie CSRF header handling
  const csrfToken = getCookie('csrfToken')
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken)
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers
  })

  if (response.status === 401 && !path.includes('/auth/refresh') && !path.includes('/auth/login')) {
    if (isRefreshing) {
      return new Promise((resolve) => {
        subscribeTokenRefresh((token) => {
          headers.set('Authorization', `Bearer ${token}`)
          resolve(fetch(url, {
            credentials: 'include',
            ...options,
            headers
          }).then((res) => res.json()))
        })
      })
    }

    isRefreshing = true

    try {
      const refreshUrl = `${VITE_API_URL}/auth/refresh`
      const refreshRes = await fetch(refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (refreshRes.ok) {
        const data = await refreshRes.json()
        const newToken = data.accessToken || ''
        setAccessToken(newToken)
        isRefreshing = false
        onRefreshed(newToken)

        // Retry the original request
        headers.set('Authorization', `Bearer ${newToken}`)
        const retryRes = await fetch(url, {
          credentials: 'include',
          ...options,
          headers
        })
        return await retryRes.json()
      } else {
        isRefreshing = false
        setAccessToken('')
        window.dispatchEvent(new Event('auth:unauthorized'))
        throw new Error('AUTH_EXPIRED')
      }
    } catch (err) {
      isRefreshing = false
      setAccessToken('')
      window.dispatchEvent(new Event('auth:unauthorized'))
      throw err
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.message || `API error: ${response.status}`)
  }

  return response.json()
}

export const apiService = {
  auth: {
    login: async (credentials: any) => {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      })
      if (data.accessToken) setAccessToken(data.accessToken)
      return data
    },
    register: async (details: any) => {
      const data = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(details),
      })
      if (data.accessToken) setAccessToken(data.accessToken)
      return data
    },
    me: async () => {
      return request('/auth/me')
    },
    logout: async () => {
      try {
        await request('/auth/logout', { method: 'POST' })
      } finally {
        setAccessToken('')
      }
    },
    refresh: async () => {
      const data = await request('/auth/refresh', { method: 'POST' })
      if (data.accessToken) setAccessToken(data.accessToken)
      return data
    },
  },

  rooms: {
    list: async () => {
      return request('/rooms')
    },
    getHistory: async (roomId: string) => {
      return request(`/messages/room/${roomId}`)
    },
    create: async (roomData: any) => {
      return request('/rooms', {
        method: 'POST',
        body: JSON.stringify(roomData),
      })
    },
    join: async (roomId: string) => {
      return request(`/rooms/${roomId}/join`, { method: 'POST' })
    },
    startTimer: async (roomId: string, details: any) => {
      return request(`/rooms/${roomId}/timer/start`, {
        method: 'POST',
        body: JSON.stringify(details),
      })
    },
    stopTimer: async (roomId: string) => {
      return request(`/rooms/${roomId}/timer/stop`, { method: 'POST' })
    },
  },

  ai: {
    chat: async (prompt: string) => {
      return request('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      })
    },
    summarize: async (roomId: string) => {
      return request('/ai/summarize', {
        method: 'POST',
        body: JSON.stringify({ roomId }),
      })
    },
    roomAssistant: async (roomId: string, prompt: string) => {
      return request('/ai/room-assistant', {
        method: 'POST',
        body: JSON.stringify({ roomId, prompt }),
      })
    },
  },

  gamification: {
    getProfile: async (userId: string) => {
      return request(`/gamification/profile/${userId}`)
    },
    getLeaderboards: async () => {
      return request('/gamification/leaderboards')
    },
    sendFriendRequest: async (friendId: string) => {
      return request('/gamification/friends/request', {
        method: 'POST',
        body: JSON.stringify({ friendId }),
      })
    },
    acceptFriendRequest: async (friendId: string) => {
      return request('/gamification/friends/accept', {
        method: 'POST',
        body: JSON.stringify({ friendId }),
      })
    },
    removeFriend: async (friendId: string) => {
      return request('/gamification/friends/remove', {
        method: 'POST',
        body: JSON.stringify({ friendId }),
      })
    },
    blockUser: async (friendId: string) => {
      return request('/gamification/friends/block', {
        method: 'POST',
        body: JSON.stringify({ friendId }),
      })
    },
  },

  billing: {
    getPortal: async () => {
      return request('/billing/portal')
    },
    upgrade: async (plan: string) => {
      return request('/billing/upgrade', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      })
    },
    cancel: async () => {
      return request('/billing/cancel', { method: 'POST' })
    },
  },
}
