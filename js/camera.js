/* ===== SIGNBRIDGE - CAMERA MODULE ===== */

export const Camera = {
  stream: null,
  videoEl: null,
  isActive: false,
  facingMode: 'user',
  onReady: null,
  onError: null,

  async start(videoEl, facingMode = 'user') {
    this.videoEl = videoEl;
    this.facingMode = facingMode;

    try {
      if (this.stream) this.stop();

      const constraints = {
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoEl.srcObject = this.stream;
      videoEl.playsInline = true;
      videoEl.muted = true;
      await videoEl.play();
      this.isActive = true;

      if (this.onReady) this.onReady();
      return true;
    } catch (err) {
      this.isActive = false;
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access.'
        : err.name === 'NotFoundError'
          ? 'No camera found on this device.'
          : `Camera error: ${err.message}`;

      if (this.onError) this.onError(msg);
      return false;
    }
  },

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }
    this.isActive = false;
  },

  async flip() {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    if (this.videoEl) {
      await this.start(this.videoEl, this.facingMode);
    }
  },

  isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },

  // Capture a still frame from the video
  captureFrame(width = 320, height = 240) {
    if (!this.videoEl) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.videoEl, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.8);
  },

  // Resize the overlay canvas to match video
  syncCanvas(canvasEl) {
    if (!this.videoEl || !canvasEl) return;
    const resizeObserver = new ResizeObserver(() => {
      canvasEl.width = this.videoEl.videoWidth || this.videoEl.offsetWidth;
      canvasEl.height = this.videoEl.videoHeight || this.videoEl.offsetHeight;
    });
    resizeObserver.observe(this.videoEl);
    return resizeObserver;
  },
};
