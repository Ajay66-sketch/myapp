# UI Component Development Guidelines

This guide defines standard implementation patterns for creating visually stunning, accessible, and performant React components that align with the Scholar platform's Design System.

---

## 💀 1. Skeleton Loading States Pattern

To prevent page reflow and preserve visual continuity during data fetches, components must implement skeleton placeholders instead of generic text spinners:

### Implementation Rules:
1. **Preserve Dimensions**: Skeleton elements must match the exact height, width, and border-radius of the loaded state card.
2. **Shimmer Animation**: Skeletons should use standard linear gradients that animate left-to-right (`animation: shimmer 1.5s infinite`).
3. **Structured Skeletons**: Avoid single large blocks. Use separate bars for headers, metadata rows, and profile cards.

```tsx
// Standard Page Skeleton block
export const CardSkeleton: React.FC = () => (
  <div className="skeleton-card glass-panel" style={{ height: '140px' }}>
    <div className="skeleton-header-shimmer" style={{ width: '40%', height: '18px', marginBottom: '10px' }} />
    <div className="skeleton-body-shimmer" style={{ width: '80%', height: '12px', marginBottom: '6px' }} />
    <div className="skeleton-body-shimmer" style={{ width: '60%', height: '12px' }} />
  </div>
)
```

---

## ⚡ 2. Optimistic UI Updates Pattern

Interactive gamification and utility toggles (such as checking first-session checklist tasks) must update state immediately on click, rather than waiting for backend network cycles:

### Implementation Sequence:
1. **Zustand Action**: Optimistically alter state inside store definitions.
2. **API Trigger**: Fire backend async endpoints.
3. **Rollback Handler**: Catch exceptions. If network queries fail, restore state and prompt warning banners.

```typescript
// Example of optimistic toggle action
const checkMissionOptimistic = (taskId: string) => {
  const previousState = get().user;
  
  // 1. Optimistic Update
  set((state) => ({
    user: state.user ? { ...state.user, xp: state.user.xp + 50 } : null
  }));

  // 2. Dispatch Server request
  apiService.onboarding.completeTask(taskId).catch(() => {
    // 3. Rollback on failure
    set({ user: previousState });
  });
}
```

---

## 🎯 3. Tooltips & Hotkey Indicators

Advanced features, keyboard bindings, and metric cards must feature clear hover-guided tooltips to drive onboarding discovery:

### Tooltip Specs:
- **Placement**: Center-aligned above target components (`transform: translateY(-8px)`).
- **Hotkey bindings**: Feature keyboard keys (e.g. `[Space]` or `[?]`) highlighted in high-contrast monospaced tags inside the tooltip box.
- **Trigger**: Listen strictly to pointer hover and keyboard focus states.

---

## ♿ 4. Accessibility & Semantic HTML (WAI-ARIA)

Components must adhere to WCAG 2.1 accessibility criteria:

1. **Semantic Hierarchy**: Maintain a logical header hierarchy. Never skip levels (e.g. `h1` directly to `h3`).
2. **Keyboard Traps**: Modals and settings panels must handle key binds to prevent focus trapping:
   - `Escape`: Instantly trigger modal close triggers.
   - `Tab` / `Shift+Tab`: Constrain focus selection inside visible modals.
3. **ARIA Attributes**:
   - Toggles and interactive icons must contain descriptive `aria-label` tags.
   - Expandable menus must present `aria-expanded="true/false"`.
   - Busy loading sections must have `aria-live="polite"`.
