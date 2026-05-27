// client/src/components/ActivationChecklist.tsx
import React, { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'

export const ActivationChecklist: React.FC = () => {
  const user = useStore((state) => state.user)
  const setUser = (newUser: any) => useStore.setState({ user: newUser })
  const activeRoomId = useStore((state) => state.activeRoomId)
  const messages = useStore((state) => state.messages)

  const [checklist, setChecklist] = useState({
    joinedRoom: false,
    interactedWithAi: false,
    completedPomodoro: false,
    customizedProfile: false
  })
  const [claimed, setClaimed] = useState(false)

  // 1. Reactive Tracking Loop
  useEffect(() => {
    if (!user) return

    // Read stored checklist state or fallback
    const stored = localStorage.getItem(`activation_checklist_${user._id}`)
    let initial = stored ? JSON.parse(stored) : {
      joinedRoom: false,
      interactedWithAi: false,
      completedPomodoro: false,
      customizedProfile: false
    }

    // Reactive hooks to automatically cross items off
    if (activeRoomId) {
      initial.joinedRoom = true
    }
    // Check if user has exchanged any AI Tutor messages (indicated by AI responses or analytical triggers)
    if (user.badges?.includes('ai_tutor') || messages.some(m => m.user.userId === 'mock-ai-tutor' || m.user.userId === 'openai-bot')) {
      initial.interactedWithAi = true
    }
    // Check if total focus minutes is greater than 0
    if (user.stats?.totalFocusMinutes > 0) {
      initial.completedPomodoro = true
    }
    // Check if bio or custom avatar is set
    if ((user.bio && user.bio.length > 0) || (user.avatar && !user.avatar.includes('photo-1534528741775'))) {
      initial.customizedProfile = true
    }

    setChecklist(initial)
    localStorage.setItem(`activation_checklist_${user._id}`, JSON.stringify(initial))

    // Check if reward was already claimed
    const isClaimed = localStorage.getItem(`activation_claimed_${user._id}`) === 'true'
    setClaimed(isClaimed)
  }, [user, activeRoomId, messages])

  if (!user || claimed) return null

  const items = [
    { key: 'joinedRoom', label: '🏫 Enter a synchronized focus study room', checked: checklist.joinedRoom },
    { key: 'interactedWithAi', label: '🤖 Prompt the Academic AI Tutor in sidebar', checked: checklist.interactedWithAi },
    { key: 'completedPomodoro', label: '⏱️ Complete your first focus timer segment', checked: checklist.completedPomodoro },
    { key: 'customizedProfile', label: '👤 Update your bio or avatar profile details', checked: checklist.customizedProfile }
  ]

  const completedCount = items.filter((i) => i.checked).length
  const allCompleted = completedCount === items.length
  const progressPercent = Math.floor((completedCount / items.length) * 100)

  const handleClaimReward = async () => {
    if (!allCompleted) return

    // Trigger local completion
    setClaimed(true)
    localStorage.setItem(`activation_claimed_${user._id}`, 'true')

    // 1. Award +50 XP locally in Zustand store
    const updatedUser = {
      ...user,
      xp: user.xp + 50,
      level: user.xp + 50 >= 400 ? Math.max(user.level, 4) : user.level
    }
    setUser(updatedUser)

    // 2. Track funnel completion events
    import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
      postHogAnalytics.track('activation_funnel_success', {
        username: user.username,
        xpAwarded: 50,
        unlockedAt: new Date().toISOString()
      })
    })

    // 3. Dispatch global achievement toast alert
    window.dispatchEvent(
      new CustomEvent('achievement:unlocked', {
        detail: {
          title: 'Onboarding Graduate 🎓',
          desc: 'Completed all first-day onboarding activation missions!',
          xpAwarded: 50
        }
      })
    )
  }

  return (
    <div
      className="activation-checklist-card glass-panel mb-4 anim-fade-in"
      style={{
        padding: '1.75rem',
        borderRadius: '16px',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        boxShadow: '0 8px 30px rgba(99, 102, 241, 0.1)',
        backgroundColor: 'rgba(99, 102, 241, 0.02)'
      }}
    >
      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 className="gradient-text font-bold" style={{ fontSize: '1.1rem', margin: 0 }}>
            🚀 First-Day Scholar Missions
          </h3>
          <p className="text-secondary font-medium" style={{ fontSize: '0.8rem', marginTop: '2px' }}>
            Complete these 4 introductory tasks to graduate and unlock +50 bonus XP!
          </p>
        </div>
        <div style={{ fontSize: '1.5rem', animation: 'animPulse 2s infinite' }}>🎓</div>
      </div>

      {/* Progress Bar */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
          <span className="font-bold text-primary">{progressPercent}% Completed</span>
          <span className="text-secondary">{completedCount}/4 Completed</span>
        </div>
        <div style={{ height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              background: 'linear-gradient(to right, var(--color-primary), #a855f7)',
              borderRadius: '3px',
              transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          />
        </div>
      </div>

      {/* Checklist Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {items.map((item) => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '0.6rem 0.8rem',
              borderRadius: '8px',
              backgroundColor: item.checked ? 'rgba(99, 102, 241, 0.05)' : 'rgba(255, 255, 255, 0.01)',
              border: item.checked ? '1px solid rgba(99, 102, 241, 0.15)' : '1px solid rgba(255, 255, 255, 0.03)',
              transition: 'all 0.3s ease'
            }}
          >
            <div
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '4px',
                border: item.checked ? 'none' : '2px solid rgba(255, 255, 255, 0.3)',
                backgroundColor: item.checked ? 'var(--color-primary)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                color: '#fff',
                fontWeight: 'bold',
                boxShadow: item.checked ? '0 0 10px rgba(99, 102, 241, 0.4)' : 'none'
              }}
            >
              {item.checked && '✓'}
            </div>
            <span
              style={{
                fontSize: '0.85rem',
                color: item.checked ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                textDecoration: item.checked ? 'line-through rgba(255, 255, 255, 0.3)' : 'none',
                fontWeight: item.checked ? '500' : '400'
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Graduation Claim Box */}
      {allCompleted ? (
        <button
          onClick={handleClaimReward}
          className="btn btn-primary btn-pulse w-full font-bold"
          style={{
            padding: '0.8rem 1.5rem',
            background: 'linear-gradient(135deg, var(--color-primary), #a855f7)',
            boxShadow: '0 0 30px rgba(168, 85, 247, 0.4)',
            border: 'none',
            fontSize: '0.9rem'
          }}
        >
          🎓 Claim Graduation +50 XP Reward! 🚀
        </button>
      ) : (
        <div
          className="text-secondary text-center font-medium"
          style={{
            fontSize: '0.75rem',
            border: '1px dashed rgba(255, 255, 255, 0.08)',
            padding: '0.75rem',
            borderRadius: '8px'
          }}
        >
          🔒 Completion reward locked. Finish all {4 - completedCount} outstanding tasks.
        </div>
      )}
    </div>
  )
}

export default ActivationChecklist
