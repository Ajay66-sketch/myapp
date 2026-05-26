// client/src/components/MonetizationShared.tsx
import { useStore } from '../store/useStore'

export function PremiumBadge({ tier }: { tier: string }) {
  if (tier === 'pro' || tier === 'admin') {
    return <span className="premium-label pro-label">⚡ PRO ELITE</span>
  }
  return <span className="premium-label free-label">FREE SCHOLAR</span>
}

export function LockedState({ featureName }: { featureName: string }) {
  const setUpgradeModal = useStore((state) => state.setUpgradeModal)
  return (
    <div className="locked-state-overlay glass-panel anim-scale-up">
      <div className="locked-content">
        <div className="locked-icon">🔒</div>
        <h3 className="gradient-text mt-2">{featureName} is Premium</h3>
        <p className="text-secondary font-medium">Unlock full academic AI agents, live timer statistics, and dynamic context search by becoming Pro.</p>
        <button onClick={() => setUpgradeModal(true)} className="btn btn-primary btn-sm btn-pulse mt-3">
          ⚡ Upgrade to Pro
        </button>
      </div>
    </div>
  )
}
