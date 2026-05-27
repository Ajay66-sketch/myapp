// client/src/components/KeyboardShortcuts.tsx
import React, { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'

export const KeyboardShortcuts: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  
  // Zustand State hooks to interact with timer, panels, and sidebars
  const activeRoom = useStore((state) => state.activeRoom)
  const activeRoomId = useStore((state) => state.activeRoomId)
  const startTimer = useStore((state) => state.startTimer)
  const stopTimer = useStore((state) => state.stopTimer)
  const setActiveTab = useStore((state) => state.setActiveTab)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid firing hotkeys when user is actively typing in inputs or textareas
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      // 1. Toggle Visual Help Modal via '?' or 'Alt + K'
      if (e.key === '?' || (e.altKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }

      // 2. Play / Pause Pomodoro countdown via 'Space'
      if (e.code === 'Space') {
        e.preventDefault()
        if (activeRoomId && activeRoom) {
          const timerStatus = activeRoom.timer?.status
          if (timerStatus === 'idle' || timerStatus === 'paused') {
            startTimer(activeRoom.timer?.durationMinutes || 25, activeRoom.timer?.type || 'pomodoro')
          } else {
            stopTimer()
          }
        }
      }

      // 3. Tab Navigations
      if (e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setActiveTab('dashboard')
      }
      if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        setActiveTab('rooms')
      }
      if (e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        setActiveTab('leaderboards')
      }

      // 4. Toggle AI assistant Companion Sidebar via 'Alt + A'
      if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        // Toggle activeTab or dispatch customized AI drawer events
        const currentTab = useStore.getState().activeTab
        if (currentTab === 'rooms') {
          setActiveTab('dashboard')
        } else {
          setActiveTab('rooms')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeRoomId, activeRoom, startTimer, stopTimer, setActiveTab])

  if (!isOpen) return null

  const shortcutItems = [
    { keys: ['Space'], action: 'Start or Pause Pomodoro countdown segments' },
    { keys: ['Alt', 'A'], action: 'Quick-toggle Twin AI Assistant panel' },
    { keys: ['Alt', 'D'], action: 'Switch workspace tab to Dashboard insights' },
    { keys: ['Alt', 'R'], action: 'Open Study Corridors & synchronized focus rooms' },
    { keys: ['Alt', 'L'], action: 'Open Global Scholar Leaderboards' },
    { keys: ['Alt', 'K'], action: 'Show/Hide Keyboard Shortcuts guide' },
    { keys: ['?'], action: 'Open Keyboard Shortcuts guide' }
  ]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        backgroundColor: 'rgba(5, 5, 10, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        animation: 'animFadeIn 0.25s ease'
      }}
      onClick={() => setIsOpen(false)}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '480px',
          width: '100%',
          padding: '2rem',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(99, 102, 241, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          animation: 'animSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="gradient-text font-bold" style={{ fontSize: '1.25rem' }}>
            ⚡ Scholar Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '1.25rem',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Cheat Sheet Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {shortcutItems.map((item, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: '0.75rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
              }}
            >
              <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
                {item.action}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {item.keys.map((key) => (
                  <kbd
                    key={key}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      boxShadow: '0 2px 0 rgba(0, 0, 0, 0.3)',
                      color: '#fff'
                    }}
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Disclaimer */}
        <div className="text-secondary text-center font-medium mt-4" style={{ fontSize: '0.75rem' }}>
          💡 Shortcuts are disabled while typing in chats or user search fields.
        </div>
      </div>
    </div>
  )
}

export default KeyboardShortcuts
