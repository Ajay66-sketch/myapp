// client/src/components/EmptyState.tsx
import React from 'react'

interface EmptyStateProps {
  icon: string
  title: string
  description: string
  actionText?: string
  onAction?: () => void
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  onAction
}) => {
  return (
    <div
      className="empty-state-card glass-panel text-center anim-fade-in"
      style={{
        padding: '3rem 2rem',
        borderRadius: '16px',
        border: '1px dashed rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(255, 255, 255, 0.01)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '1.5rem 0',
        transition: 'all 0.3s ease'
      }}
    >
      {/* Dynamic Animated Icon Bubble */}
      <div
        className="empty-state-icon mb-3"
        style={{
          fontSize: '3.5rem',
          width: '80px',
          height: '80px',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 20px rgba(99, 102, 241, 0.1)',
          animation: 'animPulse 2.5s infinite ease-in-out'
        }}
      >
        {icon}
      </div>

      {/* Title & Desc Details */}
      <h3 className="gradient-text mb-2 font-bold" style={{ fontSize: '1.25rem' }}>
        {title}
      </h3>
      <p
        className="text-secondary font-medium mb-4"
        style={{
          fontSize: '0.875rem',
          maxWidth: '360px',
          lineHeight: '1.5',
          textAlign: 'center'
        }}
      >
        {description}
      </p>

      {/* Dynamic Call to Action Trigger */}
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="btn btn-primary btn-sm btn-pulse"
          style={{
            padding: '0.6rem 1.25rem',
            fontSize: '0.85rem',
            borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
          }}
        >
          {actionText}
        </button>
      )}
    </div>
  )
}

export default EmptyState
