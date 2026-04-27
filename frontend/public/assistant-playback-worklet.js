class AssistantPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.queue = []
    this.currentBuffer = null
    this.currentIndex = 0

    this.port.onmessage = (event) => {
      const eventType = event.data?.type
      if (eventType === 'enqueue') {
        const arrayBuffer = event.data?.samples
        if (!(arrayBuffer instanceof ArrayBuffer)) {
          return
        }
        const buffer = new Float32Array(arrayBuffer)
        if (buffer.length > 0) {
          this.queue.push(buffer)
        }
        return
      }

      if (eventType === 'clear') {
        this.queue = []
        this.currentBuffer = null
        this.currentIndex = 0
      }
    }
  }

  process(inputs, outputs) {
    const output = outputs?.[0]?.[0]
    if (!output) {
      return true
    }

    for (let index = 0; index < output.length; index += 1) {
      if (!this.currentBuffer || this.currentIndex >= this.currentBuffer.length) {
        this.currentBuffer = this.queue.shift() ?? null
        this.currentIndex = 0
      }

      if (!this.currentBuffer) {
        output[index] = 0
        continue
      }

      output[index] = this.currentBuffer[this.currentIndex]
      this.currentIndex += 1
    }

    return true
  }
}

registerProcessor('assistant-playback-processor', AssistantPlaybackProcessor)
