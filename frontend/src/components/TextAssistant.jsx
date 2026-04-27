import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Send } from 'lucide-react'
import { getTextAssistantModes, streamTextAssistantMessage } from '../data/api'

function splitThinkingFromText(text) {
  const thinking = []
  const withoutGemmaThoughts = text.replace(
    /<\|channel\>thought\s*([\s\S]*?)<channel\|>/gi,
    (_match, thought) => {
      const trimmed = thought.trim()
      if (trimmed) {
        thinking.push(trimmed)
      }
      return ''
    }
  )
  const answer = withoutGemmaThoughts.replace(
    /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi,
    (_match, thought) => {
      const trimmed = thought.trim()
      if (trimmed) {
        thinking.push(trimmed)
      }
      return ''
    }
  )

  return {
    answer: answer.trim(),
    thinking: thinking.join('\n\n').trim(),
  }
}

export default function TextAssistant() {
  const [modes, setModes] = useState([
    {
      id: 'gemma31_stable',
      label: 'Gemma 31B stable',
      enabled: true,
      reason: '',
    },
  ])
  const [selectedMode, setSelectedMode] = useState('gemma31_stable')
  const [sessionIdsByMode, setSessionIdsByMode] = useState({})
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'TEXT_ASSISTANT_READY. I can answer questions about projects, files, linked images, tasks, and mind-dump entries.',
    },
  ])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    getTextAssistantModes()
      .then((response) => {
        if (cancelled) return
        setModes(response.modes || [])
        setSelectedMode(response.defaultMode || 'gemma31_stable')
      })
      .catch(() => {
        if (cancelled) return
        setModes([
          {
            id: 'gemma31_stable',
            label: 'Gemma 31B stable',
            enabled: true,
            reason: '',
          },
        ])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const currentMode = useMemo(
    () => modes.find((mode) => mode.id === selectedMode) || modes[0],
    [modes, selectedMode]
  )

  const getModeLabel = (modeId) => (
    modes.find((mode) => mode.id === modeId)?.label || modeId
  )

  const canSend = useMemo(
    () => input.trim().length > 0 && !isSending && (currentMode?.enabled ?? true),
    [input, isSending, currentMode]
  )

  const sendMessage = async (event) => {
    event.preventDefault()
    const text = input.trim()
    if (!text || isSending) {
      return
    }

    setInput('')
    setIsSending(true)
    setMessages((current) => [
      ...current,
      { role: 'user', content: text },
    ])

    const assistantMessageId = `assistant-${Date.now()}`
    const modeForMessage = selectedMode
    const sessionId = sessionIdsByMode[modeForMessage] || null
    try {
      setMessages((current) => [
        ...current,
        {
          id: assistantMessageId,
          role: 'assistant',
          mode: modeForMessage,
          content: '',
          thinking: '',
          isStreaming: true,
        },
      ])

      await streamTextAssistantMessage(text, sessionId, modeForMessage, {
        onSession: (nextSessionId, responseMode) => {
          setSessionIdsByMode((current) => ({
            ...current,
            [responseMode || modeForMessage]: nextSessionId,
          }))
        },
        onThinkingDelta: (delta) => {
          setMessages((current) => current.map((message) => {
            if (message.id !== assistantMessageId) return message
            return {
              ...message,
              thinking: `${message.thinking || ''}${delta}`,
            }
          }))
        },
        onAnswerDelta: (delta) => {
          const parsed = splitThinkingFromText(delta)
          setMessages((current) => current.map((message) => {
            if (message.id !== assistantMessageId) return message
            return {
              ...message,
              content: `${message.content || ''}${parsed.answer}`,
              thinking: `${message.thinking || ''}${parsed.thinking}`,
            }
          }))
        },
        onError: (message) => {
          setMessages((current) => current.map((entry) => {
            if (entry.id !== assistantMessageId) return entry
            return {
              ...entry,
              content: message,
              isStreaming: false,
            }
          }))
        },
        onDone: () => {
          setMessages((current) => current.map((message) => {
            if (message.id !== assistantMessageId) return message
            return {
              ...message,
              content: message.content || 'No answer returned.',
              isStreaming: false,
            }
          }))
        },
      })
    } catch (error) {
      setMessages((current) => current.map((message) => {
        if (message.id !== assistantMessageId) return message
        return {
          ...message,
          content:
            error?.message || 'Text assistant connection failed. Check backend logs.',
          isStreaming: false,
        }
      }))
    } finally {
      setIsSending(false)
      window.requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      sendMessage(event)
    }
  }

  return (
    <div className="text-assistant-container">
      <div className="text-mode-selector">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`text-mode-button ${selectedMode === mode.id ? 'active' : ''}`}
            disabled={!mode.enabled || isSending}
            onClick={() => setSelectedMode(mode.id)}
            title={mode.reason || mode.label}
          >
            <span>{mode.label}</span>
            {!mode.enabled && <small>{mode.reason}</small>}
          </button>
        ))}
      </div>
      <div className="text-assistant-log">
        {messages.map((message, index) => (
          <article
            key={`${message.role}-${index}`}
            className={`text-message ${message.role}`}
          >
            <div className="text-message-role">
              {message.role === 'user'
                ? 'YOU'
                : `ASSISTANT${message.mode ? ` · ${getModeLabel(message.mode)}` : ''}`}
            </div>
            {(message.thinking || message.isStreaming) && (
              <details className="thinking-accordion">
                <summary>{message.isStreaming ? 'thinking...' : 'thinking'}</summary>
                <div className="thinking-content">
                  {message.thinking ? (
                    <ReactMarkdown>{message.thinking}</ReactMarkdown>
                  ) : (
                    <p>Waiting for thought stream...</p>
                  )}
                </div>
              </details>
            )}
            <div className="text-message-body">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </article>
        ))}
      </div>

      <form className="text-assistant-input-bar" onSubmit={sendMessage}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Ask about projects, files, linked images, tasks, or mind dumps..."
          rows={2}
        />
        <button type="submit" className="hud-button" disabled={!canSend}>
          <Send size={14} />
          SEND
        </button>
      </form>
    </div>
  )
}
