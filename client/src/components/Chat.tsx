import { useEffect, useRef, useState } from 'react'
import { socketClient, ChatMessage } from '../realtime/socket/socketClient'
import '../styles/chat.css'

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Subscribe to incoming chat messages
  useEffect(() => {
    const unsubscribe = socketClient.onChatMessage((message) => {
      setMessages((prev) => [...prev, message])
    })

    return () => unsubscribe()
  }, [])

  const handleSendMessage = () => {
    const trimmedMessage = input.trim()
    if (!trimmedMessage) return

    setIsSending(true)
    socketClient.sendChatMessage(trimmedMessage, (response) => {
      setIsSending(false)
      if (response?.success) {
        setInput('')
      } else {
        console.error('[Chat] Send failed:', response)
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Global Chat</h2>
        <span className="chat-status">
          {socketClient.isConnected() ? '🟢 Connected' : '🔴 Disconnected'}
        </span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">No messages yet. Start chatting!</div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="chat-message">
              <div className="message-header">
                <strong className="message-username">{msg.user.username}</strong>
                <span className="message-time">{formatTime(msg.timestamp)}</span>
              </div>
              <div className="message-content">{msg.message}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <input
          type="text"
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={!socketClient.isConnected() || isSending}
        />
        <button
          className="chat-send-button"
          onClick={handleSendMessage}
          disabled={!socketClient.isConnected() || isSending || !input.trim()}
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
