// client/src/components/AiAssistant.tsx
// High-fidelity twin-mode Academic AI Tutor sidebar component

import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { apiService } from '../api/apiService'
import { LockedState } from './MonetizationShared'

type DialogueItem = {
  sender: 'user' | 'ai'
  text: string
  timestamp: Date
  isStreaming?: boolean
}

export function AiAssistant() {
  // Select atomic Zustand states to prevent full sidebar redraws on external state triggers
  const user = useStore((state) => state.user)
  const activeRoomId = useStore((state) => state.activeRoomId)
  
  const [messages, setMessages] = useState<DialogueItem[]>([
    {
      sender: 'ai',
      text: "Hello! I am your SaaS Academic Tutor companion. I can answer academic questions or summarize this study room's chat logs for quick context. How can I help you study today? 📚",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [notesContext, setNotesContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [queryMode, setQueryMode] = useState<'general' | 'room'>('general')
  const [quotaCount, setQuotaCount] = useState(0) // local quota simulation for visual indicators
  const dialogEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  if (!user) return null

  // Safety-check for Free tier locks
  if (user.tier === 'free') {
    return <LockedState featureName="Academic AI Study Companion" />
  }

  // High-fidelity client-side word-by-word token streaming animator
  const animateTextStreaming = (fullText: string, delayMs = 35) => {
    const words = fullText.split(' ')
    let currentText = ''
    let wordIndex = 0

    // Initialize an empty streaming dialogue node
    setMessages((prev) => [
      ...prev,
      { sender: 'ai', text: '', timestamp: new Date(), isStreaming: true },
    ])

    const interval = setInterval(() => {
      if (wordIndex < words.length) {
        currentText += (wordIndex === 0 ? '' : ' ') + words[wordIndex]
        setMessages((prev) => {
          const list = [...prev]
          const last = list[list.length - 1]
          if (last && last.sender === 'ai' && last.isStreaming) {
            last.text = currentText
          }
          return list
        })
        wordIndex++
      } else {
        clearInterval(interval)
        // Mark streaming finished
        setMessages((prev) => {
          const list = [...prev]
          const last = list[list.length - 1]
          if (last) {
            last.isStreaming = false
          }
          return list
        })
      }
    }, delayMs)
  }

  const handleSend = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault()
    const targetPrompt = customPrompt || input
    const trimmed = targetPrompt.trim()
    if (!trimmed || loading) return

    setInput('')
    setMessages((prev) => [...prev, { sender: 'user', text: trimmed, timestamp: new Date() }])
    setLoading(true)

    // Build compound prompt with attached paste notes scanner context
    let finalPrompt = trimmed
    if (notesContext.trim()) {
      finalPrompt = `[STUDY NOTES SCANNER CONTEXT: ${notesContext.trim()}]\n\nUser Question: ${trimmed}`
    }

    try {
      let data
      if (queryMode === 'room' && activeRoomId) {
        data = await apiService.ai.roomAssistant(activeRoomId, finalPrompt)
        import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
          postHogAnalytics.track('ai_room_prompt', { roomId: activeRoomId, promptLength: trimmed.length });
        });
      } else {
        data = await apiService.ai.chat(finalPrompt)
        import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
          postHogAnalytics.track('ai_chat_prompt', { promptLength: trimmed.length });
        });
      }

      // Record visual quota request
      setQuotaCount((prev) => (prev >= 5 ? 1 : prev + 1))
      
      // Trigger streaming token animations
      animateTextStreaming(data.response || 'Completion finished, but no response was generated.')
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `Error connecting to AI helper: ${err.message || 'connection timed out.'}`,
          timestamp: new Date(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleSummarize = async () => {
    if (!activeRoomId || loading) return
    setLoading(true)
    setMessages((prev) => [
      ...prev,
      { sender: 'user', text: '💡 Generate study room logs summary...', timestamp: new Date() },
    ])

    try {
      const data = await apiService.ai.summarize(activeRoomId)
      setQuotaCount((prev) => (prev >= 5 ? 1 : prev + 1))
      import('../analytics/postHogAnalytics').then(({ postHogAnalytics }) => {
        postHogAnalytics.track('ai_room_summarize', { roomId: activeRoomId });
      });
      animateTextStreaming(data.response || 'No summary compiled.')
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `Failed to compile context summary: ${err.message || 'check room chat history logs.'}`,
          timestamp: new Date(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  // Coaching shortcut templates click handler
  const handleCoachingClick = (prompt: string) => {
    setInput(prompt)
  }

  return (
    <div className="ai-sidebar glass-panel anim-scale-up">
      <div className="ai-header">
        <div className="ai-title-row">
          <h3 className="gradient-text">⚡ Academic AI Tutor</h3>
          <span className="premium-label pro-label">POWERED BY GEMINI</span>
        </div>
        <p className="text-secondary">Context-aware tutor powered by deep semantic memory.</p>
      </div>

      <div className="ai-mode-row mt-2">
        <button
          className={`mode-btn ${queryMode === 'general' ? 'active' : ''}`}
          onClick={() => setQueryMode('general')}
        >
          General Tutor
        </button>
        <button
          className={`mode-btn ${queryMode === 'room' ? 'active' : ''}`}
          onClick={() => setQueryMode('room')}
          disabled={!activeRoomId}
          title={!activeRoomId ? 'Join a study room to unlock room assistant' : ''}
        >
          Room Context Coach
        </button>
      </div>

      {/* Main Dialogue Scroll Area */}
      <div className="ai-dialogue-area mt-3">
        {messages.map((m, idx) => (
          <div key={idx} className={`dialogue-card ${m.sender === 'ai' ? 'ai-sender' : 'user-sender'}`}>
            <div className="dialogue-icon">
              {m.sender === 'ai' ? '🤖' : '👨‍🎓'}
            </div>
            <div className="dialogue-body">
              <div className="dialogue-text">{m.text}</div>
              <div className="dialogue-time">
                {m.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="dialogue-card ai-sender loading-card">
            <div className="dialogue-icon">🤖</div>
            <div className="dialogue-body">
              <div className="streaming-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div className="dialogue-text italic text-muted">Agent is compiling semantic context logs...</div>
            </div>
          </div>
        )}
        <div ref={dialogEndRef} />
      </div>

      {/* Copy-Paste Notes / PDF Scanner Drawer */}
      <div className="notes-scanner-box mt-2">
        <span className="text-secondary font-bold" style={{ fontSize: '0.75rem' }}>📄 Note & Context Analyzer</span>
        <textarea
          className="notes-scanner-textarea"
          placeholder="Paste lecture outlines, PDF text, or homework topics here. The AI will refer to these notes during tutoring..."
          value={notesContext}
          onChange={(e) => setNotesContext(e.target.value)}
        />
      </div>

      {/* Personalized Coaching Prompt Cards Grid */}
      <div className="ai-coaching-cards">
        <button className="coaching-card-btn" onClick={() => handleCoachingClick('Explain this math concept: ')}>
          <span>🎓</span>
          <span>Explain Topic</span>
        </button>
        <button className="coaching-card-btn" onClick={() => handleCoachingClick('Critique my study progress: ')}>
          <span>🚀</span>
          <span>Critique Study</span>
        </button>
        <button className="coaching-card-btn" onClick={() => handleCoachingClick('Give me an encouraging checklist to focus: ')}>
          <span>🔥</span>
          <span>Focus Boost</span>
        </button>
        <button className="coaching-card-btn" onClick={() => handleCoachingClick('Review this code and outline complexities: ')}>
          <span>💻</span>
          <span>Review Code</span>
        </button>
      </div>

      {/* Action Footer Inputs */}
      <div className="ai-control-footer">
        {activeRoomId && (
          <button
            onClick={handleSummarize}
            className="btn btn-secondary btn-sm btn-block btn-summarize"
            disabled={loading}
          >
            📋 Summarize Room Conversations
          </button>
        )}

        <form onSubmit={handleSend} className="ai-input-row">
          <input
            type="text"
            placeholder={
              queryMode === 'room'
                ? 'Ask about active study topics here...'
                : 'Ask academic formulas, coding logic, summaries...'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
            Prompt
          </button>
        </form>

        {/* Visual Minute Rate Quota Monitor */}
        <div className="ai-quota-meter">
          <span>⚡ Requests Quota Limit:</span>
          <span className="gradient-text font-bold">{quotaCount} / 5 per min used</span>
        </div>
      </div>
    </div>
  )
}

export default AiAssistant
