// client/src/components/NotificationDropdown.tsx
import { useState } from 'react'
import { useStore } from '../store/useStore'

export function NotificationDropdown() {
  const { notifications, unreadNotificationsCount, markNotificationsRead } = useStore()
  const [isOpen, setIsOpen] = useState(false)

  const handleToggle = () => {
    setIsOpen(!isOpen)
    if (!isOpen && unreadNotificationsCount > 0) {
      markNotificationsRead()
    }
  }

  return (
    <div className="notification-dropdown-container">
      <button className="nav-icon-btn glass-panel" onClick={handleToggle}>
        🔔
        {unreadNotificationsCount > 0 && (
          <span className="notification-badge anim-pulse">{unreadNotificationsCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown-panel glass-panel anim-scale-up">
          <div className="dropdown-header">
            <h4>Alert Notifications</h4>
            {unreadNotificationsCount > 0 && (
              <button onClick={markNotificationsRead} className="btn-clear-all">
                Mark Read
              </button>
            )}
          </div>

          <div className="dropdown-list">
            {notifications.length === 0 ? (
              <div className="dropdown-empty">All caught up! No new notifications. ✨</div>
            ) : (
              notifications.map((n) => {
                let icon = '🔔'
                if (n.type === 'achievement') icon = '🏆'
                if (n.type === 'billing') icon = '💳'
                if (n.type === 'social') icon = '🤝'

                return (
                  <div key={n._id} className={`dropdown-item glass-panel ${!n.read ? 'unread-item' : ''}`}>
                    <div className="item-icon">{icon}</div>
                    <div className="item-content">
                      <strong className="item-title">{n.title}</strong>
                      <p className="item-msg">{n.message}</p>
                      <span className="item-time">
                        {new Date(n.createdAt || Date.now()).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
export default NotificationDropdown
