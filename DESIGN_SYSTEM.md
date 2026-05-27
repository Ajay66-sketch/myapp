# SaaS Design System: Unified Tokens & Foundations

This manual details the formal tokens, palettes, layout standards, and styling utilities that establish our modern, premium VC-backed startup aesthetic across the Scholar platform.

---

## 🎨 1. Theme-Specific Color Palettes (HSL Tailored)

The design system employs a curated glassmorphic system supporting automatic system/user Light and Dark mode transitions:

### Light Mode Foundations
- **`--bg-primary`**: `#f8fafc` (Clean slate white)
- **`--bg-secondary`**: `#f1f5f9` (Cool grey container backs)
- **`--bg-glass`**: `rgba(255, 255, 255, 0.7)` (Blur container backing)
- **`--border-glass`**: `rgba(15, 23, 42, 0.08)` (Subtle hairline dividers)
- **`--text-primary`**: `#0f172a` (Slate-900 high contrast headers)
- **`--text-secondary`**: `#475569` (Slate-600 body copy)
- **`--text-muted`**: `#94a3b8` (Slate-400 placeholder indicators)

### Dark Mode Foundations (`.theme-dark`)
- **`--bg-primary`**: `#020617` (Deep Obsidian space)
- **`--bg-secondary`**: `#0b1329` (Obsidian Navy plates)
- **`--bg-glass`**: `rgba(15, 23, 42, 0.65)` (Translucent navy)
- **`--border-glass`**: `rgba(255, 255, 255, 0.08)` (Glimmering borders)
- **`--text-primary`**: `#f8fafc` (Slate-50 white headers)
- **`--text-secondary`**: `#94a3b8` (Slate-400 readable copy)
- **`--text-muted`**: `#64748b` (Slate-500 tags)

### Premium Accents & Gradients
- **Blue (`--accent-blue`)**: `#3b82f6` (Utility / Info triggers)
- **Purple (`--accent-purple`)**: `#a78bfa` (Pro features brand accent)
- **Amber (`--accent-amber`)**: `#fbbf24` (Streak warmups / Warnings)
- **Green (`--accent-green`)**: `#34d399` (Checklist achievements / XP gain)
- **Neon Glow Gradient (`--gradient-neon`)**: `linear-gradient(135deg, #3b82f6 0%, #a78bfa 50%, #f472b6 100%)` (Stellar accent points)

---

## 🔤 2. Typography & Font Families

We import and bind premium WebFonts via Google API bounds:
- **Display & Headings (`h1, h2, h3, h4, h5, h6`)**: **Outfit** (geometric display, weight `700`, letter-spacing `-0.025em`) to present a state-of-the-art startup look.
- **Body & Controls (`body, button, input`)**: **Inter** (highly legible, optimized layout, weights `300; 400; 500; 600; 700`).

---

## 📦 3. Spacing Grid & Border Radii

Transitions adhere to strict spacing values to maintain grid symmetry:

- **Gaps & Padding**:
  - `0.25rem` (3px - tab sliders gaps)
  - `0.5rem` (8px - micro spacing)
  - `0.75rem` (12px - tags, cards gaps)
  - `1.25rem` (20px - container gutters)
  - `2.5rem` (40px - modal paddings)
- **Container Radii**:
  - `--radius-lg`: `1.25rem` (20px - panels, modular cards)
  - `--radius-md`: `0.75rem` (12px - button widgets, inputs)
  - `--radius-sm`: `0.5rem` (8px - badges, notifications)

---

## ✨ 4. Translucency & Glassmorphism Spec

All primary panels leverage hardware-accelerated translucency filters:
```css
.glass-panel {
  background: var(--bg-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-glass);
  box-shadow: 0 10px 30px var(--shadow-glass);
  border-radius: var(--radius-lg);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```
**Micro-interaction glow**: On hover, glass panels adjust borders toward `rgba(167, 139, 250, 0.18)` and add subtle neon shadow glows.

---

## 🔄 5. Responsive Breakpoint Standards

- **Mobile Viewports (`max-width: 768px`)**: Split columns (`dashboard-layout`, `rooms-layout`) automatically reflow into unified vertical blocks. Sidebars compress into modular drawers or top sliders.
- **Tablet Boundaries (`768px` to `1024px`)**: Grid elements adapt with auto-fit margins.
- **Ultra-Wide Screens (`min-width: 1440px`)**: Centered layouts cap at `1280px` max-width bounds to preserve vertical scan balance.
