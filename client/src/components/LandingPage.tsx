// client/src/components/LandingPage.tsx
// Rearchitected public landing page for Scholar.
// Engineered to maximize conversion rates using interactive sandboxes, A/B testing modules, 
// waitlist capture triggers, JSON-LD metadata, and gamified XP boosters.

import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { AuthModal } from './AuthModal'
import { postHogAnalytics } from '../analytics/postHogAnalytics'

interface Toast {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning'
}

interface XpParticle {
  id: string
  x: number
  y: number
  amount: number
}

// A/B Testing Variants definition
const HEADLINES = [
  { id: 'A', text: "Defy Distraction. Master Deep Work." },
  { id: 'B', text: "The AI-Native Study Engine for Top 1% Students." },
  { id: 'C', text: "Double Your Focus. Automate Your Study Materials." }
];

const CTAS = [
  { id: 'A', text: "⚡ Launch Interactive Workspace" },
  { id: 'B', text: "🚀 Claim Free Pro Access (Limited Sprints)" },
  { id: 'C', text: "🔥 Join 24,000+ Elite Scholars" }
];

export function LandingPage() {
  const { enterDemoMode } = useStore()
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('annual')
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  // A/B Testing state
  const [headlineVariant, setHeadlineVariant] = useState(HEADLINES[0])
  const [ctaVariant, setCtaVariant] = useState(CTAS[0])

  // Waitlist state
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false)
  const [waitlistCount, setWaitlistCount] = useState(14842)

  // Referral loop state
  const [referralCode, setReferralCode] = useState('')
  const [referralCopied, setReferralCopied] = useState(false)

  // Cumulative focus hours counter (SaaS social proof)
  const [cumulativeHours, setCumulativeHours] = useState(142854.4)

  // Guided Tour State
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [activityFeed, setActivityFeed] = useState<string[]>([
    "🔥 Jessica R. completed a 50-minute thermodynamics sprint",
    "👑 Marie Curie unlocked the 'Cognitive Legend' milestone badge",
    "👥 CS Theory Corridor reached peak capacity (8 active scholars)",
    "❄️ Aman S. activated streak freeze cushion protection",
    "🏆 Tesla gained +120 XP points climbing to Daily Rank 3"
  ])

  // Live Sandbox simulator State
  const [simTimer, setSimTimer] = useState(1500) // 25:00
  const [simParticipants, setSimParticipants] = useState(['Jessica R.', 'Aman S.', 'Marie Curie'])
  const [simChats, setSimChats] = useState([
    { id: 1, user: 'Jessica R.', msg: 'Starting the thermodynamics focus corridor sprint! 📚' },
    { id: 2, user: 'Aman S.', msg: 'Joined! Solving advanced math calculations today.' }
  ])

  // AI Tutor simulator state
  const [aiDialogue, setAiDialogue] = useState<Array<{ sender: 'user' | 'ai', text: string, isPremiumLocked?: boolean }>>([
    { sender: 'ai', text: "Hello scholar! Pick a dynamic prompt chip below or ask any academic question. Let's optimize your study session! 🧠" }
  ])
  const [aiStreaming, setAiStreaming] = useState(false)
  const [aiInput, setAiInput] = useState('')

  // Gamification state
  const [userXp, setUserXp] = useState(180)
  const [userLevel, setUserLevel] = useState(3)
  const [userStreak, setUserStreak] = useState(3)
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>(['room_pioneer'])

  // Dopamine particle & toasts state
  const [xpParticles, setXpParticles] = useState<XpParticle[]>([])
  const [showStreakIgnite, setShowStreakIgnite] = useState(false)
  const [showBadgeUnlock, setShowBadgeUnlock] = useState(false)
  const [unlockedBadgeName, setUnlockedBadgeName] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])

  const chatEndRef = useRef<HTMLDivElement>(null)
  const activityIntervalRef = useRef<any>(null)

  // ────────────────────────────────────────────────────────────────────────
  // Initialization & A/B Setup
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // 1. Assign A/B Testing variants randomly
    const headIndex = Math.floor(Math.random() * HEADLINES.length);
    const ctaIndex = Math.floor(Math.random() * CTAS.length);
    setHeadlineVariant(HEADLINES[headIndex]);
    setCtaVariant(CTAS[ctaIndex]);

    postHogAnalytics.track('ab_landing_page_loaded', {
      headline_id: HEADLINES[headIndex].id,
      cta_id: CTAS[ctaIndex].id
    });

    // 2. Fetch or mock local referral code
    let savedRef = localStorage.getItem('capturedReferralCode') || '';
    if (!savedRef) {
      savedRef = `SCHOLAR-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      localStorage.setItem('capturedReferralCode', savedRef);
    }
    setReferralCode(savedRef);

    // 3. Ticking synchronized clock
    const timer = setInterval(() => {
      setSimTimer((prev) => (prev <= 0 ? 1500 : prev - 1));
    }, 1000);

    // 4. Guided Tour trigger
    const tourTimer = setTimeout(() => {
      setTourStep(0);
    }, 2000);

    // 5. Slowly tick up focus hours counter
    const hoursInterval = setInterval(() => {
      setCumulativeHours((prev) => parseFloat((prev + 0.1).toFixed(1)));
    }, 1800);

    // 6. Dynamic scrolling recent activity feed
    const activities = [
      "🔥 Ken S. completed a 2-hour CS algorithms sprint",
      "👑 Jessica R. reached streak day 20! Milestone achieved!",
      "👥 MIT Physics Room gained 2 new scholars (Jessica & Grace)",
      "🏆 Marie Curie earned +80 XP solving quantum mechanics logs",
      "⚡ Tesla unlocked standard rate limiter controls",
      "❄️ Ada L. activated streak freeze buffer on Stanford Room",
      "🏆 Aman S. leveled up to Scholar Level 5! 🔥"
    ];
    activityIntervalRef.current = setInterval(() => {
      const randomActivity = activities[Math.floor(Math.random() * activities.length)];
      setActivityFeed((prev) => [randomActivity, ...prev.slice(0, 4)]);
      
      if (Math.random() > 0.6) {
        const scholars = ['Jessica R.', 'Marie Curie', 'Ken S.', 'Ada L.', 'Tesla'];
        const name = scholars[Math.floor(Math.random() * scholars.length)];
        addToast('✨ Live Scholar Milestone', `${name} just completed a Pomodoro block!`, 'info');
      }
    }, 5500);

    return () => {
      clearInterval(timer);
      clearTimeout(tourTimer);
      clearInterval(hoursInterval);
      clearInterval(activityIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simChats, aiDialogue]);

  // ────────────────────────────────────────────────────────────────────────
  // Action Handlers
  // ────────────────────────────────────────────────────────────────────────
  const addToast = (title: string, message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = 'toast-' + Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const spawnXpParticles = (amount: number, clientX?: number, clientY?: number) => {
    const x = clientX || window.innerWidth / 2 + (Math.random() - 0.5) * 200;
    const y = clientY || window.innerHeight / 2 + (Math.random() - 0.5) * 100;
    const id = 'xp-' + Math.random().toString(36).substring(2, 9);
    setXpParticles((prev) => [...prev, { id, x, y, amount }]);
    
    setUserXp((prev) => {
      const nextXp = prev + amount;
      const threshold = 300;
      if (nextXp >= threshold) {
        setUserLevel((l) => l + 1);
        addToast('🏆 LEVEL UP!', `Congratulations, you reached level ${userLevel + 1}!`, 'success');
        return nextXp - threshold;
      }
      return nextXp;
    });

    setTimeout(() => {
      setXpParticles((prev) => prev.filter((p) => p.id !== id));
    }, 1500);
  };

  const triggerAiResponse = (promptKey: string, e?: React.MouseEvent) => {
    if (aiStreaming) return;
    spawnXpParticles(20, e?.clientX, e?.clientY);

    let promptText = "";
    let fullResponse = "";
    let isPremiumLocked = false;

    if (promptKey === 'formula') {
      promptText = "Break down quantum wave equation formulas.";
      fullResponse = "The Schrödinger Wave Equation: iℏ(∂/∂t)Ψ = ĤΨ.\nWhere Ψ is the wave function, ℏ is reduced Planck's constant, and Ĥ is the Hamiltonian operator.\n\nIt describes how the spatial wavefunction of a quantum state evolves over time..."
    } else if (promptKey === 'summary') {
      promptText = "Compile room study summary & metrics.";
      fullResponse = "Study Corridor Session Summary Compiled:\n- Total Active Scholars: 3\n- Focus Efficiency: 96.2%\n- Jessica R. studied Physics (45m)\n- Marie Curie researched Chemistry (62m)\n\n"
      isPremiumLocked = true;
    } else if (promptKey === 'limit') {
      promptText = "Provide secure Express middleware template.";
      fullResponse = "Secure Request rate-limiter Express middleware template:\n\nconst rateLimit = require('express-rate-limit');\nconst secureLimiter = rateLimit({\n  windowMs: 15 * 60 * 1000,\n  max: 100\n});"
    }

    setAiDialogue((prev) => [...prev, { sender: 'user', text: promptText }]);
    setAiStreaming(true);

    let currentText = "";
    let index = 0;
    setAiDialogue((prev) => [...prev, { sender: 'ai', text: '' }]);

    const interval = setInterval(() => {
      if (index < fullResponse.length) {
        currentText += fullResponse[index];
        index++;
        setAiDialogue((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { sender: 'ai', text: currentText };
          return updated;
        });
      } else {
        clearInterval(interval);
        setAiStreaming(false);
        if (isPremiumLocked) {
          setAiDialogue((prev) => [
            ...prev,
            { 
              sender: 'ai', 
              text: "🔒 DEEP CONTEXT SUMMARY LOCKED.\nUpgrade to Cognitive Elite Pro to unlock full textbook indexing, flashcard auto-generations, and SSE stream answers!",
              isPremiumLocked: true 
            }
          ]);
          addToast('❄️ Pro Feature Locked', 'Upgrade to Pro to unlock Textbook compilations.', 'warning');
        } else {
          addToast('🏆 Interaction XP Boost!', 'You earned +20 XP prompting the Academic AI Tutor!', 'success');
        }
      }
    }, 15);
  };

  const handleWaitlistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;

    postHogAnalytics.track('waitlist_signup_completed', { email: waitlistEmail });
    setWaitlistSubmitted(true);
    setWaitlistCount((c) => c + 1);
    spawnXpParticles(100);
    addToast('🚀 Waitlist Spot Secured!', 'You earned +100 Focus XP! Check your inbox shortly.', 'success');
  };

  const copyReferral = () => {
    setReferralCopied(true);
    postHogAnalytics.track('referral_link_shared', { referralCode });
    addToast('🔥 Referral Link Copied!', 'Invite classmates to double focus speed and boost dual levels!', 'success');
    setTimeout(() => setReferralCopied(false), 2000);
  };

  const formatSimTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  return (
    <div className="landing-container theme-dark">
      
      {/* ─── JSON-LD Structured SEO Schema ────────────────────────────────────── */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "Scholar AI",
          "applicationCategory": "EducationalApplication",
          "operatingSystem": "iOS, Android, Web",
          "offers": {
            "@type": "Offer",
            "price": "9.99",
            "priceCurrency": "USD"
          },
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.9",
            "ratingCount": "1840"
          }
        })}
      </script>

      {/* ─── Premium Header Navbar ────────────────────────────────────────────── */}
      <nav className="landing-nav glass-panel">
        <div className="landing-logo gradient-text">✨ scholar.ai</div>
        <div className="nav-links">
          <a href="#how-it-works" className="nav-link">How It Works</a>
          <a href="#features" className="nav-link">AI Companion</a>
          <a href="#pricing" className="nav-link">Pricing</a>
          <a href="#faq" className="nav-link">FAQ</a>
        </div>
        <div className="nav-actions">
          <button onClick={() => setTourStep(0)} className="btn btn-secondary btn-sm tour-trigger-btn">
            🧭 Walkthrough
          </button>
          <button onClick={enterDemoMode} className="btn btn-primary btn-sm btn-sandbox-nav btn-pulse">
            ⚡ Enter Sandbox
          </button>
        </div>
      </nav>

      {/* ─── Conversion-Optimized Hero Split Section ───────────────────────────── */}
      <header className="hero-split-layout" id="how-it-works">
        <div className="hero-radial-glow"></div>
        <div className="hero-grid-pattern"></div>

        <div className="hero-marketing-col anim-fade-in">
          <div className="hero-tagline glass-panel">
            🎓 THE ULTIMATE AI-NATIVE STUDY SANDBOX
          </div>
          <h1 className="hero-headline font-outfit">
            {headlineVariant.text}
          </h1>
          <p className="hero-subtext">
            Meet Scholar. An SRE-grade academic productivity engine. Join real-time study corridors alongside peers, upload full textbooks, generate active recall flashcards, and run vector similarity search notes fully offline.
          </p>

          {/* Waitlist and CTA container */}
          <div className="waitlist-card-wrapper glass-panel">
            {!waitlistSubmitted ? (
              <form onSubmit={handleWaitlistSubmit} className="waitlist-form">
                <input
                  type="email"
                  placeholder="Enter university email..."
                  required
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  className="waitlist-input"
                />
                <button type="submit" className="btn btn-primary btn-pulse waitlist-submit-btn">
                  Claim Free Pro Access
                </button>
              </form>
            ) : (
              <div className="waitlist-success anim-scale-up">
                <Text style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10B981' }}>
                  🚀 Spot #{waitlistCount} Secured! (+100 XP Sparked)
                </Text>
                <Text style={{ fontSize: '0.9rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
                  クラスメイトと共有して、さらにXPをアンロックしよう！
                </Text>
              </div>
            )}
            <div className="social-proof-badges">
              <span>🔥 <strong>{waitlistCount}</strong> scholars enqueued this week</span>
              <span className="badge-separator">•</span>
              <span>🎓 <strong>{cumulativeHours.toLocaleString()}</strong> hours completed</span>
            </div>
          </div>

          {/* University Social Proof */}
          <div className="social-proof-logos">
            <span className="social-label">TRUSTED BY STUDENTS AT</span>
            <div className="logo-marquee">
              <span className="marquee-item">MIT</span>
              <span className="marquee-item">Stanford</span>
              <span className="marquee-item">Cambridge</span>
              <span className="marquee-item">Harvard</span>
              <span className="marquee-item">Berkeley</span>
            </div>
          </div>
        </div>

        {/* Live Active Study Corridor Simulator */}
        <div className="hero-sandbox-col glass-panel anim-scale-up" id="sandbox-element">
          
          {tourStep !== null && (
            <div className="tour-spotlight-overlay">
              <div className={`tour-tooltip step-${tourStep} glass-panel`}>
                <div className="tooltip-header">
                  <span>🧭 Guided Product Tour ({tourStep + 1}/4)</span>
                  <button className="tooltip-close" onClick={() => setTourStep(null)}>&times;</button>
                </div>
                
                {tourStep === 0 && (
                  <>
                    <p>Welcome! This is the <strong>Synchronized Study Corridor</strong>. A Pomodoro clock ticks down live for all scholars in this room simultaneously.</p>
                    <button className="btn btn-primary btn-sm mt-2" onClick={() => setTourStep(1)}>Next: Ask AI Coach</button>
                  </>
                )}
                {tourStep === 1 && (
                  <>
                    <p>This is the <strong>Gemini Academic Assistant</strong>. Click any prompt chip or ask formulas. Premium summary answers are rate-limited until you upgrade.</p>
                    <button className="btn btn-primary btn-sm mt-2" onClick={() => setTourStep(2)}>Next: XP dopamine boost</button>
                  </>
                )}
                {tourStep === 2 && (
                  <>
                    <p>Track your <strong>Level, Streak, and Badges</strong>. Click the 'Boost Streaks' button below to trigger streak flame ignitions and earn XP!</p>
                    <button className="btn btn-primary btn-sm mt-2" onClick={() => setTourStep(3)}>Next: Pro upgrades</button>
                  </>
                )}
                {tourStep === 3 && (
                  <>
                    <p>Ready to unlock the full platform sandbox? Click <strong>'Launch Full Sandbox'</strong> to access infinite private corridors, badges, and the global leaderboards!</p>
                    <button className="btn btn-primary btn-sm mt-2" onClick={() => setTourStep(null)}>Finish & Play</button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="sandbox-header glass-panel">
            <div className="header-meta">
              <h3>🏫 MIT Quantum Mechanics Sync Room</h3>
              <p>Presence count: 👥 {simParticipants.length} scholars online</p>
            </div>
            <button onClick={enterDemoMode} className="btn btn-secondary btn-sm">
              🚪 Full Sandbox
            </button>
          </div>

          <div className="sandbox-workspace-grid">
            
            <div className="sandbox-left-panel">
              
              <div className="sandbox-timer glass-panel text-center">
                <h4>⏱️ Synchronized Timer</h4>
                <div className="sandbox-timer-display gradient-text">{formatSimTime(simTimer)}</div>
                <div className="timer-status-badge">🟢 LIVE FOCUS SPRINT</div>
              </div>

              <div className="sandbox-gamify-stats glass-panel">
                <h4>🎖️ Scholar Stats & Streaks</h4>
                
                <div className="mini-stats-row">
                  <div className="mini-stat-card glass-panel">
                    <span className="stat-icon-flame">🔥</span>
                    <strong>{userStreak} Days</strong>
                  </div>
                  <div className="mini-stat-card glass-panel">
                    <span className="stat-icon-lvl">🏅</span>
                    <strong>Lvl {userLevel}</strong>
                  </div>
                </div>

                <div className="sandbox-xp-progress-bar">
                  <div className="xp-labels">
                    <span>XP progress</span>
                    <span>{userXp} / 300 XP</span>
                  </div>
                  <div className="xp-track">
                    <div className="xp-fill-bar" style={{ width: `${(userXp / 300) * 100}%` }}></div>
                  </div>
                </div>

                <button onClick={(e) => {
                  if (showStreakIgnite) return;
                  spawnXpParticles(80, e.clientX, e.clientY);
                  setShowStreakIgnite(true);
                  setUserStreak((prev) => prev + 1);
                  addToast('🔥 STREAK COMBUSTION ACTIVE!', `Your focus streak reached Day ${userStreak + 1}!`, 'success');
                  setTimeout(() => setShowStreakIgnite(false), 3200);
                }} className="btn btn-primary btn-sm btn-block btn-pulse btn-streak-combust mt-2">
                  🔥 Boost Streaks & Earn +80 XP
                </button>
              </div>

              <div className="sandbox-presence-list glass-panel">
                <h4>👥 online scholars (presence)</h4>
                <div className="presence-rows">
                  {simParticipants.map((sch, i) => (
                    <div key={i} className="presence-row glass-panel">
                      <span className="presence-dot">🟢</span>
                      <strong>{sch}</strong>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="sandbox-right-panel glass-panel">
              
              <div className="sandbox-chat-area">
                <h4>💬 synchronized room chat log</h4>
                <div className="chat-log-box">
                  {simChats.map((c, i) => (
                    <div key={i} className="chat-log-row">
                      <strong className="chat-user">{c.user}:</strong>
                      <span className="chat-msg">{c.msg}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </div>

              <div className="sandbox-ai-area glass-panel">
                <div className="ai-header-row">
                  <h4>🤖 academic AI tutor (gemini)</h4>
                  <span className="ai-badge">COMPANION ACTIVE</span>
                </div>

                <div className="ai-dialogue-box">
                  {aiDialogue.map((dialog, idx) => (
                    <div key={idx} className={`ai-dialogue-row ${dialog.sender === 'ai' ? 'ai-sender-row' : 'user-sender-row'}`}>
                      <span className="dialogue-icon">{dialog.sender === 'ai' ? '🤖' : '👨‍🎓'}</span>
                      <div className="dialogue-content">
                        {dialog.isPremiumLocked ? (
                          <div className="premium-lock-gate glass-panel anim-scale-up">
                            <div className="lock-icon">🔒</div>
                            <h5>Locked Premium Academic Analysis</h5>
                            <p>Unlock Schrödinger solutions, infinite summarize compilations, and CSV exports by updating to Cognitive Pro.</p>
                            <button onClick={() => setIsAuthOpen(true)} className="btn btn-primary btn-sm btn-pulse">
                              ⚡ Upgrade to Pro ($9.99/mo)
                            </button>
                          </div>
                        ) : (
                          <p className="dialogue-text-body">{dialog.text}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {aiStreaming && (
                    <div className="ai-dialogue-row ai-sender-row">
                      <span className="dialogue-icon">🤖</span>
                      <div className="streaming-dots">
                        <span></span><span></span><span></span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="ai-prompt-chips">
                  <span className="chips-label">Quick academic prompt chips:</span>
                  <button 
                    disabled={aiStreaming}
                    onClick={(e) => triggerAiResponse('formula', e)} 
                    className="chip-btn glass-panel"
                  >
                    🌌 Wave Equation formula
                  </button>
                  <button 
                    disabled={aiStreaming}
                    onClick={(e) => triggerAiResponse('summary', e)} 
                    className="chip-btn glass-panel"
                  >
                    📈 Summarize Room Logs (Gate)
                  </button>
                </div>
              </div>

            </div>

          </div>

        </div>

      </header>

      {/* ─── Interactive AI Demos Section ──────────────────────────────────────── */}
      <section className="features-grid-section text-center" id="features">
        <h2 className="section-title">Deep Academic Capabilities</h2>
        <p className="section-subtitle font-outfit">SaaS features built natively to double focus speeds.</p>

        <div className="features-showcase-grid">
          <div className="feature-demo-card glass-panel anim-fade-in">
            <span className="demo-icon">📚</span>
            <h3>Vector Textbook Chunking</h3>
            <p>Upload heavy academic textbook PDFs. Our background workers chunk content and index semantic vectors for ultra-low latency contextual retrieval.</p>
            <div className="mini-vector-chunker glass-panel">
              <div className="chunk-header">
                <span>Textbook_Chunk_#12.json</span>
                <span className="chunk-sim">98.4% Similarity</span>
              </div>
              <p className="chunk-snippet">"...quantum mechanics models Schrödinger's wave equations across discrete state vectors..."</p>
            </div>
          </div>

          <div className="feature-demo-card glass-panel anim-fade-in">
            <span className="demo-icon">⚡</span>
            <h3>Spaced Repetition & Badges</h3>
            <p>Maintain daily focus streaks, secure custom profile badges, and unlock streak freeze cushions to protect records against heavy exam crunches.</p>
            <div className="badge-demo-row">
              <span className="demo-badge">🔥 Day 14</span>
              <span className="demo-badge highlight">🎖️ Brain Titan</span>
              <span className="demo-badge">❄️ 3 Cushions</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Classmate Referral CTA Loop Section ─────────────────────────────────── */}
      <section className="referral-loop-section text-center">
        <div className="referral-card glass-panel anim-scale-up">
          <div className="referral-glow"></div>
          <h2>🔥 Double Your Focus: Invite Classmates</h2>
          <p>Share your exclusive scholar access code below. When peers join, you both unlock +200 XP booster cards and premium study avatars.</p>
          
          <div className="referral-copy-box">
            <input type="text" readOnly value={`https://scholar.ai/join?ref=${referralCode}`} className="referral-input-box" />
            <button onClick={copyReferral} className="btn btn-primary referral-copy-btn btn-pulse">
              {referralCopied ? 'Copied! ✨' : 'Copy Link'}
            </button>
          </div>
          <p className="referral-metric">🎯 Earned +200 XP on classmates signup</p>
        </div>
      </section>

      {/* ─── Premium Pricing Grid ─────────────────────────────────────────────── */}
      <section id="pricing" className="pricing-section text-center">
        <h2 className="section-title">Upgrade Your Focus Index</h2>
        <p className="section-subtitle">Locked lifetime pricing. Cancel anytime in one-click cancellation portal.</p>

        <div className="pricing-toggle-row">
          <span>Monthly focus</span>
          <button 
            className={`pricing-toggle-switch ${billingPeriod === 'annual' ? 'active' : ''}`}
            onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')}
          >
            <span className="toggle-switch-handle"></span>
          </button>
          <span>Annual sprint (Save 30%!) 🚀</span>
        </div>

        <div className="pricing-grid">
          <div className="pricing-card glass-panel">
            <h3>Standard Scholar</h3>
            <div className="price-tag">Free</div>
            <p className="price-desc">Standard study accountability and basic Pomodoro synchronization.</p>
            <ul className="pricing-features">
              <li>👥 Join up to 10 synchronized rooms</li>
              <li>⏱️ Real-time Pomodoro timer</li>
              <li>🔥 Track daily streak flame counters</li>
              <li>❌ Academic AI tutor companion</li>
              <li>❌ Streak freeze cushions</li>
            </ul>
            <button onClick={enterDemoMode} className="btn btn-secondary btn-block mt-4">
              Get Started Free
            </button>
          </div>

          <div className="pricing-card glass-panel pro-pricing-card">
            <div className="price-ribbon">POPULAR CHOICE</div>
            <h3>Cognitive Elite Pro</h3>
            <div className="price-tag">
              {billingPeriod === 'annual' ? '$6.99' : '$9.99'}
              <span className="price-sub">/mo</span>
            </div>
            <p className="price-desc">For serious scholars, computer scientists, and mathematicians.</p>
            <ul className="pricing-features">
              <li>✦ Unlimited Study Corridor creation</li>
              <li>✦ **Academic AI Companion Tutor**</li>
              <li>✦ **Room Context summaries compilation**</li>
              <li>✦ Live **Streak Freeze cushions**</li>
              <li>✦ Professional exclusive profile badges</li>
            </ul>
            <button onClick={() => setIsAuthOpen(true)} className="btn btn-primary btn-block btn-pulse mt-4">
              Upgrade to Cognitive Pro
            </button>
          </div>
        </div>
      </section>

      {/* ─── Expandable FAQ Accordion ─────────────────────────────────────────── */}
      <section id="faq" className="faq-section text-center">
        <h2 className="section-title">Frequently Asked Questions</h2>
        <div className="faq-grid mt-4">
          {faqs.map((faq, idx) => (
            <div key={idx} className="faq-item glass-panel">
              <div 
                className="faq-header"
                onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
              >
                <h3>{faq.q}</h3>
                <span className="faq-toggle-icon">{activeFaq === idx ? '−' : '+'}</span>
              </div>
              <div className={`faq-body ${activeFaq === idx ? 'open' : ''}`}>
                <p>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Sticky Mobile CTA Banner ─────────────────────────────────────────── */}
      <div className="sticky-mobile-cta glass-panel anim-slide-in">
        <div className="sticky-meta">
          <strong>⚡ Scholar AI Sandbox</strong>
          <span>Join waitlist for Free Pro</span>
        </div>
        <button onClick={enterDemoMode} className="btn btn-primary btn-pulse sticky-cta-btn">
          Launch Demo
        </button>
      </div>

      {/* ─── Semantic Footer ──────────────────────────────────────────────────── */}
      <footer className="landing-footer glass-panel">
        <div className="footer-grid">
          <div className="footer-brand">
            <h3>✨ scholar.ai</h3>
            <p>Rearchitecting academic focus accountability through real-time sync systems and AI.</p>
          </div>
          <div className="footer-links-col">
            <h4>Capabilities</h4>
            <a href="#how-it-works">Sync Corridors</a>
            <a href="#features">AI Companion Tutor</a>
            <a href="#how-it-works">XP Streaks Booster</a>
          </div>
          <div className="footer-links-col">
            <h4>SaaS Structure</h4>
            <a href="#pricing">Pricing Plans</a>
            <a href="#pricing">Upgrade Portal</a>
            <a href="#faq">FAQ Board</a>
          </div>
          <div className="footer-links-col">
            <h4>System Standards</h4>
            <a href="/robots.txt">robots.txt policy</a>
            <a href="/sitemap.xml">XML Site map</a>
            <span className="footer-status-pill">🟢 ALL SYSTEMS ACTIVE</span>
          </div>
        </div>
        <div className="footer-copyright text-center">
          <p>© 2026 Antigravity Productivity Corp. Conversion-optimized deep study corridor sandbox. All rights reserved.</p>
        </div>
      </footer>

      {/* ─── Global AuthModal Upgrade Mock Dialog ──────────────────────────────── */}
      {isAuthOpen && (
        <div className="modal-overlay" onClick={() => setIsAuthOpen(false)}>
          <div className="auth-wrapper anim-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="auth-card glass-panel text-center">
              <button className="modal-close" onClick={() => setIsAuthOpen(false)}>&times;</button>
              
              <div className="upgrade-header">
                <div className="upgrade-badge">PREMIUM COGNITIVE UPGRADE</div>
                <h2 className="gradient-text">Unlock Scholar Pro Study Assistant</h2>
                <p>Supercharge focus with academic AI agents, daily streak freezes, and infinite history summaries.</p>
              </div>

              <div className="plans-grid mt-4">
                <div className="plan-card glass-panel pro-card text-left">
                  <div className="pro-ribbon">POPULAR</div>
                  <h3>Cognitive Elite Pro</h3>
                  <div className="plan-price">$9.99<span className="price-period">/mo</span></div>
                  <ul className="plan-features">
                    <li>✨ Unlimited dynamic study rooms</li>
                    <li>✨ **Academic AI Companion** (Chat sidebars)</li>
                    <li>✨ **AI Summarization** (Summarize last 50 logs)</li>
                    <li>✨ Live **Streak Freezes** cushions</li>
                  </ul>
                  <button onClick={() => {
                    addToast('Processing Payment Simulation...', 'Contacting secure Stripe billing portal.', 'info');
                    setTimeout(() => {
                      addToast('Upgrade completed successfully! Welcome to Pro Elite!', 'Welcome to the premium elite.', 'success');
                      useStore.setState({
                        user: {
                          _id: 'demo-user-1',
                          username: 'FocusExplorer (Demo)',
                          email: 'demo@antigravity.io',
                          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
                          bio: 'Exploring the ultimate productivity SaaS platform sandbox!',
                          xp: userXp,
                          level: userLevel,
                          badges: ['room_pioneer', 'premium_member'],
                          tier: 'pro',
                          streakFreezeCount: 3,
                          stats: { currentStreak: userStreak, longestStreak: 10, totalFocusMinutes: 240 }
                        },
                        isDemoMode: true,
                        isAuthenticated: true
                      });
                      setIsAuthOpen(false);
                      enterDemoMode();
                    }, 1200);
                  }} className="btn btn-primary btn-block btn-pulse mt-4">
                    💳 Complete Simulated Stripe Upgrade ($9.99)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Streak Combustion Ignition Dopamine Banner ───────────────────────── */}
      {showStreakIgnite && (
        <div className="streak-ignite-overlay">
          <div className="streak-ignite-banner glass-panel anim-scale-up">
            <span className="ignite-flame">🔥</span>
            <h2>STREAK IGNITED!</h2>
            <p>Day {userStreak} Focus Streak secured!</p>
            <div className="ignite-glow"></div>
          </div>
        </div>
      )}

      {/* ─── Floating Dopamine XP Particles Renderer ──────────────────────────── */}
      {xpParticles.map((particle) => (
        <span 
          key={particle.id}
          className="floating-xp-particle"
          style={{ top: `${particle.y}px`, left: `${particle.x}px` }}
        >
          +{particle.amount} XP ✨
        </span>
      ))}

      {/* ─── Floating Toast Notification Alerts ───────────────────────────────── */}
      <div className="demo-toasts-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-card glass-panel toast-${toast.type} anim-slide-in`}>
            <div className="toast-glow"></div>
            <div className="toast-header-row">
              <span className="toast-icon">
                {toast.type === 'success' ? '🏆' : toast.type === 'warning' ? '🔒' : '✨'}
              </span>
              <strong className="toast-title">{toast.title}</strong>
            </div>
            <p className="toast-message">{toast.message}</p>
          </div>
        ))}
      </div>

      {/* ─── High-Converting Dynamic CSS Styles block ─────────────────────────── */}
      <style>{`
        .landing-container {
          background: #09090E;
          color: #E2E8F0;
          min-height: 100vh;
          overflow-x: hidden;
          padding: 2rem 4rem;
          display: flex;
          flex-direction: column;
          gap: 6rem;
          font-family: 'Inter', sans-serif;
        }

        .landing-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          border-radius: 16px;
          background: rgba(15, 15, 25, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          z-index: 1000;
        }

        .landing-logo {
          font-family: 'Outfit', sans-serif;
          font-size: 1.4rem;
          font-weight: 800;
        }

        .nav-links {
          display: flex;
          gap: 2.5rem;
        }

        .nav-link {
          color: #9CA3AF;
          text-decoration: none;
          font-weight: 600;
          font-size: 0.95rem;
          transition: all 0.3s ease;
        }

        .nav-link:hover {
          color: #FFFFFF;
        }

        .nav-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .hero-split-layout {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 3rem;
          align-items: center;
          padding: 3rem 0;
        }

        .hero-radial-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(2, 6, 23, 0) 70%);
          z-index: 0;
          top: 50%;
          left: 30%;
          transform: translate(-50%, -50%);
          filter: blur(60px);
        }

        .hero-grid-pattern {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-size: 40px 40px;
          background-image: 
            linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
          z-index: 0;
        }

        .hero-marketing-col {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          text-align: left;
        }

        .hero-tagline {
          padding: 0.5rem 1.25rem;
          font-weight: 700;
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          border-radius: 2rem;
          display: inline-block;
          align-self: flex-start;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          color: #818CF8;
        }

        .hero-headline {
          font-size: 3.4rem;
          font-weight: 800;
          line-height: 1.15;
          color: #FFFFFF;
          font-family: 'Outfit', sans-serif;
        }

        .hero-subtext {
          font-size: 1.1rem;
          color: #9CA3AF;
          line-height: 1.65;
        }

        /* Waitlist card styles */
        .waitlist-card-wrapper {
          background: rgba(15, 15, 25, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .waitlist-form {
          display: flex;
          gap: 1rem;
        }

        .waitlist-input {
          flex: 1;
          background: rgba(9, 9, 14, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 1rem 1.25rem;
          color: #FFFFFF;
          font-size: 0.95rem;
        }

        .waitlist-submit-btn {
          border-radius: 12px;
          font-weight: 700;
          padding: 0 1.5rem;
        }

        .social-proof-badges {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.85rem;
          color: #9CA3AF;
        }

        .badge-separator {
          color: rgba(255, 255, 255, 0.15);
        }

        .social-proof-logos {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .social-label {
          font-size: 0.7rem;
          font-weight: 700;
          color: #6B7280;
          letter-spacing: 0.15em;
        }

        .logo-marquee {
          display: flex;
          gap: 2rem;
          opacity: 0.6;
        }

        .marquee-item {
          font-size: 1.1rem;
          font-weight: 800;
          color: #9CA3AF;
          font-family: 'Outfit', sans-serif;
        }

        /* Sandbox Sandbox Column */
        .hero-sandbox-col {
          border-radius: 20px;
          background: rgba(15, 15, 25, 0.65);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 1.5rem;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
        }

        .sandbox-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: rgba(9, 9, 14, 0.5);
          border-radius: 12px;
          margin-bottom: 1.25rem;
        }

        .sandbox-workspace-grid {
          display: grid;
          grid-template-columns: 1fr 1.3fr;
          gap: 1.25rem;
        }

        .sandbox-timer-display {
          font-size: 2.5rem;
          font-weight: 800;
          font-family: 'Outfit', sans-serif;
          margin: 0.5rem 0;
        }

        .timer-status-badge {
          font-size: 0.7rem;
          font-weight: 700;
          color: #10B981;
          letter-spacing: 0.08em;
        }

        .mini-stats-row {
          display: flex;
          gap: 0.75rem;
          margin: 0.75rem 0;
        }

        .mini-stat-card {
          flex: 1;
          padding: 0.5rem;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .sandbox-xp-progress-bar {
          margin: 0.75rem 0;
        }

        .xp-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: #9CA3AF;
          margin-bottom: 0.25rem;
        }

        .xp-track {
          height: 6px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 3px;
          overflow: hidden;
        }

        .xp-fill-bar {
          height: 100%;
          background: #6366F1;
          border-radius: 3px;
          transition: width 0.4s ease;
        }

        .sandbox-presence-list {
          margin-top: 1rem;
        }

        .presence-rows {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .presence-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.02);
        }

        .presence-dot {
          font-size: 0.6rem;
        }

        .chat-log-box {
          height: 120px;
          background: rgba(9, 9, 14, 0.6);
          border-radius: 12px;
          padding: 0.75rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin: 0.5rem 0;
        }

        .chat-log-row {
          font-size: 0.8rem;
          line-height: 1.3;
        }

        .chat-user {
          color: #818CF8;
          margin-right: 0.25rem;
        }

        .sandbox-ai-area {
          margin-top: 1rem;
          padding: 1rem;
          border-radius: 12px;
          background: rgba(9, 9, 14, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .ai-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .ai-badge {
          font-size: 0.65rem;
          font-weight: 700;
          color: #818CF8;
          background: rgba(99, 102, 241, 0.1);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }

        .ai-dialogue-box {
          height: 150px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .ai-dialogue-row {
          display: flex;
          gap: 0.5rem;
          font-size: 0.8rem;
          line-height: 1.4;
        }

        .ai-sender-row {
          align-self: flex-start;
        }

        .user-sender-row {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .dialogue-content {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          padding: 0.5rem 0.75rem;
          max-width: 85%;
        }

        .user-sender-row .dialogue-content {
          background: #6366F1;
          color: #FFFFFF;
        }

        .premium-lock-gate {
          text-align: center;
          padding: 0.75rem;
          border-color: rgba(99, 102, 241, 0.3);
        }

        .lock-icon {
          font-size: 1.5rem;
          margin-bottom: 0.25rem;
        }

        .ai-prompt-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .chips-label {
          font-size: 0.7rem;
          color: #6B7280;
          width: 100%;
        }

        .chip-btn {
          font-size: 0.75rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 0.35rem 0.75rem;
          color: #9CA3AF;
          transition: all 0.3s ease;
        }

        .chip-btn:hover {
          color: #FFFFFF;
          background: rgba(99, 102, 241, 0.1);
          border-color: rgba(99, 102, 241, 0.3);
        }

        /* Capabilities Feature Matrix Showcase */
        .features-showcase-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2.5rem;
          margin-top: 3rem;
        }

        .feature-demo-card {
          padding: 2.5rem;
          border-radius: 20px;
          background: rgba(15, 15, 25, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          text-align: left;
        }

        .demo-icon {
          font-size: 2.5rem;
          display: inline-block;
          margin-bottom: 1.25rem;
        }

        .mini-vector-chunker {
          margin-top: 1.25rem;
          padding: 1rem;
          background: rgba(9, 9, 14, 0.8);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .chunk-header {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          font-weight: 700;
          color: #9CA3AF;
          margin-bottom: 0.5rem;
        }

        .chunk-sim {
          color: #10B981;
        }

        .chunk-snippet {
          font-family: monospace;
          font-size: 0.8rem;
          color: #D1D5DB;
        }

        .badge-demo-row {
          display: flex;
          gap: 0.75rem;
          margin-top: 1.25rem;
        }

        .demo-badge {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 0.5rem 1rem;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 700;
        }

        .demo-badge.highlight {
          border-color: #F59E0B;
          color: #F59E0B;
          background: rgba(245, 158, 11, 0.05);
        }

        /* Classmate Referral Section */
        .referral-loop-section {
          padding: 4rem 0;
        }

        .referral-card {
          position: relative;
          padding: 3rem;
          border-radius: 24px;
          background: radial-gradient(circle at top left, rgba(99, 102, 241, 0.1), transparent);
          border: 1px solid rgba(99, 102, 241, 0.25);
          overflow: hidden;
          max-width: 800px;
          margin: 0 auto;
        }

        .referral-copy-box {
          display: flex;
          max-width: 500px;
          margin: 2rem auto 1rem auto;
          gap: 0.75rem;
        }

        .referral-input-box {
          flex: 1;
          background: rgba(9, 9, 14, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 0.85rem 1.25rem;
          color: #FFFFFF;
          font-size: 0.9rem;
        }

        .referral-copy-btn {
          border-radius: 12px;
          font-weight: 700;
        }

        .referral-metric {
          font-size: 0.85rem;
          color: #9CA3AF;
        }

        /* Dynamic Pricing styles */
        .pricing-toggle-row {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          margin: 2rem 0;
          font-weight: 600;
        }

        .pricing-toggle-switch {
          width: 50px;
          height: 28px;
          border-radius: 14px;
          background: #1F2937;
          border: 1px solid rgba(255, 255, 255, 0.1);
          position: relative;
          cursor: pointer;
        }

        .toggle-switch-handle {
          width: 22px;
          height: 22px;
          border-radius: 11px;
          background: #FFFFFF;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .pricing-toggle-switch.active {
          background: #6366F1;
        }

        .pricing-toggle-switch.active .toggle-switch-handle {
          left: 24px;
        }

        .pricing-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2.5rem;
          max-width: 900px;
          margin: 3rem auto 0 auto;
        }

        .pricing-card {
          padding: 3rem 2.5rem;
          border-radius: 20px;
          background: rgba(15, 15, 25, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          text-align: left;
        }

        .pro-pricing-card {
          border-color: #6366F1;
          box-shadow: 0 10px 40px rgba(99, 102, 241, 0.15);
          position: relative;
        }

        .price-ribbon {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: #6366F1;
          color: #FFFFFF;
          font-size: 0.7rem;
          font-weight: 800;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          letter-spacing: 0.08em;
        }

        .price-tag {
          font-size: 3rem;
          font-weight: 800;
          font-family: 'Outfit', sans-serif;
          margin: 1.5rem 0;
          color: #FFFFFF;
        }

        .price-sub {
          font-size: 1rem;
          font-weight: 600;
          color: #9CA3AF;
        }

        .pricing-features {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin: 2rem 0;
          list-style: none;
          padding: 0;
        }

        /* Sticky Mobile CTA Banner */
        .sticky-mobile-cta {
          position: fixed;
          bottom: 1.5rem;
          left: 1.5rem;
          right: 1.5rem;
          background: rgba(15, 15, 25, 0.85);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 1rem 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 1000;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
          animation: slideUpCta 0.4s ease-out forwards;
        }

        @keyframes slideUpCta {
          from { transform: translateY(100px) scale(0.9); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }

        .sticky-meta {
          display: flex;
          flex-direction: column;
          text-align: left;
        }

        .sticky-meta strong {
          color: #FFFFFF;
          font-size: 0.95rem;
        }

        .sticky-meta span {
          color: #9CA3AF;
          font-size: 0.8rem;
        }

        .sticky-cta-btn {
          border-radius: 10px;
          font-weight: 700;
          padding: 0.5rem 1rem;
        }

        /* Expandable Accordion FAQ */
        .faq-grid {
          max-width: 800px;
          margin: 3rem auto 0 auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .faq-item {
          border-radius: 12px;
          background: rgba(15, 15, 25, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
          text-align: left;
        }

        .faq-header {
          padding: 1.25rem 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }

        .faq-header h3 {
          font-size: 1.05rem;
          font-weight: 700;
          color: #FFFFFF;
          margin: 0;
        }

        .faq-toggle-icon {
          font-size: 1.5rem;
          color: #9CA3AF;
        }

        .faq-body {
          max-height: 0;
          overflow: hidden;
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          padding: 0 1.5rem;
        }

        .faq-body.open {
          max-height: 200px;
          padding: 0 1.5rem 1.5rem 1.5rem;
        }

        .faq-body p {
          color: #9CA3AF;
          font-size: 0.95rem;
          line-height: 1.6;
          margin: 0;
        }

        /* Footer Grid */
        .landing-footer {
          margin-top: 4rem;
          padding: 4rem 3rem 2rem 3rem;
          background: rgba(15, 15, 25, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
        }

        .footer-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr 1fr 1fr;
          gap: 3rem;
          text-align: left;
        }

        .footer-brand h3 {
          font-family: 'Outfit', sans-serif;
          font-size: 1.3rem;
          font-weight: 800;
          margin-bottom: 1rem;
        }

        .footer-brand p {
          color: #9CA3AF;
          font-size: 0.9rem;
          line-height: 1.5;
        }

        .footer-links-col h4 {
          color: #FFFFFF;
          font-size: 0.95rem;
          font-weight: 700;
          margin-bottom: 1.25rem;
        }

        .footer-links-col a {
          display: block;
          color: #9CA3AF;
          text-decoration: none;
          font-size: 0.9rem;
          margin-bottom: 0.75rem;
          transition: color 0.2s ease;
        }

        .footer-links-col a:hover {
          color: #FFFFFF;
        }

        .footer-status-pill {
          display: inline-block;
          font-size: 0.7rem;
          font-weight: 700;
          color: #10B981;
          background: rgba(16, 185, 129, 0.1);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          letter-spacing: 0.08em;
          margin-top: 0.5rem;
        }

        .footer-copyright {
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          margin-top: 3rem;
          padding-top: 1.5rem;
          font-size: 0.8rem;
          color: #6B7280;
        }

        /* Mobile adaptation */
        @media (max-width: 768px) {
          .landing-container {
            padding: 1.5rem;
            gap: 4rem;
          }
          .landing-nav {
            padding: 0.75rem 1rem;
          }
          .nav-links {
            display: none;
          }
          .hero-headline {
            font-size: 2.4rem;
          }
          .hero-split-layout {
            grid-template-columns: 1fr;
            padding: 1rem 0;
          }
          .sandbox-workspace-grid {
            grid-template-columns: 1fr;
          }
          .features-showcase-grid {
            grid-template-columns: 1fr;
          }
          .pricing-grid, .footer-grid {
            grid-template-columns: 1fr;
          }
          .waitlist-form {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  )
}

const faqs = [
  {
    q: "How does the synchronized accountability timer work?",
    a: "Unlike standard solo timers, our study corridors sync Pomodoro intervals globally for all active participants. When a session starts, everyone is committed. Leaving early breaks accountability metrics and impacts streak levels, building intense positive focus reinforcement."
  },
  {
    q: "What makes the AI Tutor context-aware?",
    a: "Our AI tutor utilizes advanced Gemini pipelines and has absolute contextual awareness over the study room chat logs. It can summarize past coding formulas shared by your peers, compile resources, and suggest tailored academic subdivisions."
  },
  {
    q: "Can I try the platform without an account?",
    a: "Yes! Click the 'Launch Interactive Demo' button. It boots up our advanced client-side sandbox mode which operates fully in-memory. You can simulate ticking pomodoros, test the premium upgrades, and chat with mock peers instantly."
  },
  {
    q: "Is there streak freeze protection?",
    a: "Absolutely. Standard users receive streak warnings, while Pro Elite scholars receive automated daily streak freeze cushions. If you miss a scheduled research slot due to academic crunch, your streak flame is fully preserved."
  }
]
