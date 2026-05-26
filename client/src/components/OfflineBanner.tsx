// client/src/components/OfflineBanner.tsx
import { useEffect, useState } from 'react'

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showStatus, setShowStatus] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setReconnecting(true)
      setTimeout(() => {
        setIsOnline(true)
        setReconnecting(false)
        setShowStatus(true)
        // Auto fade out active online banner after 3 seconds
        setTimeout(() => setShowStatus(false), 3000)
      }, 1000)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setShowStatus(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!showStatus && isOnline) return null

  return (
    <div
      className={`offline-banner-alert ${
        !isOnline ? 'offline-banner-reconnecting' : ''
      } anim-fade-in`}
    >
      {!isOnline ? (
        <>
          <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '1.5px' }}></div>
          <span>
            {reconnecting
              ? 'Securing connection...'
              : 'Offline Mode: Retrying server synchronization...'}
          </span>
        </>
      ) : (
        <>
          <span>🟢 Connection Restored! Scholar workspace synced.</span>
        </>
      )}
    </div>
  )
}

export default OfflineBanner
