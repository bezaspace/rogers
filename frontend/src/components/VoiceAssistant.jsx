import { useEffect, useRef, useState } from 'react'
import { AudioCaptureSession } from '../audio/audioCapture'
import { AudioPlaybackQueue } from '../audio/audioPlayback'

const BACKEND_HTTP_URL =
  import.meta.env.VITE_BACKEND_HTTP_URL ||
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:8080'
const BACKEND_WS_URL =
  import.meta.env.VITE_BACKEND_WS_URL ||
  `${BACKEND_HTTP_URL.replace(/^http/i, 'ws').replace(/\/$/, '')}/live`

function getLiveSocketUrl() {
  return BACKEND_WS_URL
}

export default function VoiceAssistant() {
  const [connectionState, setConnectionState] = useState('idle')
  const [visualState, setVisualState] = useState('idle')
  const [warning, setWarning] = useState('')

  const socketRef = useRef(null)
  const playerRef = useRef(null)
  const micRef = useRef(null)
  const assistantSampleRateRef = useRef(24000)
  const isPttActiveRef = useRef(false)
  const speakingTimeoutRef = useRef(null)
  const pendingCloseStateRef = useRef(null)

  useEffect(() => {
    return () => {
      if (speakingTimeoutRef.current !== null) {
        window.clearTimeout(speakingTimeoutRef.current)
      }
      if (micRef.current) {
        micRef.current.stop().catch(() => {})
      }
      if (playerRef.current) {
        playerRef.current.close().catch(() => {})
      }
      if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
        socketRef.current.close()
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== ' ' || event.repeat) {
        return
      }

      const target = event.target
      const isEditable =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      if (isEditable) {
        return
      }

      event.preventDefault()
      beginPtt()
    }

    const handleKeyUp = (event) => {
      if (event.key !== ' ') {
        return
      }

      event.preventDefault()
      endPtt()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [connectionState])

  const markPttActive = (active) => {
    isPttActiveRef.current = active
  }

  const stopAssistantPlaybackNow = () => {
    playerRef.current?.interrupt()
    if (speakingTimeoutRef.current !== null) {
      window.clearTimeout(speakingTimeoutRef.current)
      speakingTimeoutRef.current = null
    }
  }

  const scheduleListeningVisual = (delayMs) => {
    if (speakingTimeoutRef.current !== null) {
      window.clearTimeout(speakingTimeoutRef.current)
    }

    speakingTimeoutRef.current = window.setTimeout(() => {
      if (!isPttActiveRef.current) {
        setVisualState('listening')
      }
      speakingTimeoutRef.current = null
    }, delayMs)
  }

  const sendEvent = (payload) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return
    }
    socket.send(JSON.stringify(payload))
  }

  const ensureConnection = async () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return
    }

    setConnectionState('connecting')
    setVisualState('idle')
    setWarning('')
    assistantSampleRateRef.current = 24000

    playerRef.current = new AudioPlaybackQueue()
    await playerRef.current.ensureReady()

    const mic = new AudioCaptureSession({
      onChunk: (chunk) => {
        const socket = socketRef.current
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return
        }
        socket.send(chunk)
      },
    })
    await mic.start()
    micRef.current = mic

    await new Promise((resolve, reject) => {
      const socket = new WebSocket(getLiveSocketUrl())
      socket.binaryType = 'arraybuffer'
      socketRef.current = socket

      let initialized = false
      const storedSessionId =
        typeof window !== 'undefined'
          ? window.localStorage?.getItem('clara.session_id') || null
          : null

      socket.onopen = () => {
        socket.send(
          JSON.stringify({ type: 'session_init', session_id: storedSessionId })
        )
      }

      socket.onerror = () => {
        reject(new Error('Connection error. Check backend logs.'))
      }

      socket.onclose = () => {
        const pending = pendingCloseStateRef.current
        pendingCloseStateRef.current = null
        markPttActive(false)

        if (!initialized) {
          reject(new Error('Connection closed before session_started.'))
        }

        if (pending) {
          setConnectionState(pending.connectionState)
          setVisualState(pending.visualState)
          setWarning(pending.warning)
          return
        }

        setConnectionState('idle')
        setVisualState('idle')
      }

      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const parsed = JSON.parse(event.data)

          if (parsed.type === 'session_started') {
            initialized = true
            if (parsed.session_id && typeof window !== 'undefined') {
              window.localStorage?.setItem('clara.session_id', parsed.session_id)
            }
            setConnectionState('ready')
            if (!isPttActiveRef.current) {
              setVisualState('listening')
            }
            resolve()
            return
          }

          if (parsed.type === 'assistant_audio_format') {
            assistantSampleRateRef.current = parsed.sampleRate
            return
          }

          if (parsed.type === 'assistant_interrupted' || parsed.type === 'interrupted') {
            stopAssistantPlaybackNow()
            if (!isPttActiveRef.current) {
              setVisualState('awaiting')
            }
            return
          }

          if (parsed.type === 'assistant_text' || parsed.type === 'transcript') {
            if (!isPttActiveRef.current && parsed.speaker !== 'user') {
              setVisualState('speaking')
              scheduleListeningVisual(1200)
            }
            return
          }

          if (parsed.type === 'state') {
            if (parsed.state === 'thinking' && !isPttActiveRef.current) {
              setVisualState('awaiting')
            }
            if (parsed.state === 'speaking' && !isPttActiveRef.current) {
              setVisualState('speaking')
            }
            return
          }

          if (parsed.type === 'warning' || parsed.type === 'error') {
            setWarning(parsed.message)
            if (parsed.type === 'error') {
              setConnectionState('error')
              setVisualState('error')
            }
          }
          return
        }

        if (event.data instanceof ArrayBuffer) {
          playerRef.current?.playPcm16Chunk(
            event.data,
            assistantSampleRateRef.current
          )
          if (!isPttActiveRef.current) {
            setVisualState('speaking')
          }
        }
      }
    })

    if (warning === 'Microphone unavailable.') {
      setWarning('')
    }
  }

  const disconnect = async () => {
    pendingCloseStateRef.current = null

    if (isPttActiveRef.current) {
      markPttActive(false)
      micRef.current?.pauseStream()
      sendEvent({ type: 'ptt_end' })
    }

    if (speakingTimeoutRef.current !== null) {
      window.clearTimeout(speakingTimeoutRef.current)
      speakingTimeoutRef.current = null
    }

    micRef.current?.pauseStream()
    if (micRef.current) {
      await micRef.current.stop()
      micRef.current = null
    }

    if (socketRef.current) {
      sendEvent({ type: 'stop_session' })
      socketRef.current.close()
      socketRef.current = null
    }

    if (playerRef.current) {
      await playerRef.current.close()
      playerRef.current = null
    }

    setConnectionState('idle')
    setVisualState('idle')
  }

  const beginPtt = async () => {
    if (connectionState === 'connecting' || isPttActiveRef.current) {
      return
    }

    try {
      if (connectionState !== 'ready') {
        await ensureConnection()
      }

      stopAssistantPlaybackNow()
      markPttActive(true)
      setVisualState('holding')
      micRef.current?.startStream()
      sendEvent({ type: 'ptt_start' })
    } catch (error) {
      await disconnect()
      setWarning(error?.message || 'Connection error. Check backend logs.')
      setVisualState('error')
      setConnectionState('error')
    }
  }

  const endPtt = () => {
    if (!isPttActiveRef.current) {
      return
    }

    markPttActive(false)
    micRef.current?.pauseStream()
    sendEvent({ type: 'ptt_end' })

    if (connectionState === 'ready') {
      setVisualState('awaiting')
    }
  }

  const handleEndSession = async () => {
    await disconnect()
    setWarning('')
  }

  const handlePointerDown = async (event) => {
    event.preventDefault()
    await beginPtt()
  }

  const handlePointerUp = (event) => {
    event.preventDefault()
    endPtt()
  }

  const label =
    connectionState === 'idle'
      ? 'Hold to talk'
      : visualState === 'holding'
        ? 'Release when done'
        : visualState === 'listening'
          ? 'Ready'
          : visualState === 'awaiting'
            ? 'Processing'
            : visualState === 'speaking'
              ? 'Speaking'
              : visualState === 'error'
                ? 'Error'
                : 'Connecting'

  return (
    <div className="voice-assistant-container">
      <button
        className={`orb-button orb-${visualState} orb-${connectionState}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          if (isPttActiveRef.current) {
            endPtt()
          }
        }}
        aria-label="Hold to talk"
      >
        <span className="orb-core" />
        <span className="orb-ring orb-ring-one" />
        <span className="orb-ring orb-ring-two" />
      </button>

      <div className="status-stack">
        <p className="status-line">{warning || label}</p>
        <p className="status-subline">Hold orb or spacebar to talk</p>
        <button
          type="button"
          className="secondary-control"
          onClick={handleEndSession}
          disabled={connectionState === 'idle'}
        >
          End session
        </button>
      </div>
    </div>
  )
}
