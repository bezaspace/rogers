class AudioCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) {
      return true
    }

    const channelData = input[0]
    if (!channelData || channelData.length === 0) {
      return true
    }

    this.port.postMessage(channelData.slice(0))
    return true
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor)
