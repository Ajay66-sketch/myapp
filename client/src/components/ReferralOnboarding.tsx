// client/src/components/ReferralOnboarding.tsx
import React, { useState } from 'react'
import { useStore } from '../store/useStore'

export const ReferralOnboarding: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose
}) => {
  const user = useStore((state) => state.user)
  const [copied, setCopied] = useState(false)

  if (!isOpen || !user) return null

  const referralCode = `SCHOLAR-REF-${user.username.toUpperCase().replace(/\s+/g, '-')}`
  const referralLink = `${window.location.origin}?ref=${referralCode.toLowerCase()}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)

      // Track referral link generation and sharing
      import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
        postHogAnalytics.track('referral_link_copied', {
          username: user.username,
          referralCode
        })
        postHogAnalytics.track('referral_shared', {
          username: user.username,
          referralCode
        })
      })
    } catch (err) {
      console.warn('Failed to copy refer link:', err)
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
          boxShadow: '0 10px 40px rgba(99, 102, 241, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          animation: 'animSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: '1.25rem',
            cursor: 'pointer'
          }}
        >
          ✕
        </button>

        {/* Dynamic Icon */}
        <div
          style={{
            fontSize: '3.5rem',
            marginBottom: '1rem',
            animation: 'animPulse 2.5s infinite'
          }}
        >
          🤝
        </div>

        {/* Title details */}
        <h2 className="gradient-text font-bold mb-2" style={{ fontSize: '1.4rem' }}>
          Multiply Focus XP Together!
        </h2>
        <p className="text-secondary font-medium mb-4" style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
          Invite your classmates and accountability partners. Both of you will instantly unlock a **+50 XP** focus surge upon their successful registration!
        </p>

        {/* Visual Referral Code Box */}
        <div
          className="glass-panel mb-4"
          style={{
            padding: '1rem',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed rgba(255, 255, 255, 0.15)',
            borderRadius: '8px'
          }}
        >
          <span
            style={{
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: 'rgba(255, 255, 255, 0.5)',
              display: 'block',
              marginBottom: '6px'
            }}
          >
            Your Unique Invite Code
          </span>
          <strong style={{ fontSize: '1.25rem', letterSpacing: '2px', color: 'var(--color-primary)' }}>
            {referralCode}
          </strong>
        </div>

        {/* Referral Link & Copy Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(5, 5, 10, 0.5)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
              padding: '0.5rem 0.75rem'
            }}
          >
            <input
              type="text"
              readOnly
              value={referralLink}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '0.75rem',
                flex: 1,
                fontFamily: 'monospace',
                outline: 'none'
              }}
            />
          </div>

          <button
            onClick={handleCopy}
            className={`btn ${copied ? 'btn-secondary' : 'btn-primary'} btn-pulse`}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.85rem',
              borderRadius: '8px',
              boxShadow: copied ? 'none' : '0 4px 15px rgba(99, 102, 241, 0.3)'
            }}
          >
            {copied ? 'Copied to Clipboard! 📋' : 'Copy Invite Link 🤝'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ReferralOnboarding
