// client/src/components/OnboardingTour.tsx
// High-fidelity interactive guided user onboarding walkthrough component with element targeting & funnel analytics

import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

export function OnboardingTour() {
  const user = useStore((state) => state.user)
  const setUser = (newUser: any) => useStore.setState({ user: newUser })
  const [step, setStep] = useState(0)

  // 1. Log Tour Start on initial mount
  useEffect(() => {
    if (user && !user.onboardingCompleted && step === 0) {
      import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
        postHogAnalytics.track('onboarding_started', {
          username: user.username,
          startedAt: new Date().toISOString()
        })
      })
    }
  }, [user, step])

  if (!user || user.onboardingCompleted) return null

  const steps = [
    {
      title: '🏫 Focus Study Corridors',
      desc: 'Join synchronized focus rooms with peers worldwide. Share study goals, chat, and keep each other accountable in real-time!',
      icon: '🏫',
      position: 'Welcome to Antigravity Scholar! Let us take a quick 1-minute guided tour of your productivity workspace.',
      selector: '.app-workspace-panel'
    },
    {
      title: '⏱️ Circular SVG Pomodoro Timer',
      desc: 'Cognitive intervals divided into 25-minute sprints and 5-minute cognitive resets. Fully synchronized across active room peers!',
      icon: '⏱️',
      position: 'Look at the center of study rooms to interact with countdown blocks.',
      selector: '.timer-container'
    },
    {
      title: '⚡ Twin-Mode Academic AI Tutor',
      desc: 'Summarize study logs instantly, paste homework documents, or leverage coaching prompt cards to analyze topics.',
      icon: '🤖',
      position: 'Access the assistant companion via the right sidebar.',
      selector: '.dashboard-ai-sidebar'
    },
    {
      title: '🏆 XP Leveling & Streaks',
      desc: 'Earn XP for every study interval, secure daily streaks, unlock medals, and climb the global Scholar Leaderboard!',
      icon: '🔥',
      position: 'Track your XP level progress dynamically in the dashboard.',
      selector: '.xp-container'
    }
  ]

  // Track active step highlighting
  useEffect(() => {
    const activeStep = steps[step]
    if (!activeStep?.selector) return

    const targetElement = document.querySelector(activeStep.selector)
    if (targetElement) {
      // Highlight the targeted DOM element with an SRE glow border
      targetElement.classList.add('onboarding-highlighted-element')
      
      // Track step view event
      import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
        postHogAnalytics.track('onboarding_step_viewed', {
          username: user.username,
          stepIndex: step,
          stepTitle: activeStep.title
        })
      })

      return () => {
        targetElement.classList.remove('onboarding-highlighted-element')
      }
    }
  }, [step])

  const handleNext = async () => {
    if (step < steps.length - 1) {
      setStep((prev) => prev + 1)
    } else {
      // Complete Onboarding via Backend API
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/users/onboarding`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          },
          body: JSON.stringify({ username: user.username }),
        })

        if (response.ok) {
          const data = await response.json()
          setUser(data.user) // Update global Zustand state
          
          // Track onboarding completion in analytics pipeline
          import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
            postHogAnalytics.track('onboarding_completed', {
              username: user.username,
              level: user.level,
              completedAt: new Date().toISOString()
            })
          })
        } else {
          // Fallback update on connection hiccups
          setUser({ ...user, onboardingCompleted: true })
        }
      } catch (err) {
        setUser({ ...user, onboardingCompleted: true })
      }
    }
  }

  const activeStep = steps[step]

  return (
    <div
      className="onboarding-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(5, 5, 10, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        animation: 'animFadeIn 0.3s ease'
      }}
    >
      <div
        className="onboarding-modal glass-panel"
        style={{
          maxWidth: '440px',
          width: '100%',
          padding: '2rem',
          borderRadius: '16px',
          textAlign: 'center',
          boxShadow: '0 0 40px rgba(99, 102, 241, 0.25)',
          border: '2px solid var(--color-primary)',
          position: 'relative',
          animation: 'animSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Floating Icon */}
        <div
          style={{
            fontSize: '3rem',
            marginBottom: '0.75rem',
            animation: 'animPulse 2s infinite'
          }}
        >
          {activeStep.icon}
        </div>

        {/* Stepper Dots Indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '1.25rem' }}>
          {steps.map((_, index) => (
            <div
              key={index}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: index === step ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.2)',
                transition: 'background-color 0.3s ease'
              }}
            />
          ))}
        </div>

        {/* Text Details */}
        <h3 className="gradient-text font-bold mb-2" style={{ fontSize: '1.25rem' }}>{activeStep.title}</h3>
        <p className="text-secondary font-medium mb-3" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
          {activeStep.position}
        </p>
        
        <div
          className="glass-panel p-3 mb-4"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            fontSize: '0.85rem',
            lineHeight: '1.5',
            textAlign: 'left',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}
        >
          {activeStep.desc}
        </div>

        {/* Buttons Action Row */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          {step > 0 && (
            <button
              onClick={() => setStep((prev) => prev - 1)}
              className="btn btn-secondary btn-sm"
              style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem' }}
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="btn btn-primary btn-pulse btn-sm"
            style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem' }}
          >
            {step === steps.length - 1 ? 'Finish Tour & Start Focusing! 🚀' : 'Next Step'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default OnboardingTour
