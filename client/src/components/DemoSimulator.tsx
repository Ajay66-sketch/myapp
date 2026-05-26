// client/src/components/DemoSimulator.tsx
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'

interface Toast {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning'
}

export function DemoSimulator() {
  const {
    isDemoMode,
    activeRoomId,
    activeRoom,
    messages,
    typingUsers,
    leaderboards,
    notifications,
    unreadNotificationsCount,
    user
  } = useStore()

  const [toasts, setToasts] = useState<Toast[]>([])

  // Helper to trigger floating toasts
  const addToast = (title: string, message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = 'toast-' + Math.random().toString(36).substr(2, 9)
    setToasts((prev) => [...prev, { id, title, message, type }])
    
    // Automatically clear toast after 4.5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  };

  useEffect(() => {
    if (!isDemoMode) return

    // 1. Initial greeting notification
    setTimeout(() => {
      addToast('🚀 Interactive Sandbox Active', 'You are now in live simulated demo mode! Explore the dashboard and corridors.', 'success')
    }, 1000)

    // Setup periodic simulation timers
    // Timer 1: Simulated other scholars typing & messaging inside the active study corridor
    const chatInterval = setInterval(() => {
      if (!activeRoomId || !activeRoom) return

      const scholars = ['Marie Curie', 'Jessica', 'Tesla', 'Ada Lovelace', 'Aman', 'Grace']
      const randomScholar = scholars[Math.floor(Math.random() * scholars.length)]
      
      const studyQuotes = [
        "Working on task subdivision strategies, Pomodoro really helps! ⏱️",
        "Focusing on my computer science research paper. 📝 Let's get to work!",
        "Just resolved that compiler error! Best feeling ever. 💻",
        "The context-aware AI summaries are extremely helpful! 🤖",
        "Daily streak points unlocked. Streaks flame index is heating up! 🔥",
        "Calculus formulas are finally making sense! Compiling nodes now.",
        "Remember to hydrate and take deep focus breaths during study sprints! 💧",
        "Anyone up for a deep coding session in 20 minutes?"
      ]
      const randomQuote = studyQuotes[Math.floor(Math.random() * studyQuotes.length)]

      // Trigger typing indicator
      useStore.setState((state) => ({
        typingUsers: { ...state.typingUsers, [randomScholar]: true }
      }))

      // Post message after 2.5 seconds
      setTimeout(() => {
        useStore.setState((state) => {
          const newTyping = { ...state.typingUsers }
          delete newTyping[randomScholar]

          const newMessage = {
            id: 'mock-msg-' + Date.now(),
            type: 'chat',
            room: activeRoomId,
            message: randomQuote,
            user: { userId: 'mock-' + randomScholar.toLowerCase(), username: randomScholar },
            timestamp: Date.now()
          }

          // Mock read receipts containing some user names
          const mockReceipts = { ...state.readReceipts }
          mockReceipts[newMessage.id] = ['FocusExplorer (Demo)', 'Jessica', 'Aman'].filter(n => n !== randomScholar)

          return {
            typingUsers: newTyping,
            messages: [...state.messages, newMessage],
            readReceipts: mockReceipts
          }
        })
      }, 2500)

    }, 24000) // Every 24 seconds someone speaks

    // Timer 2: Simulated scholars entering/leaving study corridors
    const presenceInterval = setInterval(() => {
      if (!activeRoomId || !activeRoom) return

      const scholarsPool = ['Ken', 'Marie Curie', 'Tesla', 'Ada Lovelace', 'Grace', 'Jessica', 'Aman', 'Siddharth']
      const randomScholar = scholarsPool[Math.floor(Math.random() * scholarsPool.length)]
      const isJoining = !activeRoom.participants?.includes(randomScholar)

      useStore.setState((state) => {
        if (!state.activeRoom) return {}

        let newParticipants = [...(state.activeRoom.participants || [])]
        if (isJoining) {
          newParticipants.push(randomScholar)
        } else {
          newParticipants = newParticipants.filter((p) => p !== randomScholar)
        }

        const updatedRoom = {
          ...state.activeRoom,
          participants: newParticipants
        }

        const updatedRooms = state.rooms.map((r) => r._id === state.activeRoomId ? updatedRoom : r)

        return {
          activeRoom: updatedRoom,
          rooms: updatedRooms
        }
      })

      // Add a visual toast alert
      if (isJoining) {
        addToast('👥 Scholar Entered Room', `${randomScholar} entered ${activeRoom.name} corridor to study!`, 'info')
      } else {
        addToast('🚪 Scholar Left Room', `${randomScholar} completed their focus sprint and exited.`, 'info')
      }

    }, 35000) // Every 35 seconds someone joins or leaves

    // Timer 3: Simulated Leaderboard Movement / Shuffling
    const leaderboardInterval = setInterval(() => {
      const scholarsPool = ['Einstein', 'Marie Curie', 'Tesla', 'Ada Lovelace']
      const randomScholar = scholarsPool[Math.floor(Math.random() * scholarsPool.length)]
      const xpBoost = Math.floor(Math.random() * 25) + 10

      useStore.setState((state) => {
        const updateLeaderboardArray = (list: any[]) => {
          return list.map((item) => {
            if (item.username === randomScholar) {
              const newXp = (item.xp || 0) + xpBoost
              const currentXpThreshold = 100 * Math.pow(item.level || 1, 1.5)
              const levelUp = newXp >= currentXpThreshold
              return {
                ...item,
                xp: newXp,
                level: levelUp ? (item.level || 1) + 1 : (item.level || 1)
              }
            }
            return item
          }).sort((a, b) => (b.xp || 0) - (a.xp || 0))
        }

        const updatedXp = updateLeaderboardArray(state.leaderboards.xp || [])
        const updatedDaily = updateLeaderboardArray(state.leaderboards.daily || [])

        return {
          leaderboards: {
            ...state.leaderboards,
            xp: updatedXp,
            daily: updatedDaily
          }
        }
      })

      addToast('🏆 Scholar Score Boost', `${randomScholar} earned +${xpBoost} XP for finishing a 25-minute Pomodoro!`, 'success')

    }, 45000) // Every 45 seconds top scholars scores update

    // Timer 4: Dynamic random system notifications popping up
    const notificationInterval = setInterval(() => {
      const systemAlerts = [
        { title: '🔥 Hot Streak Milestone!', message: 'Einstein reached a consistent 15-day streak! 👑', type: 'info' },
        { title: '🥇 Weekly Rank Shuffled', message: 'Marie Curie climbed to Rank 2 of the scholars hall!', type: 'success' },
        { title: '❄️ Streak Cushion Triggered', message: 'A streak freeze cushion has been awarded to premium Pro Scholars.', type: 'warning' },
        { title: '🚀 CS Corridor Active', message: 'CS Theory corridor is hitting peak capacity. Join now!', type: 'info' }
      ]

      const alert = systemAlerts[Math.floor(Math.random() * systemAlerts.length)]

      useStore.setState((state) => {
        const newNotif = {
          _id: 'mock-notif-' + Date.now(),
          type: 'milestone',
          title: alert.title,
          message: alert.message,
          read: false,
          createdAt: new Date().toISOString()
        }

        return {
          notifications: [newNotif, ...state.notifications],
          unreadNotificationsCount: state.unreadNotificationsCount + 1
        }
      })

      addToast(alert.title, alert.message, alert.type)

    }, 55000) // Every 55 seconds a general notification pops up

    // Clean up timers on unmount
    return () => {
      clearInterval(chatInterval)
      clearInterval(presenceInterval)
      clearInterval(leaderboardInterval)
      clearInterval(notificationInterval)
    }

  }, [isDemoMode, activeRoomId, activeRoom])

  if (!isDemoMode || toasts.length === 0) return null

  return (
    <div className="demo-toasts-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-card glass-panel toast-${toast.type} anim-slide-in`}>
          <div className="toast-glow"></div>
          <div className="toast-header-row">
            <span className="toast-icon">
              {toast.type === 'success' ? '🏆' : toast.type === 'warning' ? '❄️' : '✨'}
            </span>
            <strong className="toast-title">{toast.title}</strong>
          </div>
          <p className="toast-message">{toast.message}</p>
        </div>
      ))}

      <style>{`
        .demo-toasts-container {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          z-index: 9999;
          max-width: 320px;
          pointer-events: none;
        }

        .toast-card {
          position: relative;
          padding: 1.25rem;
          border-radius: var(--radius-md);
          pointer-events: auto;
          overflow: hidden;
          background: var(--bg-glass);
          border: 1px solid var(--border-glass);
          box-shadow: 0 10px 30px var(--shadow-glass);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .toast-glow {
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          background: var(--gradient-neon);
        }

        .toast-success .toast-glow {
          background: var(--accent-green);
        }

        .toast-warning .toast-glow {
          background: var(--accent-amber);
        }

        .toast-info .toast-glow {
          background: var(--accent-blue);
        }

        .toast-header-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.35rem;
        }

        .toast-icon {
          font-size: 1.1rem;
        }

        .toast-title {
          font-family: 'Outfit', sans-serif;
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .toast-message {
          font-size: 0.8rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .anim-slide-in {
          animation: slideInToast 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes slideInToast {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  )
}
