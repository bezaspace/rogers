const TARGET_SAMPLE_RATE = 24000
const PLAYBACK_WORKLET_PATH = new URL('/assistant-playback-worklet.js', window.location.origin)

export class AudioPlaybackQueue {
  constructor() {
    this.audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
    this.readyPromise = this.initialize()
    this.node = null
    this.pendingBeforeReady = []
  }

  async initialize() {
    await this.audioContext.audioWorklet.addModule(PLAYBACK_WORKLET_PATH)
    const node = new AudioWorkletNode(
      this.audioContext,
      'assistant-playback-processor',
      {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      }
    )
    node.connect(this.audioContext.destination)
    this.node = node

    if (this.pendingBeforeReady.length > 0) {
      for (const payload of this.pendingBeforeReady) {
        this.postSamples(payload)
      }
      this.pendingBeforeReady.length = 0
    }
  }

  async ensureReady() {
    await this.readyPromise
    await this.audioContext.resume()
  }

  playPcm16Chunk(arrayBuffer, sourceSampleRate = TARGET_SAMPLE_RATE) {
    const pcm = new Int16Array(arrayBuffer)
    const floatData = new Float32Array(pcm.length)

    for (let index = 0; index < pcm.length; index += 1) {
      floatData[index] = pcm[index] / 0x7fff
    }

    const normalized =
      sourceSampleRate === TARGET_SAMPLE_RATE
        ? floatData
        : this.resampleLinear(floatData, sourceSampleRate, TARGET_SAMPLE_RATE)

    this.enqueue(normalized)
  }

  enqueue(samples) {
    if (!samples.length) {
      return
    }

    void this.audioContext.resume()

    if (!this.node) {
      this.pendingBeforeReady.push(samples)
      return
    }

    this.postSamples(samples)
  }

  postSamples(samples) {
    if (!this.node) {
      return
    }

    this.node.port.postMessage(
      { type: 'enqueue', samples: samples.buffer },
      [samples.buffer]
    )
  }

  interrupt() {
    this.pendingBeforeReady.length = 0
    if (!this.node) {
      return
    }
    this.node.port.postMessage({ type: 'clear' })
  }

  async close() {
    this.interrupt()
    if (this.node) {
      this.node.disconnect()
      this.node = null
    }
    await this.audioContext.close()
  }

  resampleLinear(input, sourceSampleRate, targetSampleRate) {
    if (input.length === 0 || sourceSampleRate <= 0 || targetSampleRate <= 0) {
      return input
    }

    const ratio = sourceSampleRate / targetSampleRate
    const outputLength = Math.max(1, Math.round(input.length / ratio))
    const output = new Float32Array(outputLength)

    for (let index = 0; index < outputLength; index += 1) {
      const position = index * ratio
      const left = Math.floor(position)
      const right = Math.min(left + 1, input.length - 1)
      const fraction = position - left
      output[index] = input[left] * (1 - fraction) + input[right] * fraction
    }

    return output
  }
}
