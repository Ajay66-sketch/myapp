// client/src/components/AppShell.tsx
import { ReactNode } from 'react'
import { useStore } from '../store/useStore'
import { NotificationDropdown } from './NotificationDropdown'
import { PremiumBadge } from './MonetizationShared'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { user, logout, themeMode, setTheme, activeTab, setActiveTab, setUpgradeModal } = useStore()

  const toggleTheme = () => {
    setTheme(themeMode === 'dark' ? 'light' : 'dark')
  }

  if (!user) return <div className="fullscreen-layout">{children}</div>

  return (
    <div className={`app-shell-container ${themeMode === 'dark' ? 'theme-dark' : 'theme-light'}`}>
      {/* ─── Top Header Navbar ────────────────────────────────────────────────── */}
      <header className="navbar glass-panel">
        <div className="navbar-logo gradient-text">
          ✨ antigravity focus
        </div>

        <div className="navbar-controls">
          {user.tier === 'free' && (
            <button onClick={() => setUpgradeModal(true)} className="btn btn-primary btn-sm btn-pulse">
              ⚡ Upgrade to Pro
            </button>
          )}

          <div className="user-profile-widget">
            <PremiumBadge tier={user.tier} />
            <img
              src={user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
              alt="Avatar"
              className="navbar-avatar"
            />
            <span className="navbar-username">{user.username}</span>
          </div>

          <NotificationDropdown />

          <button onClick={toggleTheme} className="nav-icon-btn glass-panel" title="Toggle Theme">
            {themeMode === 'dark' ? '☀️' : '🌙'}
          </button>

          <button onClick={logout} className="btn btn-secondary btn-sm" title="Log Out">
            🚪 Out
          </button>
        </div>
      </header>

      {/* ─── Main Sidebar & Workspace pane ────────────────────────────────────── */}
      <div className="workspace-layout">
        <aside className="workspace-sidebar glass-panel">
          <button
            className={`sidebar-nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 User Dashboard
          </button>
          <button
            className={`sidebar-nav-btn ${activeTab === 'rooms' ? 'active' : ''}`}
            onClick={() => setActiveTab('rooms')}
          >
            🏫 Study Corridors
          </button>
          <button
            className={`sidebar-nav-btn ${activeTab === 'leaderboards' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaderboards')}
          >
            🏆 Leaderboard
          </button>
        </aside>

        <main className="workspace-content">
          {children}
        </main>
      </div>
    </div>
  )
}
export default AppShell
