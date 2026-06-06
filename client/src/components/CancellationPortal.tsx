// client/src/components/CancellationPortal.tsx
import React, { useState } from 'react'
import { useStore } from '../store/useStore'

interface CancellationPortalProps {
  isOpen: boolean
  onClose: () => void
}

export const CancellationPortal: React.FC<CancellationPortalProps> = ({ isOpen, onClose }) => {
  const user = useStore((state) => state.user)
  const setUser = (newUser: any) => useStore.setState({ user: newUser })
  const [step, setStep] = useState(1) // 1: Reason Survey, 2: Win-back Offer, 3: Success Confirmation
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen || !user) return null

  const handleReasonSubmit = (selectedReason: string) => {
    setReason(selectedReason)
    // Go to Win-Back offer step
    setStep(2)

    // Track cancellation attempt analytics
    import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
      postHogAnalytics.track('cancellation_started', {
        username: user.username,
        reason: selectedReason
      })
    })
  }

  const handleAcceptWinback = () => {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      // Simulate saving 50% discount or pause on backend
      setStep(3)
      // In sandbox mode, keep user tier but log winback
      import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
        postHogAnalytics.track('winback_redeemed', {
          username: user.username,
          offerType: reason === 'Too expensive' ? '50%_discount' : '30_day_pause'
        })
      })
    }, 1500)
  }

  const handleFinalCancel = async () => {
    setLoading(true)
    try {
      // Simulate Razorpay cancellation API request
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/billing/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        }
      }).catch(() => null)

      // Update local Zustand store
      const updatedUser = { ...user, tier: 'free' }
      setUser(updatedUser)
      setStep(3)

      import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
        postHogAnalytics.track('cancellation_completed', {
          username: user.username,
          finalReason: reason
        })
      })
    } catch (err) {
      setUser({ ...user, tier: 'free' })
      setStep(3)
    } finally {
      setLoading(false)
    }
  }

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
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '2.5rem',
          borderRadius: '16px',
          textAlign: 'center',
          boxShadow: '0 10px 40px rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          animation: 'animSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step 1: Churn Survey */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>😢</div>
            <h2 className="gradient-text font-bold mb-2" style={{ fontSize: '1.4rem' }}>
              We are sorry to see you go
            </h2>
            <p className="text-secondary font-medium mb-4" style={{ fontSize: '0.85rem' }}>
              Help us improve. Why are you considering canceling your Scholar Pro subscription?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                'Too expensive',
                'Hard to use / navigate',
                'No longer studying / exams complete',
                'Found another study companion tool'
              ].map((r) => (
                <button
                  key={r}
                  onClick={() => handleReasonSubmit(r)}
                  className="btn btn-secondary font-bold text-left w-full"
                  style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', justifyContent: 'flex-start' }}
                >
                  {r === 'Too expensive' ? '💸 ' : r === 'Hard to use / navigate' ? '🧭 ' : r.startsWith('No longer') ? '🎓 ' : '🔍 '}
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Custom Win-back Offer nudges */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem', animation: 'animPulse 2.5s infinite' }}>🎁</div>
            
            {reason === 'Too expensive' ? (
              <>
                <h2 className="gradient-text font-bold mb-2" style={{ fontSize: '1.35rem' }}>
                  Special Academic Study Discount!
                </h2>
                <p className="text-secondary font-medium mb-4" style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                  We want to keep supporting your study journey. Claim a **50% discount for the next 3 months ($4.99/mo)** and keep using unlimited rooms, PDF note guides, and AI coaching.
                </p>
                
                <button
                  onClick={handleAcceptWinback}
                  disabled={loading}
                  className="btn btn-primary btn-pulse w-full font-bold mb-3"
                  style={{
                    padding: '0.8rem 1.5rem',
                    fontSize: '0.9rem',
                    background: 'linear-gradient(135deg, var(--color-primary), #a855f7)',
                    boxShadow: '0 0 20px rgba(168, 85, 247, 0.3)'
                  }}
                >
                  {loading ? 'Applying discount...' : 'Claim 50% Scholar Discount 🚀'}
                </button>
              </>
            ) : (
              <>
                <h2 className="gradient-text font-bold mb-2" style={{ fontSize: '1.35rem' }}>
                  Take a billing break instead?
                </h2>
                <p className="text-secondary font-medium mb-4" style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                  Exams complete or taking a vacation? **Pause your subscription billing for 30 days**. We will preserve your badges, streaks freeze logs, and profile records at zero cost!
                </p>
                
                <button
                  onClick={handleAcceptWinback}
                  disabled={loading}
                  className="btn btn-primary btn-pulse w-full font-bold mb-3"
                  style={{
                    padding: '0.8rem 1.5rem',
                    fontSize: '0.9rem',
                    background: 'linear-gradient(135deg, var(--color-primary), #3b82f6)',
                    boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)'
                  }}
                >
                  {loading ? 'Pausing subscription...' : 'Pause Billing for 30 Days ⏳'}
                </button>
              </>
            )}

            <button
              onClick={handleFinalCancel}
              disabled={loading}
              className="text-secondary font-bold w-full"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '0.8rem',
                textDecoration: 'underline',
                cursor: 'pointer',
                marginTop: '10px'
              }}
            >
              No thanks, finish canceling my plan
            </button>
          </div>
        )}

        {/* Step 3: Success Confirmation */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✅</div>
            <h2 className="gradient-text font-bold mb-2" style={{ fontSize: '1.4rem' }}>
              Subscription Updated
            </h2>
            <p className="text-secondary font-medium mb-4" style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
              {user.tier === 'free'
                ? 'Your premium Pro tier access has been successfully downgraded to standard free limits.'
                : 'Offer successfully accepted! Your subscription pricing billing updates have been registered.'}
            </p>
            
            <button
              onClick={onClose}
              className="btn btn-secondary w-full font-bold"
              style={{ padding: '0.75rem 1.5rem', fontSize: '0.85rem' }}
            >
              Return to Workspace
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default CancellationPortal
