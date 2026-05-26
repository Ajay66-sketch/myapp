// client/src/components/OnboardingTour.tsx
// High-fidelity interactive guided user onboarding walkthrough component

import { useState } from 'react'
import { useStore } from '../store/useStore'

export function OnboardingTour() {
  const user = useStore((state) => state.user)
  const setUser = (newUser: any) => useStore.setState({ user: newUser })
  const [step, setStep] = useState(0)

  if (!user || user.onboardingCompleted) return null

  const steps = [
    {
      title: '🏫 Focus Study Corridors',
      desc: 'Join synchronized focus rooms with peers worldwide. Share study goals, chat, and keep each other accountable in real-time!',
      icon: '🏫',
      position: 'Welcome to Antigravity Scholar! Let us take a quick 1-minute guided tour of your productivity workspace.'
    },
    {
      title: '⏱️ Circular SVG Pomodoro Timer',
      desc: 'Cognitive intervals divided into 25-minute sprints and 5-minute cognitive resets. Fully synchronized across active room peers!',
      icon: '⏱️',
      position: 'Look at the top center of study rooms to start countdown blocks.'
    },
    {
      title: '⚡ Twin-Mode Academic AI Tutor',
      desc: 'Summarize study logs instantly, paste homework documents, or leverage coaching prompt cards to analyze topics.',
      icon: '🤖',
      position: 'Access the assistant companion via the right sidebar.'
    },
    {
      title: '🏆 XP Leveling & Streaks',
      desc: 'Earn XP for every study interval, secure daily streaks, unlock medals, and climb the global Scholar Leaderboard!',
      icon: '🔥',
      position: 'Track your XP level progress dynamically in the dashboard.'
    }
  ]

  const handleNext = async () => {
    if (step < steps.length - 1) {
      setStep((prev) => prev + 1)
    } else {
      // Complete Onboarding via Backend API
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/users/onboarding`, {
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
    <div className="onboarding-overlay" style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      backgroundColor: 'rgba(5, 5, 10, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      animation: 'animFadeIn 0.3s ease'
    }}>
      <div className="onboarding-modal glass-panel" style={{
        maxWidth: '480px',
        width: '100%',
        padding: '2.5rem',
        borderRadius: '16px',
        textAlign: 'center',
        boxShadow: '0 0 40px rgba(99, 102, 241, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        position: 'relative'
      }}>
        {/* Floating Icon */}
        <div style={{
          fontSize: '3.5rem',
          marginBottom: '1rem',
          animation: 'animPulse 2s infinite'
        }}>
          {activeStep.icon}
        </div>

        {/* Stepper Dots Indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '1.5rem' }}>
          {steps.map((_, index) => (
            <div key={index} style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: index === step ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.2)',
              transition: 'background-color 0.3s ease'
            }} />
          ))}
        </div>

        {/* Text Details */}
        <h2 className="gradient-text mb-2">{activeStep.title}</h2>
        <p className="text-secondary font-medium mb-3" style={{ fontSize: '0.85rem' }}>
          {activeStep.position}
        </p>
        <div className="glass-panel p-3 mb-4" style={{
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          fontSize: '0.9rem',
          lineHeight: '1.4'
        }}>
          {activeStep.desc}
        </div>

        {/* Buttons Action Row */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          {step > 0 && (
            <button
              onClick={() => setStep((prev) => prev - 1)}
              className="btn btn-secondary btn-sm"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="btn btn-primary btn-pulse btn-sm"
          >
            {step === steps.length - 1 ? 'Finish Tour & Start Focusing! 🚀' : 'Next Step'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default OnboardingTour
