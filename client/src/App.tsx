// client/src/App.tsx
import React, { useEffect, Suspense } from 'react'
import { useStore } from './store/useStore'
import { AppShell } from './components/AppShell'
import { LandingPage } from './components/LandingPage'
import { DemoSimulator } from './components/DemoSimulator'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OfflineBanner } from './components/OfflineBanner'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'
import { AchievementUnlocked } from './components/AchievementUnlocked'
import { AdminRevenueDashboard } from './components/AdminRevenueDashboard'
import { UsageMeterDashboard } from './components/UsageMeterDashboard'
import './styles.css'

// Lazy load heavy dashboard, timer room views, and billing drawers to optimize main bundle loads
const GamificationDashboard = React.lazy(() =>
  import('./components/GamificationDashboard').then((m) => ({ default: m.GamificationDashboard }))
)
const RoomView = React.lazy(() =>
  import('./components/RoomView').then((m) => ({ default: m.RoomView }))
)
const AiAssistant = React.lazy(() =>
  import('./components/AiAssistant').then((m) => ({ default: m.AiAssistant }))
)
const MonetizationUpgrade = React.lazy(() =>
  import('./components/MonetizationUpgrade').then((m) => ({ default: m.MonetizationUpgrade }))
)
const OnboardingTour = React.lazy(() =>
  import('./components/OnboardingTour').then((m) => ({ default: m.OnboardingTour }))
)

// Visual Shimmer Skeleton Loader for page transition splits
const PageSkeleton = () => (
  <div className="skeleton-loader-container anim-fade-in">
    <div className="skeleton-header-shimmer glass-panel"></div>
    <div className="skeleton-body-shimmer-grid">
      <div className="skeleton-card-shimmer glass-panel"></div>
      <div className="skeleton-card-shimmer glass-panel"></div>
    </div>
  </div>
)

function App() {
  // Optimize Zustand selectors by querying specific atomic states to prevent unnecessary component re-renders
  const isAuthenticated = useStore((state) => state.isAuthenticated)
  const authLoading = useStore((state) => state.authLoading)
  const checkAuth = useStore((state) => state.checkAuth)
  const activeTab = useStore((state) => state.activeTab)
  const themeMode = useStore((state) => state.themeMode)
  const isDemoMode = useStore((state) => state.isDemoMode)

  // Initialize Auth checks and persistent sessions on mount
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (authLoading) {
    return (
      <div className={`fullscreen-loading-container ${themeMode === 'dark' ? 'theme-dark' : 'theme-light'}`}>
        <div className="glass-panel text-center loading-box">
          <div className="spinner spinner-large"></div>
          <h2 className="gradient-text mt-4">Restoring Study Session...</h2>
          <p>Connecting securely to antigravity productivity servers</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LandingPage />
  }

  return (
    <>
      <ErrorBoundary>
        <AppShell>
          <div className="app-workspace-panel anim-fade-in" role="region" aria-live="polite" aria-label="Study Workspace Active Tab Panel">
            <Suspense fallback={<PageSkeleton />}>
              {activeTab === 'dashboard' && (
                <div className="dashboard-layout">
                  <div className="dashboard-main-content">
                    <UsageMeterDashboard />
                    <GamificationDashboard />
                  </div>
                  <div className="dashboard-ai-sidebar">
                    <AiAssistant />
                  </div>
                </div>
              )}

              {activeTab === 'rooms' && (
                <div className="rooms-layout">
                  <div className="rooms-main-content">
                    <RoomView />
                  </div>
                  <div className="rooms-ai-sidebar">
                    <AiAssistant />
                  </div>
                </div>
              )}

              {activeTab === 'leaderboards' && (
                <div className="leaderboards-layout-tab glass-panel">
                  <GamificationDashboard />
                </div>
              )}

              {activeTab === ('admin' as any) && (
                <div className="admin-layout-tab glass-panel">
                  <AdminRevenueDashboard />
                </div>
              )}
            </Suspense>
          </div>

          {/* Global Monetization Upgrade Overlay Modal drawer */}
          <Suspense fallback={null}>
            <MonetizationUpgrade />
          </Suspense>

          {/* Guided User Walkthrough Tour */}
          <Suspense fallback={null}>
            <OnboardingTour />
          </Suspense>
        </AppShell>
      </ErrorBoundary>

      {/* Global Onboarding & Engagement Listeners */}
      <KeyboardShortcuts />
      <AchievementUnlocked />

      {/* Global Connection Health alerts */}
      <OfflineBanner />

      {/* Global Background Simulation Daemon for Interactive Demo Mode */}
      {isDemoMode && <DemoSimulator />}
    </>
  )
}

export default App


