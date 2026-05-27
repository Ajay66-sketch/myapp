// client/src/components/UsageMeterDashboard.tsx
import React from 'react'
import { useStore } from '../store/useStore'

export const UsageMeterDashboard: React.FC = () => {
  const user = useStore((state) => state.user)
  const setUpgradeModal = useStore((state) => state.setUpgradeModal)

  if (!user) return null

  const isPro = user.tier === 'pro' || user.tier === 'admin'

  // Set limits and calculations
  const quotas = [
    {
      name: '🏫 Study Corridor Sessions',
      used: user.stats?.totalFocusMinutes ? Math.min(10, Math.floor(user.stats.totalFocusMinutes / 25)) : 2,
      limit: isPro ? 'Unlimited' : 10,
      icon: '🏫',
      color: '#6366f1'
    },
    {
      name: '🤖 Academic AI Tutor Prompts',
      used: user.badges?.includes('ai_tutor') ? 5 : 2,
      limit: isPro ? 'Unlimited' : 5,
      icon: '🤖',
      color: '#a855f7'
    },
    {
      name: '❄️ Available Streak Freezes',
      used: user.streakFreezeCount || 0,
      limit: isPro ? 3 : 1,
      icon: '❄️',
      color: '#3b82f6'
    }
  ]

  return (
    <div
      className="usage-meter-card glass-panel mb-4 anim-fade-in"
      style={{
        padding: '1.75rem',
        borderRadius: '16px',
        backgroundColor: 'rgba(255, 255, 255, 0.01)',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h3 className="gradient-text font-bold" style={{ fontSize: '1.1rem', margin: 0 }}>
            ⏱️ Scholar Account Resource Metering
          </h3>
          <p className="text-secondary font-medium" style={{ fontSize: '0.8rem', marginTop: '2px' }}>
            Current billing cycle usage metrics and subscription limits
          </p>
        </div>
        <span
          className={`premium-label ${isPro ? 'pro-label' : 'free-label'}`}
          style={{ textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '1px' }}
        >
          {isPro ? '⚡ Pro Elite' : 'Standard'}
        </span>
      </div>

      {/* Resource Quota Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {quotas.map((q, index) => {
          const isUnlimited = q.limit === 'Unlimited'
          const pct = isUnlimited ? 100 : Math.min(100, Math.floor((Number(q.used) / Number(q.limit)) * 100))
          
          return (
            <div key={index}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.85)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{q.icon}</span> {q.name}
                </span>
                <span className="font-bold" style={{ color: pct >= 90 && !isUnlimited ? '#ef4444' : '#fff' }}>
                  {q.used} / {q.limit}
                </span>
              </div>
              
              <div style={{ height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    backgroundColor: pct >= 90 && !isUnlimited ? '#ef4444' : q.color,
                    boxShadow: `0 0 10px ${pct >= 90 && !isUnlimited ? '#ef4444' : q.color}`,
                    borderRadius: '3px',
                    transition: 'width 0.4s ease'
                  }}
                />
              </div>
              
              {!isPro && pct >= 90 && (
                <p className="font-medium" style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '4px', margin: 0 }}>
                  ⚠️ Quota almost exhausted! Upgrade now to prevent service disruption.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Upgrade CTA banner */}
      {!isPro && (
        <div
          className="glass-panel text-center mt-4"
          style={{
            padding: '1rem',
            backgroundColor: 'rgba(168, 85, 247, 0.04)',
            border: '1px dashed rgba(168, 85, 247, 0.25)',
            borderRadius: '8px'
          }}
        >
          <p className="text-secondary font-medium mb-3" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
            🔒 Pro members secure unlimited real-time timer rooms, high-volume academic AI prompt tokens, and monthly streak freeze refills.
          </p>
          <button
            onClick={() => setUpgradeModal(true)}
            className="btn btn-primary btn-sm btn-pulse"
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.8rem',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, var(--color-primary), #a855f7)'
            }}
          >
            🚀 Upgrade to Pro Scholar Elite
          </button>
        </div>
      )}
    </div>
  )
}

export default UsageMeterDashboard
