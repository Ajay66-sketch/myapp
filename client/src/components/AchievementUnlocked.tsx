// client/src/components/AchievementUnlocked.tsx
import React, { useEffect, useState } from 'react'

interface AchievementDetails {
  title: string
  desc: string
  xpAwarded: number
}

export const AchievementUnlocked: React.FC = () => {
  const [active, setActive] = useState<AchievementDetails | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleUnlock = (e: Event) => {
      const customEvent = e as CustomEvent<AchievementDetails>
      if (customEvent.detail) {
        // Set details and trigger entry animation
        setActive(customEvent.detail)
        setVisible(true)

        // Try playing a premium unlock tone (gracefully muted on blocker boundaries)
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav')
          audio.volume = 0.25
          audio.play().catch(() => {}) // Gracefully handle browser auto-play blocker policy
        } catch (err) {}

        // Trigger slide-out after 5 seconds
        setTimeout(() => {
          setVisible(false)
        }, 5000)
      }
    }

    window.addEventListener('achievement:unlocked', handleUnlock)
    return () => window.removeEventListener('achievement:unlocked', handleUnlock)
  }, [])

  if (!active) return null

  return (
    <div
      className="glass-panel"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999999,
        maxWidth: '360px',
        width: 'calc(100% - 48px)',
        padding: '1.25rem',
        borderRadius: '16px',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        boxShadow: '0 10px 40px rgba(168, 85, 247, 0.25)',
        background: 'linear-gradient(135deg, rgba(15, 12, 30, 0.95), rgba(5, 5, 10, 0.95))',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        transform: visible ? 'translateX(0) scale(1)' : 'translateX(400px) scale(0.9)',
        opacity: visible ? 1 : 0,
        transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: visible ? 'auto' : 'none'
      }}
    >
      {/* Icon Badge Container */}
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'rgba(168, 85, 247, 0.15)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          flexShrink: 0,
          boxShadow: '0 0 15px rgba(168, 85, 247, 0.2)',
          animation: 'animPulse 2s infinite'
        }}
      >
        🏆
      </div>

      {/* Details Texts */}
      <div style={{ flex: 1 }}>
        <span
          style={{
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            fontWeight: 'bold',
            letterSpacing: '1px',
            color: '#a855f7'
          }}
        >
          🎉 Achievement Unlocked!
        </span>
        <h4 className="font-bold text-primary" style={{ fontSize: '0.95rem', margin: '2px 0 0 0' }}>
          {active.title}
        </h4>
        <p className="text-secondary font-medium" style={{ fontSize: '0.75rem', margin: '2px 0 0 0', lineHeight: '1.3' }}>
          {active.desc}
        </p>
      </div>

      {/* XP Tag */}
      <div
        style={{
          padding: '4px 8px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, var(--color-primary), #a855f7)',
          color: '#fff',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          flexShrink: 0,
          boxShadow: '0 0 10px rgba(168, 85, 247, 0.3)'
        }}
      >
        +{active.xpAwarded} XP
      </div>

      {/* Manual Dismiss Button */}
      <button
        onClick={() => setVisible(false)}
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.3)',
          fontSize: '0.85rem',
          cursor: 'pointer',
          alignSelf: 'flex-start',
          padding: 0
        }}
      >
        ✕
      </button>
    </div>
  )
}

export default AchievementUnlocked
