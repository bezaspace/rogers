const API_BASE_URL =
  import.meta.env.VITE_BACKEND_HTTP_URL ||
  import.meta.env.VITE_API_URL ||
  ''

async function request(path, options = {}) {
  const bodyIsFormData = options.body instanceof FormData
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    headers: bodyIsFormData
      ? options.headers || {}
      : {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }

  return response.json()
}

export function getProjects() {
  return request('/projects')
}

export function sendTextAssistantMessage(message, sessionId) {
  return request('/text-assistant', {
    method: 'POST',
    body: JSON.stringify({
      message,
      session_id: sessionId || null,
      mode: null,
    }),
  })
}

export function getTextAssistantModes() {
  return request('/text-assistant/modes')
}

export async function streamTextAssistantMessage(message, sessionId, mode, handlers = {}) {
  const response = await fetch(`${API_BASE_URL}/api/text-assistant/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      session_id: sessionId || null,
      mode,
    }),
  })

  if (!response.ok || !response.body) {
    throw new Error(`API request failed: ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const dispatchEvent = (rawEvent) => {
    const lines = rawEvent.split('\n')
    const eventLine = lines.find(line => line.startsWith('event: '))
    const dataLines = lines
      .filter(line => line.startsWith('data: '))
      .map(line => line.slice(6))

    if (!eventLine || dataLines.length === 0) {
      return
    }

    const eventType = eventLine.slice(7)
    const payload = JSON.parse(dataLines.join('\n'))

    if (eventType === 'session') handlers.onSession?.(payload.sessionId, payload.mode)
    if (eventType === 'thinking_delta') handlers.onThinkingDelta?.(payload.text || '')
    if (eventType === 'answer_delta') handlers.onAnswerDelta?.(payload.text || '')
    if (eventType === 'done') handlers.onDone?.(payload)
    if (eventType === 'error') handlers.onError?.(payload.message || 'Streaming failed.')
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''
    events.forEach(dispatchEvent)
  }

  if (buffer.trim()) {
    dispatchEvent(buffer)
  }
}

export function createProject(name, details) {
  return request('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, details }),
  })
}

export function deleteProject(projectId) {
  return request(`/projects/${projectId}`, {
    method: 'DELETE',
  })
}

export function createFile(projectId, name, content) {
  return request(`/projects/${projectId}/files`, {
    method: 'POST',
    body: JSON.stringify({ name, content }),
  })
}

export function updateFile(fileId, updates) {
  return request(`/files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export function deleteFile(fileId) {
  return request(`/files/${fileId}`, {
    method: 'DELETE',
  })
}

export function getImages() {
  return request('/images')
}

export function deleteImage(imageId) {
  return request(`/images/${imageId}`, {
    method: 'DELETE',
  })
}

export function resolveAssetUrl(url) {
  if (!url || !url.startsWith('/')) {
    return url
  }

  return `${API_BASE_URL}${url}`
}

export function uploadImage(file, category, metadata) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category', category || 'USER_UPLOAD')
  formData.append('metadata', metadata || '')

  return request('/images', {
    method: 'POST',
    headers: {},
    body: formData,
  })
}

export function getImageDump() {
  return request('/image-dump')
}

export function deleteImageDumpItem(itemId) {
  return request(`/image-dump/${itemId}`, {
    method: 'DELETE',
  })
}

export function uploadImageDumpItem(file) {
  const formData = new FormData()
  formData.append('file', file)

  return request('/image-dump', {
    method: 'POST',
    headers: {},
    body: formData,
  })
}

export function getMindDump() {
  return request('/mind-dump')
}

export function createMindDumpEntry(content) {
  return request('/mind-dump', {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export function updateMindDumpEntry(entryId, updates) {
  return request(`/mind-dump/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export function deleteMindDumpEntry(entryId) {
  return request(`/mind-dump/${entryId}`, {
    method: 'DELETE',
  })
}

export function getTasks() {
  return request('/tasks')
}

export function createTask(task) {
  return request('/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  })
}

export function updateTask(taskId, updates) {
  return request(`/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export function rescheduleTask(taskId, payload) {
  return request(`/tasks/${taskId}/reschedule`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
