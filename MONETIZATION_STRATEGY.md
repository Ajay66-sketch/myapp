# SaaS Monetization & Pricing Strategy Guide

This guide details the pricing mechanics, financial indicators, gross margin models, and subscription lifecycle systems that drive the Scholar platform's monetization model.

---

## 💎 1. Pricing Structure Optimization

The pricing model balances standard resource availability with premium, high-value compute features:

```
┌───────────────────────────────┐        ┌───────────────────────────────┐
│     Standard Learner (Free)   │        │   Cognitive Elite Pro (SaaS)  │
│          $0.00 / month        │ ──────>│     $9.99/mo (or $7.99/mo)    │
│  - 10 study sessions/month    │        │  - Unlimited Study Corridors  │
│  - Daily Leaderboards access  │        │  - Unlimited AI Tutor prompts │
│  - Basic Pomodoro timers      │        │  - High-Speed notes scanning  │
└───────────────────────────────┘        └───────────────────────────────┘
```

### Conversion Toggles:
1. **Annual Commit Toggles**: Users can toggle between **$9.99 billed monthly** and **$7.99 billed annually (Save 20%)**. This locks in long-term commit volume and dramatically boosts Customer Lifetime Value (LTV).
2. **Quota Exhaustion Nudges**: Standard users receive yellow warning banners once they reach 90% of their daily free AI prompts capacity, linking them directly to checkout screens.

---

## 📈 2. Gross Margin & AI Cost Telemetry

To ensure a highly profitable SaaS operations structure, we trace gross margins in real-time using our Mongoose `AiUsageLog` schemas:

$$\text{Gross Margin \%} = \frac{\text{Projected MRR} - \text{Cumulative LLM Costs}}{\text{Projected MRR}} \times 100$$

### AI Costs Structure:
- **Baseline LLM Costs**: Normalized at approximately **$0.02 per 1K tokens** (OpenAI GPT-4o / Claude completions).
- **Pro Quotas Constraint**: Pro users are capped at **50 AI companion completions per hour** via Redis rate limiters, ensuring that extreme usage never forces gross margins below our target benchmark of **85%**.

---

## 🛡️ Churn Prevention & Win-Back Funnels

Customer cancellations are processed through a highly optimized multi-step exit loop rather than an instant downgrade action:

1. **Friction Surveys**: Admins audit exit logs ("Too expensive", "No longer studying") to refine product features.
2. **Win-back Discount Prompts**:
   - If user cancels due to price, they receive an instant **50% discount for the next 3 months ($4.99/mo)**.
   - If user is taking a vacation, they can click **Pause Subscription Billing for 30 Days** at zero cost, preserving their active streaks, badge collections, and leaderboards position.
3. **Outcome Metrics**: Target win-back retention rates are **> 30%** of all cancel-intent sessions.

---

## ⚙️ Transactional Email Automation Pipelines

Lifecycle alerts are generated in the background by separate BullMQ workers using the custom `emailService`:

| Lifecycle Stage | Event Trigger | Email Template Details | Action CTA |
| :--- | :--- | :--- | :--- |
| **User Sign-up** | Account Created | **Onboarding Welcome**: Details Quickstart guides and enters user into Day-1 checklist. | Launch Workspace |
| **Trial Ending** | 90% Free credits spent | **Quota Warning**: Warns user of credit limits and details premium benefits of Pro. | Upgrade to Pro |
| **Failed Billing** | Stripe Webhook (`invoice.payment_failed`) | **Payment Recovery Alert**: Notifies user of a 7-day billing grace period. | Update Credit Card |
