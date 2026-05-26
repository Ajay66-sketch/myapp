// client/src/store/useStore.ts
import { create } from 'zustand'
import { apiService, setAccessToken } from '../api/apiService'
import { socketManager } from '../realtime/socket/socketManager'

interface UserProfile {
  _id: string
  username: string
  email: string
  avatar: string
  bio: string
  xp: number
  level: number
  badges: string[]
  tier: 'free' | 'pro' | 'admin'
  streakFreezeCount: number
  stats: {
    currentStreak: number
    longestStreak: number
    totalFocusMinutes: number
  }
}

interface Room {
  _id: string
  name: string
  description: string
  maxParticipants: number
  isPrivate: boolean
  participants: string[]
  timer: {
    durationMinutes: number
    timeRemaining: number
    status: 'idle' | 'focus' | 'break' | 'paused'
    type: 'pomodoro' | 'custom'
  }
}

interface Message {
  id: string
  type: string
  room: string
  message: string
  user: {
    userId: string
    username: string
  }
  timestamp: number
}

interface Notification {
  _id: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
}

interface AppState {
  // Auth state
  user: UserProfile | null
  accessToken: string
  isAuthenticated: boolean
  authLoading: boolean
  authError: string | null
  isDemoMode: boolean

  // Rooms state
  rooms: Room[]
  activeRoomId: string | null
  activeRoom: Room | null
  messages: Message[]
  typingUsers: { [username: string]: boolean }
  readReceipts: { [messageId: string]: string[] } // messageId -> list of usernames who read it

  // Notifications
  notifications: Notification[]
  unreadNotificationsCount: number

  // Gamification
  leaderboards: {
    daily: any[]
    weekly: any[]
    allTime: any[]
    xp: any[]
  }

  // UI state
  themeMode: 'dark' | 'light'
  activeTab: 'dashboard' | 'rooms' | 'leaderboards' | 'notifications'
  isUpgradeModalOpen: boolean
  uiLoading: boolean

  // Actions
  login: (credentials: any) => Promise<void>
  register: (details: any) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  setTheme: (theme: 'dark' | 'light') => void
  setActiveTab: (tab: 'dashboard' | 'rooms' | 'leaderboards' | 'notifications') => void
  setUpgradeModal: (isOpen: boolean) => void
  enterDemoMode: () => void
  exitDemoMode: () => void

  // Room Actions
  fetchRooms: () => Promise<void>
  joinRoom: (roomId: string) => Promise<void>
  leaveRoom: () => void
  fetchHistory: (roomId: string) => Promise<void>
  sendMessage: (text: string) => Promise<void>
  emitTyping: (isTyping: boolean) => void
  startTimer: (durationMinutes: number, type: 'pomodoro' | 'custom') => Promise<void>
  stopTimer: () => Promise<void>

  // Gamification Actions
  fetchLeaderboards: () => Promise<void>
  fetchProfile: () => Promise<void>

  // Notifications Actions
  fetchNotifications: () => Promise<void>
  markNotificationsRead: () => Promise<void>

  // Socket setup
  setupSocketListeners: () => void
  cleanupSocketListeners: () => void
}

export const useStore = create<AppState>((set, get) => ({
  // Auth state
  user: null,
  accessToken: localStorage.getItem('accessToken') || '',
  isAuthenticated: !!localStorage.getItem('accessToken'),
  authLoading: false,
  authError: null,
  isDemoMode: false,

  // Rooms state
  rooms: [],
  activeRoomId: null,
  activeRoom: null,
  messages: [],
  typingUsers: {},
  readReceipts: {},

  // Notifications
  notifications: [],
  unreadNotificationsCount: 0,

  // Gamification
  leaderboards: {
    daily: [],
    weekly: [],
    allTime: [],
    xp: [],
  },

  // UI state
  themeMode: (localStorage.getItem('themeMode') as 'dark' | 'light') || 'dark',
  activeTab: 'dashboard',
  isUpgradeModalOpen: false,
  uiLoading: false,

  // Actions
  login: async (credentials) => {
    set({ authLoading: true, authError: null })
    try {
      const data = await apiService.auth.login(credentials)
      set({
        user: data.user,
        accessToken: data.accessToken,
        isAuthenticated: true,
        authLoading: false,
      })
      socketManager.connect(data.accessToken)
      get().setupSocketListeners()
      get().fetchNotifications()
      get().fetchLeaderboards()
    } catch (err: any) {
      set({ authError: err.message || 'Login failed', authLoading: false })
      throw err
    }
  },

  register: async (details) => {
    set({ authLoading: true, authError: null })
    try {
      const data = await apiService.auth.register(details)
      set({
        user: data.user,
        accessToken: data.accessToken,
        isAuthenticated: true,
        authLoading: false,
      })
      socketManager.connect(data.accessToken)
      get().setupSocketListeners()
      get().fetchNotifications()
      get().fetchLeaderboards()
    } catch (err: any) {
      set({ authError: err.message || 'Registration failed', authLoading: false })
      throw err
    }
  },

  logout: async () => {
    try {
      await apiService.auth.logout()
    } catch (e) {
      console.warn('API logout failed, clearing client state anyway')
    } finally {
      socketManager.disconnect()
      get().cleanupSocketListeners()
      set({
        user: null,
        accessToken: '',
        isAuthenticated: false,
        activeRoomId: null,
        activeRoom: null,
        messages: [],
        typingUsers: {},
      })
    }
  },

  checkAuth: async () => {
    const token = get().accessToken
    if (!token) return
    set({ authLoading: true })
    try {
      const data = await apiService.auth.me()
      set({
        user: data.user,
        isAuthenticated: true,
        authLoading: false,
      })
      socketManager.connect(token)
      get().setupSocketListeners()
      get().fetchNotifications()
      get().fetchLeaderboards()
    } catch (err) {
      // Auto refresh token
      try {
        const refreshData = await apiService.auth.refresh()
        set({
          user: refreshData.user,
          accessToken: refreshData.accessToken,
          isAuthenticated: true,
          authLoading: false,
        })
        socketManager.connect(refreshData.accessToken)
        get().setupSocketListeners()
        get().fetchNotifications()
        get().fetchLeaderboards()
      } catch (refreshErr) {
        set({
          user: null,
          accessToken: '',
          isAuthenticated: false,
          authLoading: false,
        })
      }
    }
  },

  setTheme: (themeMode) => {
    localStorage.setItem('themeMode', themeMode)
    set({ themeMode })
  },

  setActiveTab: (activeTab) => {
    set({ activeTab })
  },

  setUpgradeModal: (isUpgradeModalOpen) => {
    set({ isUpgradeModalOpen })
  },

  enterDemoMode: () => {
    set({
      isDemoMode: true,
      isAuthenticated: true,
      user: {
        _id: 'demo-user-1',
        username: 'FocusExplorer (Demo)',
        email: 'demo@antigravity.io',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        bio: 'Exploring the ultimate productivity SaaS platform sandbox!',
        xp: 350,
        level: 3,
        badges: ['🚀 First Focus', '🔥 3-Day Streak'],
        tier: 'free',
        streakFreezeCount: 1,
        stats: {
          currentStreak: 3,
          longestStreak: 5,
          totalFocusMinutes: 125
        }
      },
      leaderboards: {
        daily: [
          { _id: '1', username: 'Einstein', xp: 520, level: 5 },
          { _id: '2', username: 'Marie Curie', xp: 480, level: 4 },
          { _id: 'demo-user-1', username: 'FocusExplorer (Demo)', xp: 350, level: 3 },
          { _id: '3', username: 'Tesla', xp: 310, level: 3 },
          { _id: '4', username: 'Ada Lovelace', xp: 290, level: 2 }
        ],
        weekly: [
          { _id: '1', username: 'Einstein', xp: 2500, level: 5 },
          { _id: 'demo-user-1', username: 'FocusExplorer (Demo)', xp: 1800, level: 3 }
        ],
        allTime: [
          { _id: '1', username: 'Einstein', xp: 12500, level: 5 },
          { _id: 'demo-user-1', username: 'FocusExplorer (Demo)', xp: 8500, level: 3 }
        ],
        xp: [
          { _id: '1', username: 'Einstein', xp: 950, level: 5, tier: 'pro', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150' },
          { _id: '2', username: 'Marie Curie', xp: 840, level: 4, tier: 'pro', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' },
          { _id: 'demo-user-1', username: 'FocusExplorer (Demo)', xp: 350, level: 3, tier: 'free', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150' },
          { _id: '3', username: 'Tesla', xp: 310, level: 3, tier: 'free', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150' },
          { _id: '4', username: 'Ada Lovelace', xp: 290, level: 2, tier: 'free', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150' }
        ]
      },
      activeTab: 'dashboard'
    })
  },

  exitDemoMode: () => {
    set({
      isDemoMode: false,
      isAuthenticated: false,
      user: null,
      activeRoomId: null,
      activeRoom: null,
      messages: [],
      typingUsers: {},
      readReceipts: {}
    })
  },

  // Room Actions
  fetchRooms: async () => {
    if (get().isDemoMode) {
      const mockRooms: Room[] = [
        {
          _id: 'room-pomodoro-1',
          name: '🔥 MIT Physics Room',
          description: 'Pomodoro study room for quantum mechanics and thermodynamics.',
          maxParticipants: 10,
          isPrivate: false,
          participants: ['Jessica', 'Aman', 'Siddharth'],
          timer: {
            durationMinutes: 25,
            timeRemaining: 1500, // 25:00
            status: 'focus',
            type: 'pomodoro'
          }
        },
        {
          _id: 'room-pomodoro-2',
          name: '🧠 CS Theory Hub',
          description: 'Quiet room for algorithms, graph theory, and automata research.',
          maxParticipants: 5,
          isPrivate: false,
          participants: ['Ken', 'Grace'],
          timer: {
            durationMinutes: 50,
            timeRemaining: 2400, // 40:00
            status: 'focus',
            type: 'custom'
          }
        }
      ]
      set({ rooms: mockRooms })
      return
    }
    try {
      const rooms = await apiService.rooms.list()
      set({ rooms })
    } catch (e) {
      console.error('Failed to load rooms:', e)
    }
  },

  joinRoom: async (roomId) => {
    if (get().isDemoMode) {
      set({ activeRoomId: roomId })
      const room = get().rooms.find((r) => r._id === roomId) || null
      set({ activeRoom: room })
      await get().fetchHistory(roomId)
      return
    }
    try {
      await apiService.rooms.join(roomId)
      set({ activeRoomId: roomId })
      // Find room in the loaded list
      const room = get().rooms.find((r) => r._id === roomId) || null
      set({ activeRoom: room })
      await get().fetchHistory(roomId)

      // Emit join event via socket
      socketManager.emit('room:join', { roomId })
    } catch (e) {
      console.error('Failed to join room:', e)
    }
  },

  leaveRoom: () => {
    if (get().isDemoMode) {
      set({ activeRoomId: null, activeRoom: null, messages: [], typingUsers: {}, readReceipts: {} })
      return
    }
    const roomId = get().activeRoomId
    if (roomId) {
      socketManager.emit('room:leave', { roomId })
    }
    set({ activeRoomId: null, activeRoom: null, messages: [], typingUsers: {}, readReceipts: {} })
  },

  fetchHistory: async (roomId) => {
    if (get().isDemoMode) {
      const mockHistory: Message[] = [
        {
          id: 'hist-1',
          type: 'chat',
          room: roomId,
          message: 'Hello everyone! Ready for a deep focus session? 🎯',
          user: { userId: 'peer-jessica', username: 'Jessica' },
          timestamp: Date.now() - 60000
        },
        {
          id: 'hist-2',
          type: 'chat',
          room: roomId,
          message: 'Absolutely! Working on my research paper.',
          user: { userId: 'peer-aman', username: 'Aman' },
          timestamp: Date.now() - 40000
        }
      ]
      set({ messages: mockHistory })
      return
    }
    try {
      const data = await apiService.rooms.getHistory(roomId)
      set({ messages: data.messages || [] })
    } catch (e) {
      console.error('Failed to load room chat history:', e)
    }
  },

  sendMessage: async (text) => {
    if (get().isDemoMode) {
      const userMessage: Message = {
        id: 'msg-' + Date.now(),
        type: 'chat',
        room: get().activeRoomId || 'room-pomodoro-1',
        message: text,
        user: {
          userId: 'demo-user-1',
          username: get().user?.username || 'FocusExplorer'
        },
        timestamp: Date.now()
      }
      
      set((state) => ({
        messages: [...state.messages, userMessage]
      }))

      // Simulate AI Companion responding in chat after a short delay!
      setTimeout(() => {
        set((state) => ({
          typingUsers: { ...state.typingUsers, 'AI Study Companion': true }
        }))
      }, 600)

      setTimeout(() => {
        set((state) => {
          const newTyping = { ...state.typingUsers }
          delete newTyping['AI Study Companion']
          
          const aiMessage: Message = {
            id: 'msg-ai-' + Date.now(),
            type: 'chat',
            room: state.activeRoomId || 'room-pomodoro-1',
            message: `Awesome progress on your focus sprint, FocusExplorer! 🚀 Keep this momentum up. Try breaking your workload into smaller chunks of 15 minutes!`,
            user: {
              userId: 'mock-ai-tutor',
              username: 'AI Study Companion'
            },
            timestamp: Date.now()
          }

          const newNotification: Notification = {
            _id: 'notif-' + Date.now(),
            type: 'xp_gain',
            title: '🔥 AI Engagement XP!',
            message: 'You unlocked a quick dynamic study boost from your AI buddy! (+10 XP)',
            read: false,
            createdAt: new Date().toISOString()
          }

          const updatedUser = state.user ? {
            ...state.user,
            xp: state.user.xp + 10,
            level: state.user.xp + 10 >= 400 ? 4 : state.user.level
          } : null

          return {
            typingUsers: newTyping,
            messages: [...state.messages, aiMessage],
            notifications: [newNotification, ...state.notifications],
            unreadNotificationsCount: state.unreadNotificationsCount + 1,
            user: updatedUser
          }
        })
      }, 2000)
      return
    }
    const roomId = get().activeRoomId
    if (!roomId) return
    socketManager.emit('chat:message', { roomId, message: text }, (ack: any) => {
      if (ack && ack.success) {
        // Receipt read locally or wait for socket event
      }
    })
  },

  emitTyping: (isTyping) => {
    if (get().isDemoMode) return
    const roomId = get().activeRoomId
    if (!roomId) return
    socketManager.emit('chat:typing', { roomId, isTyping })
  },

  startTimer: async (durationMinutes, type) => {
    if (get().isDemoMode) {
      const active = get().activeRoom
      if (active) {
        set({
          activeRoom: {
            ...active,
            timer: {
              ...active.timer,
              durationMinutes,
              timeRemaining: durationMinutes * 60,
              status: 'focus',
              type
            }
          }
        })
      }
      return
    }
    const roomId = get().activeRoomId
    if (!roomId) return
    try {
      await apiService.rooms.startTimer(roomId, { durationMinutes, type })
    } catch (e) {
      console.error('Failed to start room timer:', e)
    }
  },

  stopTimer: async () => {
    if (get().isDemoMode) {
      const active = get().activeRoom
      if (active) {
        set({
          activeRoom: {
            ...active,
            timer: {
              ...active.timer,
              timeRemaining: 0,
              status: 'idle'
            }
          }
        })
      }
      return
    }
    const roomId = get().activeRoomId
    if (!roomId) return
    try {
      await apiService.rooms.stopTimer(roomId)
    } catch (e) {
      console.error('Failed to stop room timer:', e)
    }
  },

  // Gamification Actions
  fetchLeaderboards: async () => {
    if (get().isDemoMode) return
    try {
      const res = await apiService.gamification.getLeaderboards()
      if (res.status === 'success') {
        set({ leaderboards: res.data })
      }
    } catch (e) {
      console.error('Failed to fetch leaderboards:', e)
    }
  },

  fetchProfile: async () => {
    if (get().isDemoMode) return
    const user = get().user
    if (!user) return
    try {
      const data = await apiService.gamification.getProfile(user._id)
      set({ user: { ...user, ...data } })
    } catch (e) {
      console.error('Failed to fetch gamification profile:', e)
    }
  },

  // Notifications Actions
  fetchNotifications: async () => {
    if (get().isDemoMode) {
      const mockNotifs: Notification[] = [
        {
          _id: 'notif-demo-1',
          type: 'achievement',
          title: '🏆 Sandbox Explorer',
          message: 'You successfully launched the real-time interactive demo sandbox!',
          read: false,
          createdAt: new Date().toISOString()
        }
      ]
      set({
        notifications: mockNotifs,
        unreadNotificationsCount: mockNotifs.length
      })
      return
    }
    try {
      const res = await apiService.gamification.getProfile(get().user?._id || '')
      // Wait, let's query a dedicated endpoint or fallback
      // In this app, notifications are returned via standard routes
      const response = await fetch(`${(import.meta as any).env.VITE_API_URL}/notifications`, {
        headers: { Authorization: `Bearer ${get().accessToken}` },
      })
      if (response.ok) {
        const data = await response.json()
        set({
          notifications: data.notifications || [],
          unreadNotificationsCount: (data.notifications || []).filter((n: any) => !n.read).length,
        })
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e)
    }
  },

  markNotificationsRead: async () => {
    if (get().isDemoMode) {
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadNotificationsCount: 0
      }))
      return
    }
    try {
      await fetch(`${(import.meta as any).env.VITE_API_URL}/notifications/read`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${get().accessToken}`,
          'Content-Type': 'application/json',
        },
      })
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadNotificationsCount: 0,
      }))
    } catch (e) {
      console.warn('Failed to mark notifications read:', e)
    }
  },

  // Sockets listening binders
  setupSocketListeners: () => {
    const socket = socketManager

    // Typing Indicators
    socket.on('chat:typing', (data: { username: string; isTyping: boolean }) => {
      set((state) => {
        const typing = { ...state.typingUsers }
        if (data.isTyping) {
          typing[data.username] = true
        } else {
          delete typing[data.username]
        }
        return { typingUsers: typing }
      })
    })

    // Chat Messages
    socket.on('chat:message', (msg: Message) => {
      set((state) => ({
        messages: [...state.messages, msg],
      }))
      // Auto-send read receipt
      if (get().activeRoomId) {
        socketManager.emit('chat:read', { messageId: msg.id, roomId: get().activeRoomId })
      }
    })

    // Read Receipts
    socket.on('chat:receipt', (data: { messageId: string; username: string }) => {
      set((state) => {
        const receipts = { ...state.readReceipts }
        if (!receipts[data.messageId]) {
          receipts[data.messageId] = []
        }
        if (!receipts[data.messageId].includes(data.username)) {
          receipts[data.messageId].push(data.username)
        }
        return { readReceipts: receipts }
      })
    })

    // Realtime Notifications
    socket.on('notification:new', (notif: any) => {
      set((state) => ({
        notifications: [notif, ...state.notifications],
        unreadNotificationsCount: state.unreadNotificationsCount + 1,
      }))
    })

    // Realtime XP Gains
    socket.on('xp:gained', (data: { xpGained: number; totalXp: number; level: number }) => {
      set((state) => {
        if (!state.user) return {}
        return {
          user: {
            ...state.user,
            xp: data.totalXp,
            level: data.level,
          },
        }
      })
      get().fetchLeaderboards()
    })

    // Streak Milestones
    socket.on('streak:updated', (data: { currentStreak: number; longestStreak: number }) => {
      set((state) => {
        if (!state.user) return {}
        return {
          user: {
            ...state.user,
            stats: {
              ...state.user.stats,
              currentStreak: data.currentStreak,
              longestStreak: data.longestStreak,
            },
          },
        }
      })
    })

    // Room update (Active users, timer update)
    socket.on('room:update', (room: Room) => {
      const currentActiveId = get().activeRoomId
      if (room._id === currentActiveId) {
        set({ activeRoom: room })
      }
      set((state) => ({
        rooms: state.rooms.map((r) => (r._id === room._id ? room : r)),
      }))
    })

    // Timer Ticks
    socket.on('timer:tick', (data: { roomId: string; timeRemaining: number; status: string }) => {
      const active = get().activeRoom
      if (active && data.roomId === active._id) {
        set({
          activeRoom: {
            ...active,
            timer: {
              ...active.timer,
              timeRemaining: data.timeRemaining,
              status: data.status as any,
            },
          },
        })
      }
    })

    // User Focus Stats Update
    socket.on('user:stats_update', (data: { totalFocusMinutes: number }) => {
      set((state) => {
        if (!state.user) return {}
        return {
          user: {
            ...state.user,
            stats: {
              ...state.user.stats,
              totalFocusMinutes: data.totalFocusMinutes,
            },
          },
        }
      })
    })

    // Realtime AI Tutor Milestone Messages
    socket.on('ai:tutor_message', (data: { roomId: string; type: string; message: string; timestamp: number }) => {
      const activeId = get().activeRoomId
      if (activeId === data.roomId) {
        const virtualMsg = {
          id: `ai_tutor_${Date.now()}_${data.type}`,
          type: 'chat',
          room: data.roomId,
          message: data.message,
          user: {
            userId: 'ai_tutor_system',
            username: '🤖 AI Tutor',
          },
          timestamp: data.timestamp,
        }
        set((state) => ({
          messages: [...state.messages, virtualMsg],
        }))
      }
    })

    // Presence / Friend Status updates
    socket.on('friend:online', (data: { userId: string; username: string; isOnline: boolean }) => {
      // Can refresh profile or friends list
      get().fetchProfile()
    })
  },

  cleanupSocketListeners: () => {
    const socket = socketManager
    socket.off('chat:typing', () => {})
    socket.off('chat:message', () => {})
    socket.off('chat:receipt', () => {})
    socket.off('notification:new', () => {})
    socket.off('xp:gained', () => {})
    socket.off('streak:updated', () => {})
    socket.off('room:update', () => {})
    socket.off('timer:tick', () => {})
    socket.off('friend:online', () => {})
    socket.off('user:stats_update', () => {})
    socket.off('ai:tutor_message', () => {})
  },
}))

// Custom Window unauthorized event hook for global logout
if (typeof window !== 'undefined') {
  window.addEventListener('auth:unauthorized', () => {
    useStore.getState().logout()
  })
}
