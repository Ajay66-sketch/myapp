// client/src/components/RoomView.tsx
// High-fidelity synchronized focus room workspace with circular SVG timer, Audio chimes, and grouped chat

import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'

export function RoomView() {
  // Select state slices individually for optimized re-renders
  const user = useStore((state) => state.user)
  const rooms = useStore((state) => state.rooms)
  const activeRoomId = useStore((state) => state.activeRoomId)
  const activeRoom = useStore((state) => state.activeRoom)
  const messages = useStore((state) => state.messages)
  const typingUsers = useStore((state) => state.typingUsers)
  const readReceipts = useStore((state) => state.readReceipts)
  const fetchRooms = useStore((state) => state.fetchRooms)
  const joinRoom = useStore((state) => state.joinRoom)
  const leaveRoom = useStore((state) => state.leaveRoom)
  const sendMessage = useStore((state) => state.sendMessage)
  const emitTyping = useStore((state) => state.emitTyping)
  const startTimer = useStore((state) => state.startTimer)
  const stopTimer = useStore((state) => state.stopTimer)

  const [chatInput, setChatInput] = useState('')
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomDesc, setNewRoomDesc] = useState('')
  const [timerDuration, setTimerDuration] = useState(25)
  const [roomsLoading, setRoomsLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<any>(null)
  const prevTimerStatusRef = useRef<string>('idle')

  useEffect(() => {
    const loadRooms = async () => {
      setRoomsLoading(true)
      try {
        await fetchRooms()
      } finally {
        setRoomsLoading(false)
      }
    }
    loadRooms()
  }, [fetchRooms])

  // Trigger gentle Web Audio Chimes on status transition (e.g. focus to break)
  useEffect(() => {
    if (activeRoom?.timer?.status) {
      const currentStatus = activeRoom.timer.status
      if (currentStatus !== prevTimerStatusRef.current) {
        if (prevTimerStatusRef.current !== 'idle' && (currentStatus === 'break' || currentStatus === 'idle')) {
          playTimerAlertSound()
        }
        prevTimerStatusRef.current = currentStatus
      }
    }
  }, [activeRoom?.timer?.status])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingUsers])

  if (!user) return null

  // Synthesize beautiful Web Audio chime without requiring network audio file assets
  const playTimerAlertSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      
      const playTone = (freq: number, startDelay: number, duration: number) => {
        const osc = ctx.createOscillator()
        const gainNode = ctx.createGain()
        osc.connect(gainNode)
        gainNode.connect(ctx.destination)
        
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay)
        
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime + startDelay)
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration)
        
        osc.start(ctx.currentTime + startDelay)
        osc.stop(ctx.currentTime + startDelay + duration)
      }

      // Elegant double tone sweep (C5 -> G5)
      playTone(523.25, 0, 0.4)
      playTone(783.99, 0.15, 0.5)
    } catch (e) {
      console.warn('Web Audio playback prevented by browser auto-play policy')
    }
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoomName.trim()) return
    const { apiService } = await import('../api/apiService')
    try {
      const room = await apiService.rooms.create({
        name: newRoomName.trim(),
        description: newRoomDesc.trim(),
      })
      await fetchRooms()
      setNewRoomName('')
      setNewRoomDesc('')
      joinRoom(room._id)
    } catch (err) {
      console.error('Create room failed:', err)
    }
  }

  const handleSend = () => {
    if (!chatInput.trim()) return
    sendMessage(chatInput.trim())
    setChatInput('')
    emitTyping(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatInput(e.target.value)
    emitTyping(true)

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(false)
    }, 2000)
  }

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Calculate SVG circular parameters
  const timerLimitSecs = (activeRoom?.timer?.durationMinutes || timerDuration) * 60
  const remainingSecs = activeRoom?.timer?.timeRemaining ?? timerLimitSecs
  const circleRadius = 80
  const circleCircumference = 2 * Math.PI * circleRadius
  const dashOffset = circleCircumference - (remainingSecs / timerLimitSecs) * circleCircumference

  // Cluster consecutive chat message logs by user to make reading a breeze!
  const clusteredMessages: Array<{
    user: { userId: string; username: string }
    timestamp: number
    messages: string[]
    messageIds: string[]
  }> = []

  messages.forEach((msg) => {
    const lastGroup = clusteredMessages[clusteredMessages.length - 1]
    const withinLimit = lastGroup && (msg.timestamp - lastGroup.timestamp < 120000) // 2 minutes gap threshold
    const sameUser = lastGroup && lastGroup.user.userId === msg.user.userId

    if (sameUser && withinLimit) {
      lastGroup.messages.push(msg.message)
      lastGroup.messageIds.push(msg.id)
      lastGroup.timestamp = msg.timestamp // update timestamp
    } else {
      clusteredMessages.push({
        user: msg.user,
        timestamp: msg.timestamp,
        messages: [msg.message],
        messageIds: [msg.id],
      })
    }
  })

  return (
    <div className="room-container-grid anim-fade-in">
      {/* ─── Column 1: Rooms Switcher corridors ──────────────────────────────── */}
      <div className="rooms-sidebar glass-panel">
        <h3 className="sidebar-title gradient-text mb-3">🏫 Study Corridors</h3>
        <div className="rooms-list">
          {roomsLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="room-sidebar-item glass-panel skeleton-loader-container" style={{ padding: '0.75rem' }}>
                <div className="skeleton-header-shimmer" style={{ height: '32px' }}></div>
              </div>
            ))
          ) : rooms.length === 0 ? (
            <div className="dropdown-empty">No focus corridors created yet.</div>
          ) : (
            rooms.map((r) => (
              <div
                key={r._id}
                onClick={() => joinRoom(r._id)}
                className={`room-sidebar-item glass-panel ${activeRoomId === r._id ? 'active anim-pulse' : ''}`}
              >
                <div className="room-item-name">{r.name}</div>
                <div className="room-item-desc">{r.description || 'Focus sprint session.'}</div>
                <div className="room-item-count">👥 {r.participants?.length || 0} active scholars</div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleCreateRoom} className="create-room-form glass-panel mt-3">
          <h4>Launch Focus Corridor</h4>
          <input
            type="text"
            placeholder="Room Name (e.g. Calculus Sprint)"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Focus description..."
            value={newRoomDesc}
            onChange={(e) => setNewRoomDesc(e.target.value)}
          />
          <button type="submit" className="btn btn-primary btn-sm btn-block">
            + Open Room
          </button>
        </form>
      </div>

      {/* ─── Column 2: Synchronized Dash & Clustered Chat ────────────────────── */}
      <div className="active-room-pane">
        {activeRoom ? (
          <div className="active-room-layout anim-scale-up">
            <div className="active-room-header glass-panel">
              <div className="room-meta-left">
                <h2>🏫 {activeRoom.name}</h2>
                <p className="text-secondary">{activeRoom.description}</p>
              </div>
              <button onClick={leaveRoom} className="btn btn-secondary btn-sm">
                🚪 Exit Corridor
              </button>
            </div>

            <div className="room-dashboard-grid">
              {/* SVG Circular Timer Card */}
              <div className="timer-card glass-panel text-center">
                <h3>⏱️ Focus Countdown</h3>
                
                <div className="circular-timer-wrapper">
                  <svg width="200" height="200" className="timer-svg">
                    <defs>
                      <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="var(--accent-blue)" />
                        <stop offset="50%" stopColor="var(--accent-purple)" />
                        <stop offset="100%" stopColor="var(--accent-pink)" />
                      </linearGradient>
                    </defs>
                    <circle cx="100" cy="100" r={circleRadius} className="timer-svg-circle-bg" />
                    <circle
                      cx="100"
                      cy="100"
                      r={circleRadius}
                      className="timer-svg-circle-progress"
                      strokeDasharray={circleCircumference}
                      strokeDashoffset={dashOffset}
                    />
                  </svg>
                  
                  <div className="timer-inner-display">
                    <span className="timer-display gradient-text m-0" style={{ fontSize: '2.5rem' }}>
                      {formatTimer(activeRoom.timer?.timeRemaining ?? (timerDuration * 60))}
                    </span>
                    <span className="premium-label pro-label mt-1" style={{ fontSize: '0.65rem' }}>
                      {activeRoom.timer?.status?.toUpperCase() || 'IDLE'}
                    </span>
                  </div>
                </div>

                <div className="timer-controls">
                  {activeRoom.timer?.status === 'idle' ? (
                    <div className="timer-init-row">
                      <input
                        type="number"
                        min="1"
                        max="180"
                        value={timerDuration}
                        onChange={(e) => setTimerDuration(parseInt(e.target.value) || 25)}
                      />
                      <button
                        onClick={() => {
                          startTimer(timerDuration, 'pomodoro');
                          import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
                            postHogAnalytics.track('focus_timer_started', {
                              durationMinutes: timerDuration,
                              roomId: activeRoom?._id || activeRoom?.id || '',
                            });
                          });
                        }}
                        className="btn btn-primary btn-pulse"
                      >
                        Start Focus
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        stopTimer();
                        import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
                          postHogAnalytics.track('focus_timer_stopped', {
                            roomId: activeRoom?._id || activeRoom?.id || '',
                          });
                        });
                      }}
                      className="btn btn-secondary"
                    >
                      Stop & Pause Timer
                    </button>
                  )}
                </div>
              </div>

              {/* Online Scholars Presence */}
              <div className="presence-card glass-panel">
                <h3>👥 Active Study Peers</h3>
                <div className="scholars-list">
                  {activeRoom.participants?.length === 0 ? (
                    <p className="no-scholars text-secondary">Just you studying here alone. Invite some classmates!</p>
                  ) : (
                    activeRoom.participants?.map((p: any) => {
                      const name = p.username || p
                      const isSelf = name === user.username
                      return (
                        <div key={p._id || p} className="scholar-presence-row glass-panel">
                          <span className="presence-dot">🟢</span>
                          <strong className="text-primary">{name} {isSelf && '(You)'}</strong>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Clustered Chat Area */}
            <div className="room-chat-area glass-panel">
              <div className="chat-messages-area">
                {clusteredMessages.length === 0 ? (
                  <div className="chat-empty">No conversation logs yet. Share your study target!</div>
                ) : (
                  clusteredMessages.map((group, idx) => {
                    const isSelf = group.user.username === user.username
                    const formattedTime = new Date(group.timestamp).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })

                    return (
                      <div key={idx} className={`chat-message-group ${isSelf ? 'self-message' : ''}`}>
                        <div className="chat-message-bubble-row">
                          <img
                            src={isSelf ? (user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150') : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}
                            alt={group.user.username}
                            className="chat-message-avatar"
                          />
                          <div className="chat-message-bubble-content">
                            <div className="chat-message-bubble-header">
                              <span className="chat-message-bubble-name">{group.user.username}</span>
                              <span className="chat-message-bubble-time">{formattedTime}</span>
                            </div>
                            {group.messages.map((text, mIdx) => (
                              <div key={mIdx} className="chat-message-bubble-text mt-1">
                                {text}
                              </div>
                            ))}
                            {/* Read Receipts */}
                            {readReceipts[group.messageIds[group.messageIds.length - 1]] && 
                             readReceipts[group.messageIds[group.messageIds.length - 1]].length > 0 && (
                              <div className="receipts-avatars text-muted" style={{ fontSize: '0.65rem', marginTop: '0.15rem' }}>
                                ✓ Read by: {readReceipts[group.messageIds[group.messageIds.length - 1]].join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Typing indicators */}
              {Object.keys(typingUsers).length > 0 && (
                <div className="typing-notice">
                  💬 {Object.keys(typingUsers).join(', ')} is typing study notes...
                </div>
              )}

              <div className="chat-input-row">
                <input
                  type="text"
                  placeholder="Share a thought, academic goal, or code block..."
                  value={chatInput}
                  onChange={handleInputChange}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button onClick={handleSend} className="btn btn-primary" disabled={!chatInput.trim()}>
                  Send
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="no-room-selected glass-panel text-center anim-scale-up">
            <div className="no-room-icon">🏫</div>
            <h2>Enter a Study Corridor</h2>
            <p className="text-secondary font-medium">Select an accountability room from the left panel to join synchronized timers, participate in live messaging, and prompt the context-aware tutor.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default RoomView
