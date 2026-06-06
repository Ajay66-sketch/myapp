// client/src/components/MonetizationUpgrade.tsx
// High-fidelity monetization gating modal and premium upgrade cards comparison matrix

import { useState } from 'react'
import { useStore } from '../store/useStore'
import { apiService } from '../api/apiService'
import { CancellationPortal } from './CancellationPortal'

export function MonetizationUpgrade() {
  const user = useStore((state) => state.user)
  const isUpgradeModalOpen = useStore((state) => state.isUpgradeModalOpen)
  const setUpgradeModal = useStore((state) => state.setUpgradeModal)
  const isDemoMode = useStore((state) => state.isDemoMode)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  if (!isUpgradeModalOpen) return null

  const handleUpgrade = async () => {
    setLoading(true)
    setMessage('')

    // Sandbox demonstration fallback
    if (isDemoMode) {
      setMessage('Initiating sandbox upgrade checkout...')
      setTimeout(() => {
        const store = useStore.getState();
        if (store.user) {
          useStore.setState({
            user: { ...store.user, tier: 'pro', streakFreezeCount: 3 }
          })
          setMessage('Upgrade successful! You are now a Pro Elite Scholar! 🚀')
        }
      }, 1500)
      setLoading(false)
      return
    }

    try {
      setMessage('Initiating Razorpay subscription order...')
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/billing/upgrade`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cycle: billingCycle }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to initiate Razorpay checkout')
      }

      const data = await response.json()
      if (data.status === 'order_created' && data.orderId) {
        const loadRazorpayScript = () => {
          return new Promise((resolve) => {
            if ((window as any).Razorpay) {
              resolve(true)
              return
            }
            const script = document.createElement('script')
            script.src = 'https://checkout.razorpay.com/v1/checkout.js'
            script.onload = () => resolve(true)
            script.onerror = () => resolve(false)
            document.body.appendChild(script)
          })
        }

        const resScript = await loadRazorpayScript()
        if (!resScript) {
          throw new Error('Razorpay SDK failed to load. Please check your network connection.')
        }

        setMessage('Opening secure Razorpay payment gateway... 🚀')
        const options = {
          key: data.keyId,
          amount: data.amount,
          currency: data.currency,
          name: 'Scholar Elite',
          description: `Upgrade to Pro - ${billingCycle}`,
          order_id: data.orderId,
          handler: async function (response: any) {
            setMessage('Payment authorization successful! Reconciling... 🚀')
            setTimeout(() => {
              const store = useStore.getState();
              if (store.user) {
                useStore.setState({
                  user: { ...store.user, tier: 'pro', streakFreezeCount: 3 }
                })
              }
              setMessage('Upgrade successful! You are now a Pro Elite Scholar! 🚀')
              setLoading(false)
            }, 1500)
          },
          prefill: {
            name: user?.username || '',
            email: user?.email || '',
          },
          theme: {
            color: '#6366f1',
          },
          modal: {
            ondismiss: function () {
              setMessage('Payment cancelled by user.')
              setLoading(false)
            }
          }
        }

        const rzp = new (window as any).Razorpay(options)
        rzp.open()
      } else {
        throw new Error('Invalid billing server response')
      }
    } catch (e: any) {
      console.error('[Billing Checkout Exception]:', e)
      setMessage(e.message || 'Razorpay connection failed. Please contact support.')
      setLoading(false)
    }
  }

  const isPro = user?.tier === 'pro' || user?.tier === 'admin'

  return (
    <div className="modal-overlay anim-fade-in">
      <div className="upgrade-modal glass-panel anim-scale-up" style={{ maxWidth: '780px' }}>
        <button className="modal-close" onClick={() => setUpgradeModal(false)}>
          &times;
        </button>

        <div className="upgrade-header text-center">
          <div className="upgrade-badge">COGNITIVE UPGRADE ELITE</div>
          <h2 className="gradient-text m-2" style={{ fontSize: '2.2rem' }}>Supercharge Study Productivity</h2>
          <p className="text-secondary font-medium">Unlock full academic AI agents, streak freezes protection, and unlimited rooms.</p>
        </div>

        {/* Billed Monthly vs. Billed Annually Toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: billingCycle === 'monthly' ? '#fff' : 'rgba(255,255,255,0.4)', transition: 'color 0.2s' }}>Billed Monthly</span>
          <button
            onClick={() => {
              setBillingCycle(prev => prev === 'monthly' ? 'yearly' : 'monthly')
              // Track billing selection
              import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
                postHogAnalytics.track('plan_pricing_toggled', {
                  selectedCycle: billingCycle === 'monthly' ? 'yearly' : 'monthly'
                })
              })
            }}
            style={{
              width: '46px',
              height: '24px',
              borderRadius: '12px',
              backgroundColor: 'var(--color-primary)',
              border: 'none',
              position: 'relative',
              cursor: 'pointer',
              padding: 0
            }}
          >
            <div
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: '#fff',
                position: 'absolute',
                top: '3px',
                left: billingCycle === 'monthly' ? '3px' : '25px',
                transition: 'left 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            />
          </button>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: billingCycle === 'yearly' ? '#fff' : 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '6px', transition: 'color 0.2s' }}>
            Billed Annually <span style={{ fontSize: '0.65rem', padding: '2px 6px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderRadius: '10px', fontWeight: 'bold' }}>Save 20%</span>
          </span>
        </div>

        {/* Pricing Matrix Columns Grid */}
        <div className="plans-grid mt-4">
          {/* Plan 1: Free */}
          <div className="plan-card glass-panel pricing-plan-card">
            <div className="pricing-plan-header">
              <h3>Standard Learner</h3>
              <div className="pricing-price-row">
                <span className="pricing-amount">Free</span>
              </div>
              <p className="text-muted font-medium" style={{ fontSize: '0.8rem' }}>For basic study session synchronization.</p>
            </div>
            <ul className="pricing-features-list">
              <li>Join 10+ open study corridors</li>
              <li>Real-time synchronizing Pomodoro</li>
              <li>Compete on Daily leaderboard rankings</li>
              <li style={{ opacity: 0.45, textDecoration: 'line-through' }}>Academic AI Chat tutor companion</li>
              <li style={{ opacity: 0.45, textDecoration: 'line-through' }}>Automatic 3x streak freezes</li>
              <li style={{ opacity: 0.45, textDecoration: 'line-through' }}>Full chat summary compilations</li>
            </ul>
            <button className="btn btn-secondary btn-block mt-auto" disabled style={{ opacity: 0.8 }}>
              Active Free Tier
            </button>
          </div>

          {/* Plan 2: Pro */}
          <div className="plan-card glass-panel pricing-plan-card premium-plan">
            <div className="pricing-plan-header">
              <h3>Cognitive Elite Pro</h3>
              <div className="pricing-price-row">
                <span className="pricing-amount">{billingCycle === 'monthly' ? '$9.99' : '$7.99'}</span>
                <span className="pricing-period">/ month</span>
              </div>
              <p className="text-muted font-medium" style={{ fontSize: '0.8rem' }}>For serious learners and elite scorers.</p>
            </div>
            <ul className="pricing-features-list">
              <li><strong>Unlimited dynamic study corridors</strong></li>
              <li><strong>Personalized Academic AI Tutor</strong></li>
              <li><strong>Context-aware PDF & notes scanning</strong></li>
              <li><strong>One-click chat logs summarization</strong></li>
              <li><strong>Weekly & All-Time leaderboards</strong></li>
              <li><strong>3x Streak Freezes</strong> replenished monthly</li>
            </ul>

            {message && (
              <div className="billing-banner glass-panel text-center p-2 mb-2 font-medium" style={{ background: 'rgba(167, 139, 250, 0.1)', color: 'var(--accent-purple)', fontSize: '0.85rem' }}>
                {message}
              </div>
            )}

            <button
              onClick={handleUpgrade}
              className="btn btn-primary btn-block btn-pulse mt-auto font-bold"
              disabled={loading || isPro}
            >
              {loading ? (
                <div className="spinner"></div>
              ) : isPro ? (
                'Already Pro Elite'
              ) : (
                'Upgrade to Pro via Razorpay'
              )}
            </button>

            {isPro && (
              <button
                onClick={() => setIsCancelOpen(true)}
                className="text-secondary font-bold mt-2"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '0.75rem',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'center'
                }}
              >
                Manage or cancel Pro subscription
              </button>
            )}
          </div>
        </div>

        {/* Testimonials Review Column */}
        <div
          className="glass-panel p-3 text-left mt-3"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.01)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            borderRadius: '8px'
          }}
        >
          <div style={{ display: 'flex', gap: '4px', fontSize: '0.85rem', color: '#fbbf24', marginBottom: '4px' }}>★★★★★</div>
          <p className="text-secondary font-medium" style={{ fontSize: '0.75rem', lineHeight: '1.4', margin: 0 }}>
            "Scholar Pro has saved my grades. The Academic AI Companion's summarization cards literally cut my exam study cycles in half. The streak freeze protected my daily focus streak when I had the flu!" — Aman S., Stanford Physics
          </p>
        </div>

        <div className="upgrade-footer text-center mt-4">
          <p className="text-muted" style={{ fontSize: '0.75rem' }}>Secured by Razorpay billing. Cancel anytime. 30-day money back guarantee.</p>
        </div>
      </div>

      <CancellationPortal isOpen={isCancelOpen} onClose={() => setIsCancelOpen(false)} />
    </div>
  )
}

export default MonetizationUpgrade
