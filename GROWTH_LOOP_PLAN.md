# Growth Loops & Virality Playbook: Driving Organic Scale

This playbook outlines our growth-focused mechanisms to maximize organic user acquisition, Day-1 activation, and long-term cohort retention.

---

## 🔄 1. Reciprocal Peer Referral Loops

To reduce Customer Acquisition Costs (CAC) to zero, we implement an organic classmate referral program:

```
┌─────────────────────────────────┐        ┌─────────────────────────────────┐
│     Host Scholar User Shares    │ ──────>│   Referee Student Signs Up      │
│  "SCHOLAR-REF-[USERNAME]" Link  │        │   Using Host's Code or Link     │
└─────────────────────────────────┘        └─────────────────────────────────┘
                ▲                                           │
                │                                           ▼
┌─────────────────────────────────┐        ┌─────────────────────────────────┐
│       Host Instantly Gains      │ <──────│     Referee Instantly Unlocks   │
│      +50 XP Focus Boost         │        │       +50 XP Welcome Boost      │
└─────────────────────────────────┘        └─────────────────────────────────┘
```

### Viral Optimization Indicators:
- **K-Factor Target**: Target organic virality coefficient of **K > 0.25** (i.e. every 4 users successfully bring in at least 1 active peer).
- **Clipboard API Integrations**: Provides single-click **Copy Invite Link** actions instantly loading customized codes.

---

## ⚡ 2. Loss Aversion: Daily Study Streaks

Product habits are anchored around study streak indicators:

- **Streak Freeze Mechanism**:
  - Streak freezes act as "retention hooks". If a user is busy, they can use a Freeze to preserve their streak.
  - Standard users get 1 active Freeze; Pro users secure 3 freezes replenished monthly.
- **Comeback Alerts**:
  - BullMQ background workers track users who have been inactive for 24 hours.
  - Automatically schedules real-time **Comeback Notifications** ("Keep your study streak alive!") and dispatches automated emails before decay.

---

## 📊 3. Cohort Retention Heatmap Evaluation

Retention is audited across weekly signup groups using the administrative cohort retention matrix dashboard:

### cohort metrics guidelines:
1. **Week 1 Benchmark (Target > 60%)**: Traced to first highlights tour and day-1 gamified checklist completions.
2. **Week 4 Benchmark (Target > 40%)**: Driven by social accountability chat rooms, Pomodoro timer synchronization, and custom study streak boosts.
3. **Optimizing Drop-offs**: If a specific cohort experiences drops in week 2, the growth team schedules real-time notifications, AI prompt boost coupons, or streak freeze rewards.
