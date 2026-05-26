// client/src/components/LandingPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { AuthModal } from './AuthModal'

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

export function LandingPage() {
  const { enterDemoMode } = useStore()
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly')

  // ────────────────────────────────────────────────────────────────────────
  // Onboarding & Guided Tour State
  // ────────────────────────────────────────────────────────────────────────
  const [tourStep, setTourStep] = useState<number | null>(null) // starts null, triggers shortly after mount
  const [activityFeed, setActivityFeed] = useState<string[]>([
    "🔥 Jessica R. completed a 50-minute thermodynamics sprint",
    "👑 Marie Curie unlocked the 'Cognitive Legend' milestone badge",
    "👥 CS Theory Corridor reached peak capacity (8 active scholars)",
    "❄️ Aman S. activated streak freeze cushion protection",
    "🏆 Tesla gained +120 XP points climbing to Daily Rank 3"
  ])

  // ────────────────────────────────────────────────────────────────────────
  // Live Active Sandbox Simulator State
  // ────────────────────────────────────────────────────────────────────────
  const [simTimer, setSimTimer] = useState(1500) // 25:00 in secs
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

  // Dopamine Animations & Toasts State
  const [xpParticles, setXpParticles] = useState<XpParticle[]>([])
  const [showStreakIgnite, setShowStreakIgnite] = useState(false)
  const [showBadgeUnlock, setShowBadgeUnlock] = useState(false)
  const [unlockedBadgeName, setUnlockedBadgeName] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])

  const chatEndRef = useRef<HTMLDivElement>(null)
  const activityIntervalRef = useRef<any>(null)

  // ────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────
  const addToast = (title: string, message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = 'toast-' + Math.random().toString(36).substr(2, 9)
    setToasts((prev) => [...prev, { id, title, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }

  // Trigger floating XP particles
  const spawnXpParticles = (amount: number, clientX?: number, clientY?: number) => {
    const x = clientX || window.innerWidth / 2 + (Math.random() - 0.5) * 200
    const y = clientY || window.innerHeight / 2 + (Math.random() - 0.5) * 100
    const id = 'xp-' + Math.random().toString(36).substr(2, 9)
    setXpParticles((prev) => [...prev, { id, x, y, amount }])
    
    // Increment local XP state
    setUserXp((prev) => {
      const nextXp = prev + amount
      const threshold = 300
      if (nextXp >= threshold) {
        // Level up!
        setUserLevel((l) => l + 1)
        addToast('🏆 LEVEL UP!', `Congratulations, you reached level ${userLevel + 1}!`, 'success')
        
        // Unlock badge if level 4
        if (userLevel + 1 === 4) {
          setTimeout(() => {
            setUnlockedBadgeName('Cognitive Titan')
            setUnlockedBadges((b) => [...b, 'cognitive_titan'])
            setShowBadgeUnlock(true)
            addToast('🎖️ Milestone Unlocked', "You unlocked the 'Cognitive Titan' profile badge!", 'success')
          }, 1500)
        }
        return nextXp - threshold
      }
      return nextXp
    })

    setTimeout(() => {
      setXpParticles((prev) => prev.filter((p) => p.id !== id))
    }, 1500)
  }

  // ────────────────────────────────────────────────────────────────────────
  // Simulation Loops (Auto-run on landing)
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // 1. Ticking synchronized clock
    const timer = setInterval(() => {
      setSimTimer((prev) => (prev <= 0 ? 1500 : prev - 1))
    }, 1000)

    // 2. Guided Tour automatic prompt shortly after landing
    const tourTimer = setTimeout(() => {
      setTourStep(0)
    }, 1500)

    // 3. Dynamic scrolling recent activity feed (high activity illusion)
    const activities = [
      "🔥 Ken S. completed a 2-hour CS algorithms sprint",
      "👑 Jessica R. reached streak day 20! Milestone achieved!",
      "👥 MIT Physics Room gained 2 new scholars (Jessica & Grace)",
      "🏆 Marie Curie earned +80 XP solving quantum mechanics logs",
      "⚡ Tesla unlocked standard rate limiter controls",
      "❄️ Ada L. activated streak freeze buffer on Stanford Room",
      "🏆 Aman S. leveled up to Scholar Level 5! 🔥"
    ]
    activityIntervalRef.current = setInterval(() => {
      const randomActivity = activities[Math.floor(Math.random() * activities.length)]
      setActivityFeed((prev) => [randomActivity, ...prev.slice(0, 4)])
      
      // Periodically trigger a live visual toast to simulate network alerts
      if (Math.random() > 0.45) {
        const scholars = ['Jessica R.', 'Marie Curie', 'Ken S.', 'Ada L.', 'Tesla']
        const name = scholars[Math.floor(Math.random() * scholars.length)]
        addToast('✨ Dynamic Scholar Update', `${name} just achieved focus milestone!`, 'info')
      }
    }, 5500)

    // 4. Room synchronous chat posts
    const chatLoop = setInterval(() => {
      const scholars = ['Ken S.', 'Ada L.', 'Jessica R.']
      const name = scholars[Math.floor(Math.random() * scholars.length)]
      const messages = [
        "Just cracked the core algorithm! Feeling optimal. 💻",
        "Pomodoro countdown keeps me completely locked in.",
        "Remember to stretch and hydrate during focus breaks! 💧",
        "Ask the AI tutor sidebar to compile these chat histories!"
      ]
      const text = messages[Math.floor(Math.random() * messages.length)]
      
      setSimChats((prev) => [...prev, { id: Date.now(), user: name, msg: text }].slice(-4))
      setSimParticipants((prev) => prev.includes(name) ? prev : [...prev, name])
    }, 12000)

    return () => {
      clearInterval(timer)
      clearTimeout(tourTimer)
      clearInterval(activityIntervalRef.current)
      clearInterval(chatLoop)
    }
  }, [])

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [simChats, aiDialogue])

  // ────────────────────────────────────────────────────────────────────────
  // Core AI Companion Interaction Simulator (Zero Clicks Prompt Streaming)
  // ────────────────────────────────────────────────────────────────────────
  const triggerAiResponse = (promptKey: string, e?: React.MouseEvent) => {
    if (aiStreaming) return
    
    // Spawn floating dopamine XP particles immediately on interaction
    const clickX = e?.clientX
    const clickY = e?.clientY
    spawnXpParticles(20, clickX, clickY)

    let promptText = ""
    let fullResponse = ""
    let isPremiumLocked = false

    if (promptKey === 'formula') {
      promptText = "Break down quantum wave equation formulas."
      fullResponse = "The Schrödinger Wave Equation: iℏ(∂/∂t)Ψ = ĤΨ.\nWhere Ψ is the wave function, ℏ is reduced Planck's constant, and Ĥ is the Hamiltonian operator.\n\nIt describes how the spatial wavefunction of a quantum state evolves over time..."
    } else if (promptKey === 'summary') {
      promptText = "Compile room study summary & metrics."
      fullResponse = "Study Corridor Session Summary Compiled:\n- Total Active Scholars: 3\n- Focus Efficiency: 96.2%\n- Jessica R. studied Physics (45m)\n- Marie Curie researched Chemistry (62m)\n- FocusExplorer completed 1 Pomodoro sprint (+80 XP)\n\n"
      isPremiumLocked = true // TRIGGERS UPGRADE GATE!
    } else if (promptKey === 'limit') {
      promptText = "Provide secure Express middleware template."
      fullResponse = "Secure Request rate-limiter Express middleware template:\n\nconst rateLimit = require('express-rate-limit');\nconst secureLimiter = rateLimit({\n  windowMs: 15 * 60 * 1000,\n  max: 100,\n  message: 'Too many focus requests.'\n});\n\nApply this template using app.use('/api', secureLimiter) to mitigate brute-force and DDoS vectors."
    }

    setAiDialogue((prev) => [...prev, { sender: 'user', text: promptText }])
    setAiStreaming(true)

    let currentText = ""
    let index = 0

    // Set temporary AI blank card to stream into
    setAiDialogue((prev) => [...prev, { sender: 'ai', text: '' }])

    const interval = setInterval(() => {
      if (index < fullResponse.length) {
        currentText += fullResponse[index]
        index++
        setAiDialogue((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { sender: 'ai', text: currentText }
          return updated
        })
      } else {
        clearInterval(interval)
        setAiStreaming(false)
        
        // If this is a premium locked gate, append the lock UI!
        if (isPremiumLocked) {
          setAiDialogue((prev) => [
            ...prev,
            { 
              sender: 'ai', 
              text: "🔒 DEEP CONTEXT SUMMARY LOCKED.\nUpgrade to Cognitive Elite Pro to unlock full historical log compilation, visual charts, and direct CSV exporting options!",
              isPremiumLocked: true 
            }
          ])
          addToast('❄️ Premium Feature Locked', 'Upgrade to Pro Elite to compile full context summaries.', 'warning')
        } else {
          addToast('🏆 Interaction XP Boost!', 'You earned +20 XP prompting the Academic AI Tutor!', 'success')
        }
      }
    }, 15)
  }

  // Handle custom user questions typed in input
  const handleAiInputSend = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = aiInput.trim()
    if (!trimmed || aiStreaming) return

    setAiInput('')
    setAiDialogue((prev) => [...prev, { sender: 'user', text: trimmed }])
    setAiStreaming(true)

    // Trigger dopamine particles on text send
    spawnXpParticles(10)

    const responseTemplate = `Analyzing query: "${trimmed}"...\n\nI have cross-referenced the global scholar database. To provide the fully compiled academic sub-task breakdown and Schrödinger analysis, please secure Pro Elite tier.\n\n🔒 UPGRADE REQUIRED FOR DYNAMIC FORMULA SOLVING.`
    
    let currentText = ""
    let index = 0
    setAiDialogue((prev) => [...prev, { sender: 'ai', text: '' }])

    const interval = setInterval(() => {
      if (index < responseTemplate.length) {
        currentText += responseTemplate[index]
        index++
        setAiDialogue((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { sender: 'ai', text: currentText }
          return updated
        })
      } else {
        clearInterval(interval)
        setAiStreaming(false)
        setAiDialogue((prev) => [
          ...prev,
          {
            sender: 'ai',
            text: "🔒 DEEP COMPUTING RESOLUTION LOCKED.\nTo unlock Gemini formulas resolution, complete billing upgrade now.",
            isPremiumLocked: true
          }
        ])
        addToast('🔒 Cognitive Gateway Locked', 'Formulas resolution requires Cognitive Pro.', 'warning')
      }
    }, 15)
  }

  // ────────────────────────────────────────────────────────────────────────
  // Simulated Interactive Focus Boost & Streak Ignition (Dopamine Trigger)
  // ────────────────────────────────────────────────────────────────────────
  const triggerStreakIgnition = (e: React.MouseEvent) => {
    if (showStreakIgnite) return
    
    // Golden flying particles on button click
    const clickX = e.clientX
    const clickY = e.clientY
    spawnXpParticles(80, clickX, clickY)

    setShowStreakIgnite(true)
    setUserStreak((prev) => prev + 1)
    addToast('🔥 STREAK COMBUSTION ACTIVE!', `Your focus streak reached Day ${userStreak + 1}!`, 'success')

    setTimeout(() => {
      setShowStreakIgnite(false)
    }, 3200)
  }

  // ────────────────────────────────────────────────────────────────────────
  // Simulated Upgrades (Fluid UI Unlock)
  // ────────────────────────────────────────────────────────────────────────
  const completeMockUpgrade = () => {
    addToast('Processing Payment Simulation...', 'Contacting secure Stripe billing portal.', 'info')
    
    setTimeout(() => {
      addToast('Upgrade completed successfully! Welcome to Pro Elite!', 'Welcome to the premium elite.', 'success')
      
      // Update local storage/mock state
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
      })
      
      setIsAuthOpen(false)
      enterDemoMode() // instantly navigate to real dashboard with unlocked PRO companion sidebars!
    }, 1200)
  }

  return (
    <div className="landing-container theme-dark">
      
      {/* ─── Premium Header Navbar ────────────────────────────────────────────── */}
      <nav className="landing-nav glass-panel">
        <div className="landing-logo gradient-text">✨ antigravity focus</div>
        <div className="nav-links">
          <a href="#matrix" className="nav-link">Capabilities</a>
          <a href="#pricing" className="nav-link">Pricing</a>
          <a href="#faq" className="nav-link">FAQ</a>
        </div>
        <div className="nav-actions">
          <button onClick={() => setTourStep(0)} className="btn btn-secondary btn-sm tour-trigger-btn">
            🧭 Start Tour
          </button>
          <button onClick={enterDemoMode} className="btn btn-primary btn-sm btn-sandbox-nav">
            ⚡ Enter Workspace
          </button>
        </div>
      </nav>

      {/* ─── Cinematic Split Hero + Interactive Sandbox ───────────────────────── */}
      <header className="hero-split-layout">
        <div className="hero-radial-glow"></div>
        <div className="hero-grid-pattern"></div>

        {/* Column 1: Marketing Copy + Recent Activity Ticker */}
        <div className="hero-marketing-col anim-fade-in">
          <div className="hero-tagline glass-panel">
            🚀 HYPER-ACTIVE FOCUS ACCOUNTABILITY SANDBOX
          </div>
          <h1 className="hero-headline font-outfit">
            Defy Distraction.<br />
            <span className="gradient-text">Master Deep Work.</span>
          </h1>
          <p className="hero-subtext">
            Auto-authenticated sandbox is active! Interact with the live study corridor on the right: click chips, type questions to the AI, or boost your XP level instantly.
          </p>

          <div className="hero-btn-row">
            <button onClick={enterDemoMode} className="btn btn-primary btn-lg btn-pulse full-sandbox-btn">
              ⚡ Launch Full Platform Sandbox
            </button>
            <button onClick={() => setIsAuthOpen(true)} className="btn btn-secondary btn-lg signup-gate-btn">
              Sign In / Create Account
            </button>
          </div>

          {/* Scrolling Activity Ticker (Creates massive high-activity illusion) */}
          <div className="activity-ticker glass-panel">
            <div className="ticker-header-row">
              <span className="ticker-indicator"></span>
              <h4>GLOBAL SCHOLARS EVENT TICKER (LIVE)</h4>
            </div>
            <div className="ticker-scroll-area">
              {activityFeed.map((act, idx) => (
                <div key={idx} className="ticker-row anim-slide-in">
                  {act}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Column 2: Live Active Workspace Sandbox (Auto-Started Corridor) */}
        <div className="hero-sandbox-col glass-panel anim-scale-up" id="sandbox-element">
          
          {/* Spotlight Guided Tour Spotlights */}
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
            
            {/* Left Box: Active Pomodoro Clock & Gamification Stats */}
            <div className="sandbox-left-panel">
              
              {/* Synchronized ticking timer */}
              <div className="sandbox-timer glass-panel text-center">
                <h4>⏱️ Synchronized Timer</h4>
                <div className="sandbox-timer-display gradient-text">{formatSimTime(simTimer)}</div>
                <div className="timer-status-badge">🟢 LIVE FOCUS SPRINT</div>
              </div>

              {/* Gamification Dopamine Center */}
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

                {/* Golden booster buttons */}
                <button onClick={triggerStreakIgnition} className="btn btn-primary btn-sm btn-block btn-pulse btn-streak-combust mt-2">
                  🔥 Boost Streaks & Earn +80 XP
                </button>
              </div>

              {/* Online scholarpresence list */}
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

            {/* Right Box: Chat logs + Context AI Companion Split Drawer */}
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

              {/* Academic AI companion integrated sidebar drawer */}
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
                        
                        {/* Premium lock gate inside the conversation */}
                        {dialog.isPremiumLocked ? (
                          <div className="premium-lock-gate glass-panel anim-scale-up">
                            <div className="lock-icon">🔒</div>
                            <h5>Locked Premium Academic Analysis</h5>
                            <p>Unlock Schrödinger solutions, infinite summarize compilations, and CSV exports by updating to Cognitive Pro Elite.</p>
                            <button onClick={() => setIsAuthOpen(true)} className="btn btn-primary btn-sm btn-pulse">
                              ⚡ Unlock Full Explanation ($9.99/mo)
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

                {/* Zero Clicks Prompt chips */}
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
                  <button 
                    disabled={aiStreaming}
                    onClick={(e) => triggerAiResponse('limit', e)} 
                    className="chip-btn glass-panel"
                  >
                    💻 Express Rate-Limiter Middleware
                  </button>
                </div>

                {/* Chat send row */}
                <form onSubmit={handleAiInputSend} className="ai-input-form-row">
                  <input
                    type="text"
                    placeholder="Ask formulas, mathematical concepts, summaries..."
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    disabled={aiStreaming}
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={aiStreaming || !aiInput.trim()}>
                    Send
                  </button>
                </form>

              </div>

            </div>

          </div>

        </div>

      </header>

      {/* ─── Capabilities Feature Matrix ──────────────────────────────────────── */}
      <section id="matrix" className="matrix-section text-center">
        <h2 className="section-title">Cognitive Accountability Feature Matrix</h2>
        <p className="section-subtitle">A detailed engineering comparison comparing the productivity scholar tiers.</p>
        
        <div className="comparison-table-container glass-panel">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Capabilities</th>
                <th>Standard Free Tier</th>
                <th>Cognitive Elite Pro Tier</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Synchronized Accountability Timers</strong></td>
                <td>Up to 10 rooms</td>
                <td>Unlimited Private & Public Corridors</td>
              </tr>
              <tr>
                <td><strong>Academic AI Companion Tutor</strong></td>
                <td>Rate-limited (No formulas breakdowns)</td>
                <td>Unlimited (Powered by Gemini)</td>
              </tr>
              <tr>
                <td><strong>Room Chat History Summarization</strong></td>
                <td>Locked</td>
                <td>Unlimited (One-click compilation)</td>
              </tr>
              <tr>
                <td><strong>Daily Streak Freeze Cushions</strong></td>
                <td>0 cushions</td>
                <td>3 recurent cushions / Month</td>
              </tr>
              <tr>
                <td><strong>Global Hall of Scholars Rank Priorities</strong></td>
                <td>Standard</td>
                <td>Elite custom tag & XP multipliers</td>
              </tr>
              <tr>
                <td><strong>Streak Milestones Badges</strong></td>
                <td>Basic Badge set</td>
                <td>Full premium achievements unlocked</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── Premium Pricing Cards ────────────────────────────────────────────── */}
      <section id="pricing" className="pricing-section text-center">
        <h2 className="section-title">Upgrade Your Focus Index</h2>
        <p className="section-subtitle">Unlock infinite summary compilations and academic formula breaking.</p>

        <div className="pricing-grid">
          {/* Card 1: Free */}
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
              <li>❌ Infinite chat log context compilation</li>
            </ul>
            <button onClick={enterDemoMode} className="btn btn-secondary btn-block mt-4">
              Get Started Free
            </button>
          </div>

          {/* Card 2: Pro */}
          <div className="pricing-card glass-panel pro-pricing-card">
            <div className="price-ribbon">POPULAR CHOICE</div>
            <h3>Cognitive Elite Pro</h3>
            <div className="price-tag">$9.99<span className="price-sub">/mo</span></div>
            <p className="price-desc">For serious scholars, computer scientists, and mathematicians.</p>
            <ul className="pricing-features">
              <li>✦ Unlimited Study Corridor creation</li>
              <li>✦ **Academic AI Companion Tutor** sidebar</li>
              <li>✦ **Room Context summaries compilation**</li>
              <li>✦ Live **Streak Freeze cushions** protection</li>
              <li>✦ Professional exclusive profile badges</li>
              <li>✦ Priority leaderboards and focus statistics</li>
            </ul>
            <button onClick={() => setIsAuthOpen(true)} className="btn btn-primary btn-block btn-pulse mt-4">
              Upgrade to Cognitive Pro
            </button>
          </div>
        </div>
      </section>

      {/* ─── Expandable FAQ ───────────────────────────────────────────────────── */}
      <section id="faq" className="faq-section text-center">
        <h2 className="section-title">Frequently Asked Questions</h2>
        <div className="faq-grid mt-4">
          {faqs.map((faq, idx) => (
            <div key={idx} className="faq-item glass-panel">
              <div 
                className="faq-header"
                onClick={() => setFaqOpen((prev) => ({ ...prev, [idx]: !prev[idx] }))}
              >
                <h3>{faq.q}</h3>
                <span className="faq-toggle-icon">{faqOpen[idx] ? '−' : '+'}</span>
              </div>
              <div className={`faq-body ${faqOpen[idx] ? 'open' : ''}`}>
                <p>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Semantic Footer ──────────────────────────────────────────────────── */}
      <footer className="landing-footer glass-panel">
        <div className="footer-grid">
          <div className="footer-brand">
            <h3>✨ antigravity focus</h3>
            <p>Rearchitecting academic focus accountability through real-time sync systems and AI.</p>
          </div>
          <div className="footer-links-col">
            <h4>Capabilities</h4>
            <a href="#sandbox-element">Sync Corridors</a>
            <a href="#sandbox-element">AI Companion Tutor</a>
            <a href="#sandbox-element">XP Streaks Booster</a>
          </div>
          <div className="footer-links-col">
            <h4>SaaS Structure</h4>
            <a href="#pricing">Pricing Plans</a>
            <a href="#matrix">Capabilities Comparison</a>
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

      {/* ─── Global AuthModal / Billing Mock Dialog Overlay ────────────────────── */}
      {isAuthOpen && (
        <div className="modal-overlay" onClick={() => setIsAuthOpen(false)}>
          <div className="auth-wrapper anim-scale-up" onClick={(e) => e.stopPropagation()}>
            <div className="auth-card glass-panel text-center">
              <button className="modal-close" onClick={() => setIsAuthOpen(false)}>&times;</button>
              
              <div className="upgrade-header">
                <div className="upgrade-badge">PREMIUM COGNITIVE UPGRADE</div>
                <h2 className="gradient-text">Unlock SaaS Pro Study Assistant</h2>
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
                    <li>✨ Priority leaderboards & mentions alerts</li>
                  </ul>
                  <button onClick={completeMockUpgrade} className="btn btn-primary btn-block btn-pulse mt-4">
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

      {/* ─── Badge Unlock Dopamine Banner ────────────────────────────────────── */}
      {showBadgeUnlock && (
        <div className="streak-ignite-overlay" onClick={() => setShowBadgeUnlock(false)}>
          <div className="streak-ignite-banner glass-panel anim-scale-up badge-unlock-banner">
            <span className="ignite-flame">🎖️</span>
            <h2>NEW BADGE UNLOCKED!</h2>
            <h3>"{unlockedBadgeName}"</h3>
            <p>Congratulations! Your academic productivity rank leveled up.</p>
            <button onClick={() => setShowBadgeUnlock(false)} className="btn btn-primary btn-sm mt-3">Claim Badge</button>
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

      {/* ─── Advanced Conversion CSS Polish ───────────────────────────────────── */}
      <style>{`
        .landing-container {
          background: var(--bg-primary);
          color: var(--text-primary);
          min-height: 100vh;
          overflow-x: hidden;
          padding: 2rem 4rem;
          display: flex;
          flex-direction: column;
          gap: 6rem;
        }

        .landing-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          border-radius: var(--radius-lg);
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
          color: var(--text-secondary);
          text-decoration: none;
          font-weight: 600;
          font-size: 0.95rem;
          transition: var(--transition-smooth);
        }

        .nav-link:hover {
          color: var(--text-primary);
          text-shadow: 0 0 10px var(--glow-color);
        }

        .nav-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .btn-sandbox-nav {
          border-color: var(--accent-purple);
          color: var(--accent-purple);
        }

        .btn-sandbox-nav:hover {
          background: rgba(167, 139, 250, 0.1);
        }

        /* Hero Split Screen Layout */
        .hero-split-layout {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 3rem;
          align-items: center;
          border-radius: var(--radius-lg);
          overflow: hidden;
          padding: 3rem 0;
        }

        .hero-radial-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(124, 58, 237, 0.1) 0%, rgba(2, 6, 23, 0) 70%);
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
        }

        .hero-headline {
          font-size: 3.6rem;
          font-weight: 800;
          line-height: 1.1;
          color: var(--text-primary);
        }

        .hero-subtext {
          font-size: 1.1rem;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .hero-btn-row {
          display: flex;
          gap: 1rem;
        }

        /* Activity ticker (High platform activity illusion) */
        .activity-ticker {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 160px;
        }

        .ticker-header-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .ticker-indicator {
          width: 8px;
          height: 8px;
          background: var(--accent-green);
          border-radius: 50%;
          animation: blink 1.2s infinite;
        }

        @keyframes blink {
          50% { opacity: 0.3; }
        }

        .ticker-header-row h4 {
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }

        .ticker-scroll-area {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          overflow: hidden;
        }

        .ticker-row {
          font-size: 0.8rem;
          color: var(--text-secondary);
          border-bottom: 1px dashed var(--border-glass);
          padding-bottom: 0.25rem;
        }

        /* Interactive Split Sandbox */
        .hero-sandbox-col {
          position: relative;
          z-index: 1;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          min-height: 520px;
          background: rgba(15, 23, 42, 0.75);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
        }

        .sandbox-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1.25rem;
          border-radius: var(--radius-md);
        }

        .sandbox-header h3 {
          font-size: 0.95rem;
        }

        .sandbox-header p {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.15rem;
        }

        .sandbox-workspace-grid {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 1rem;
          flex: 1;
        }

        .sandbox-left-panel {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .sandbox-timer {
          padding: 1rem;
        }

        .sandbox-timer-display {
          font-family: 'Outfit', sans-serif;
          font-size: 2.2rem;
          font-weight: 800;
          margin: 0.25rem 0;
        }

        .timer-status-badge {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-green);
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          display: inline-block;
        }

        .sandbox-gamify-stats {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .sandbox-gamify-stats h4, .sandbox-timer h4, .sandbox-presence-list h4, .sandbox-chat-area h4 {
          font-size: 0.7rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .mini-stats-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }

        .mini-stat-card {
          padding: 0.4rem;
          text-align: center;
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
        }

        .sandbox-xp-progress-bar {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .xp-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.7rem;
          font-weight: 700;
        }

        .xp-track {
          height: 6px;
          background: var(--bg-secondary);
          border-radius: 1rem;
          overflow: hidden;
        }

        .xp-fill-bar {
          height: 100%;
          background: var(--gradient-neon);
          transition: width 0.4s ease-out;
        }

        .btn-streak-combust {
          font-size: 0.75rem;
          padding: 0.5rem 0.75rem;
        }

        .sandbox-presence-list {
          padding: 1rem;
          flex: 1;
        }

        .presence-rows {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          margin-top: 0.5rem;
          max-height: 100px;
          overflow-y: auto;
        }

        .presence-row {
          padding: 0.35rem 0.65rem;
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .presence-dot {
          font-size: 0.6rem;
        }

        .sandbox-right-panel {
          display: grid;
          grid-template-rows: 1.2fr 2fr;
          gap: 1rem;
          padding: 1rem;
          background: rgba(15, 23, 42, 0.4);
        }

        .sandbox-chat-area {
          display: flex;
          flex-direction: column;
          height: 120px;
        }

        .chat-log-box {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          margin-top: 0.5rem;
        }

        .chat-log-row {
          font-size: 0.75rem;
          padding-bottom: 0.2rem;
          border-bottom: 1px solid var(--border-glass);
        }

        .chat-user {
          color: var(--accent-purple);
          margin-right: 0.5rem;
        }

        .chat-msg {
          color: var(--text-secondary);
        }

        /* Integrated AI Sidebar */
        .sandbox-ai-area {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.6);
        }

        .ai-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .ai-header-row h4 {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .ai-badge {
          background: rgba(167, 139, 250, 0.15);
          color: var(--accent-purple);
          font-size: 0.6rem;
          font-weight: 800;
          padding: 0.15rem 0.5rem;
          border-radius: 1rem;
          border: 1px solid var(--accent-purple);
        }

        .ai-dialogue-box {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
          padding-right: 0.25rem;
        }

        .ai-dialogue-row {
          display: flex;
          gap: 0.5rem;
          padding: 0.5rem;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          align-items: flex-start;
        }

        .ai-sender-row {
          background: rgba(167, 139, 250, 0.04);
          border-left: 2px solid var(--accent-purple);
        }

        .user-sender-row {
          background: rgba(59, 130, 246, 0.04);
          border-left: 2px solid var(--accent-blue);
        }

        .dialogue-icon {
          font-size: 1rem;
        }

        .dialogue-content {
          flex: 1;
        }

        .dialogue-text-body {
          white-space: pre-line;
          color: var(--text-primary);
          line-height: 1.4;
        }

        /* Conversion Upgrade Gate inside Dialogue */
        .premium-lock-gate {
          padding: 0.75rem;
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(167, 139, 250, 0.25);
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
        }

        .premium-lock-gate h5 {
          font-family: 'Outfit', sans-serif;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .premium-lock-gate p {
          font-size: 0.7rem;
          color: var(--text-secondary);
          line-height: 1.3;
        }

        .ai-prompt-chips {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding-top: 0.5rem;
          border-top: 1px solid var(--border-glass);
          margin-bottom: 0.5rem;
        }

        .chips-label {
          font-size: 0.65rem;
          color: var(--text-muted);
          font-weight: 700;
        }

        .ai-prompt-chips .chip-btn {
          text-align: left;
          padding: 0.3rem 0.6rem;
          font-size: 0.7rem;
        }

        .ai-input-form-row {
          display: flex;
          gap: 0.35rem;
        }

        .ai-input-form-row input {
          flex: 1;
          padding: 0.4rem 0.65rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-glass);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 0.75rem;
          outline: none;
        }

        .ai-input-form-row input:focus {
          border-color: var(--accent-purple);
        }

        /* Guided tour spotlights style */
        .tour-spotlight-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(2, 6, 23, 0.4);
          z-index: 500;
          border-radius: var(--radius-lg);
          pointer-events: none;
        }

        .tour-tooltip {
          position: absolute;
          width: 250px;
          padding: 1rem;
          background: var(--bg-primary);
          border: 1px solid var(--accent-purple);
          box-shadow: 0 10px 30px rgba(167, 139, 250, 0.3);
          border-radius: var(--radius-md);
          z-index: 600;
          pointer-events: auto;
          animation: slideInToast 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .tour-tooltip.step-0 {
          top: 20px;
          left: 20px;
        }

        .tour-tooltip.step-1 {
          bottom: 20px;
          right: 20px;
        }

        .tour-tooltip.step-2 {
          top: 150px;
          left: 20px;
        }

        .tour-tooltip.step-3 {
          top: 20px;
          right: 20px;
        }

        .tooltip-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
          font-weight: 700;
          font-size: 0.75rem;
          color: var(--accent-purple);
        }

        .tooltip-close {
          background: transparent;
          border: none;
          font-size: 1.1rem;
          color: var(--text-secondary);
          cursor: pointer;
        }

        .tour-tooltip p {
          font-size: 0.75rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        /* Testimonials, Pricing & Comparison */
        .section-title {
          font-family: 'Outfit', sans-serif;
          font-size: 2.2rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
        }

        .section-subtitle {
          font-size: 1rem;
          color: var(--text-secondary);
          margin-bottom: 3rem;
        }

        .pricing-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2.5rem;
          max-width: 800px;
          margin: 0 auto;
        }

        .pricing-card {
          padding: 2.5rem 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          position: relative;
        }

        .pro-pricing-card {
          border: 1.5px solid var(--accent-purple);
          box-shadow: 0 0 30px rgba(167, 139, 250, 0.2);
        }

        .price-ribbon {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: var(--gradient-neon);
          color: white;
          font-size: 0.6rem;
          font-weight: 800;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }

        .price-tag {
          font-family: 'Outfit', sans-serif;
          font-size: 2.6rem;
          font-weight: 800;
        }

        .price-sub {
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .price-desc {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .pricing-features {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          font-size: 0.8rem;
          text-align: left;
          color: var(--text-secondary);
        }

        /* Comparison table styles */
        .comparison-table-container {
          max-width: 800px;
          margin: 0 auto;
          overflow-x: auto;
        }

        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .comparison-table th, .comparison-table td {
          padding: 0.85rem 1.25rem;
          font-size: 0.85rem;
          border-bottom: 1px solid var(--border-glass);
        }

        .comparison-table th {
          font-family: 'Outfit', sans-serif;
          font-weight: 700;
          color: var(--text-primary);
        }

        .comparison-table tr:hover {
          background: rgba(255, 255, 255, 0.01);
        }

        /* FAQ accordion styles */
        .faq-grid {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 700px;
          margin: 0 auto;
        }

        .faq-item {
          padding: 1.25rem 2rem;
          text-align: left;
          overflow: hidden;
        }

        .faq-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }

        .faq-header h3 {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .faq-toggle-icon {
          font-size: 1.3rem;
          color: var(--accent-purple);
          font-weight: 700;
        }

        .faq-body {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease-out;
        }

        .faq-body.open {
          max-height: 120px;
          margin-top: 0.75rem;
        }

        .faq-body p {
          font-size: 0.8rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        /* Footer */
        .landing-footer {
          padding: 3rem;
          border-radius: var(--radius-lg);
        }

        .footer-grid {
          display: grid;
          grid-template-columns: 1.6fr 1fr 1fr 1.2fr;
          gap: 2.5rem;
          text-align: left;
        }

        .footer-brand h3 {
          font-family: 'Outfit', sans-serif;
          font-size: 1.2rem;
          margin-bottom: 0.5rem;
        }

        .footer-brand p {
          font-size: 0.8rem;
          color: var(--text-secondary);
          line-height: 1.5;
          max-width: 250px;
        }

        .footer-links-col {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .footer-links-col h4 {
          font-family: 'Outfit', sans-serif;
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }

        .footer-links-col a {
          font-size: 0.8rem;
          color: var(--text-secondary);
          text-decoration: none;
          transition: var(--transition-smooth);
        }

        .footer-links-col a:hover {
          color: var(--accent-purple);
        }

        .footer-status-pill {
          background: rgba(16, 185, 129, 0.15);
          color: var(--accent-green);
          font-size: 0.65rem;
          font-weight: 800;
          padding: 0.2rem 0.5rem;
          border-radius: 1rem;
          display: inline-block;
          margin-top: 0.5rem;
          border: 1px solid var(--accent-green);
          align-self: flex-start;
        }

        .footer-copyright {
          margin-top: 3rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border-glass);
          color: var(--text-muted);
          font-size: 0.7rem;
        }

        /* Golden flying XP particles styling */
        .floating-xp-particle {
          position: fixed;
          font-family: 'Outfit', sans-serif;
          font-weight: 800;
          font-size: 0.95rem;
          color: var(--accent-amber);
          text-shadow: 0 0 10px rgba(245, 158, 11, 0.8);
          z-index: 10000;
          pointer-events: none;
          animation: floatXpUp 1.4s ease-out forwards;
        }

        @keyframes floatXpUp {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-80px) scale(1.4);
          }
        }

        /* Streak combustion igniter animation styles */
        .streak-ignite-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(2, 6, 23, 0.65);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 99999;
          animation: fadeIn 0.3s ease-out;
        }

        .streak-ignite-banner {
          padding: 3rem;
          text-align: center;
          box-shadow: 0 0 50px rgba(167, 139, 250, 0.4);
          position: relative;
          background: var(--bg-glass);
          border: 1.5px solid var(--accent-purple);
        }

        .ignite-flame {
          font-size: 4rem;
          display: inline-block;
          animation: danceFlame 0.5s infinite alternate;
        }

        .badge-unlock-banner {
          border-color: var(--accent-amber) !important;
          box-shadow: 0 0 50px rgba(245, 158, 11, 0.4) !important;
        }

        .badge-unlock-banner .ignite-flame {
          animation: spinBadge 1.5s ease-out infinite;
        }

        @keyframes spinBadge {
          0% { transform: rotateY(0); }
          100% { transform: rotateY(360deg); }
        }

        @keyframes danceFlame {
          to { transform: scale(1.15) translateY(-5px); }
        }

        /* Floating Toasts container */
        .demo-toasts-container {
          position: fixed;
          bottom: 2rem;
          right: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          z-index: 9999;
          max-width: 300px;
          pointer-events: none;
        }

        .toast-card {
          position: relative;
          padding: 1rem;
          border-radius: var(--radius-md);
          pointer-events: auto;
          overflow: hidden;
          background: var(--bg-glass);
          border: 1px solid var(--border-glass);
          box-shadow: 0 10px 30px var(--shadow-glass);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .toast-glow {
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          background: var(--gradient-neon);
        }

        .toast-success .toast-glow { background: var(--accent-green); }
        .toast-warning .toast-glow { background: var(--accent-amber); }
        .toast-info .toast-glow { background: var(--accent-blue); }

        .toast-header-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }

        .toast-icon { font-size: 1rem; }
        .toast-title {
          font-family: 'Outfit', sans-serif;
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .toast-message {
          font-size: 0.75rem;
          color: var(--text-secondary);
          line-height: 1.3;
        }

        .anim-slide-in {
          animation: slideInToast 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes slideInToast {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
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
          .pricing-grid, .footer-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}

// Static mock FAQs array
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
