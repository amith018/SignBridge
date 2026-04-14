/* ===== SIGNBRIDGE - GESTURE RECOGNITION ENGINE ===== */
/* 
 * Uses MediaPipe Hands for landmark detection.
 * Maps hand poses to ASL/BSL signs via heuristic classifier.
 * Falls back to simulated data in environments without camera access.
 */

export const Gesture = {
  model: null,
  isRunning: false,
  lastSign: null,
  confidence: 0,
  onSign: null,
  onUpdate: null,
  _frameId: null,
  _videoEl: null,
  _canvasEl: null,
  _ctx: null,

  // ASL letter/word simplified heuristic mapping
  // Each entry: { name, emoji, desc }
  SIGN_VOCAB: [
    { name: 'Hello',     emoji: '👋', desc: 'Wave hand open' },
    { name: 'Thank You', emoji: '🙏', desc: 'Flat hand from chin forward' },
    { name: 'Yes',       emoji: '✊', desc: 'Fist nod down' },
    { name: 'No',        emoji: '✌️', desc: 'Index & middle finger sideways' },
    { name: 'Help',      emoji: '🤲', desc: 'Thumb-up on flat palm, raise' },
    { name: 'Please',    emoji: '🤞', desc: 'Circular flat hand on chest' },
    { name: 'Sorry',     emoji: '✊', desc: 'Fist circle on chest' },
    { name: 'I Love You','emoji':'🤟', desc: 'ILY handshape' },
    { name: 'Water',     emoji: '💧', desc: 'W hand to lips' },
    { name: 'Food',      emoji: '🍽️', desc: 'Flat O to mouth' },
    { name: 'Good',      emoji: '👍', desc: 'Thumbs up' },
    { name: 'Bad',       emoji: '👎', desc: 'Thumbs down' },
    { name: 'Stop',      emoji: '✋', desc: 'Full open palm facing out' },
    { name: 'Come',      emoji: '🫵', desc: 'Index finger curling toward self' },
    { name: 'Go',        emoji: '👉', desc: 'Index finger pointing away' },
    { name: 'Me / I',    emoji: '☝️', desc: 'Index points to self' },
    { name: 'You',       emoji: '👆', desc: 'Index points to other person' },
    { name: 'More',      emoji: '🤌', desc: 'Flat O hands tapping together' },
    { name: 'Where?',    emoji: '🤷', desc: 'Index waved side to side' },
    { name: 'Pain / Hurt', emoji: '🤕', desc: 'Both indexes toward each other' },
  ],

  // Heuristic landmark classifier (simplified)
  _classifyFromLandmarks(landmarks) {
    if (!landmarks || landmarks.length === 0) return null;

    const WRIST = 0, THUMB_TIP = 4, INDEX_TIP = 8,
          MIDDLE_TIP = 12, RING_TIP = 16, PINKY_TIP = 20,
          INDEX_MCP = 5, MIDDLE_MCP = 9, RING_MCP = 13, PINKY_MCP = 17;

    const lm = landmarks[0];
    if (!lm || lm.length < 21) return null;

    const pt = (i) => ({ x: lm[i].x, y: lm[i].y, z: lm[i].z });
    const dist = (a, b) => Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);

    const wrist = pt(WRIST);
    const thumbTip = pt(THUMB_TIP);
    const indexTip = pt(INDEX_TIP);
    const middleTip = pt(MIDDLE_TIP);
    const ringTip = pt(RING_TIP);
    const pinkyTip = pt(PINKY_TIP);

    const indexMcp = pt(INDEX_MCP);
    const middleMcp = pt(MIDDLE_MCP);
    const ringMcp = pt(RING_MCP);
    const pinkyMcp = pt(PINKY_MCP);

    // Dynamic scale to account for hand distance
    const handScale = dist(wrist, middleMcp);
    if (handScale === 0) return null;

    // Check if finger is extended beyond palm
    const isExt = (tip, mcp) => dist(wrist, tip) > dist(wrist, mcp) * 1.25;
    
    const indexUp = isExt(indexTip, indexMcp);
    const middleUp = isExt(middleTip, middleMcp);
    const ringUp = isExt(ringTip, ringMcp);
    const pinkyUp = isExt(pinkyTip, pinkyMcp);
    
    // Thumb is trickier, check distance from pinky base
    const thumbUp = dist(thumbTip, pt(17)) > handScale * 1.5;

    const thumbIndexDist = dist(thumbTip, indexTip) / handScale;
    
    // Average distance of tips to thumb (for bunching fingers)
    const avgTipDist = (dist(thumbTip, indexTip) + dist(indexTip, middleTip) + dist(middleTip, ringTip)) / (3 * handScale);

    /* ─── CLASSIFICATION TREE ─── */

    // 1. Food / More (All tips pinched to thumb)
    if (!indexUp && !middleUp && !ringUp && thumbIndexDist < 0.6 && avgTipDist < 0.6) {
        return { name: 'Food', confidence: 0.85 };
    }

    // 2. I Love You (Thumb, Index, Pinky extended)
    if (indexUp && !middleUp && !ringUp && pinkyUp && thumbUp) {
      return { name: 'I Love You', confidence: 0.91 };
    }
    
    // 3. Water (Index, Middle, Ring extended, Pinky closed -> 'W')
    if (indexUp && middleUp && ringUp && !pinkyUp) {
      return { name: 'Water', confidence: 0.82 };
    }

    // 4. No (Index + Middle extended, pinched with thumb)
    if (indexUp && middleUp && !ringUp && !pinkyUp && thumbIndexDist < 0.8) {
      return { name: 'No', confidence: 0.84 };
    }

    // 5. Good / Bad (Thumbs up / down)
    if (!indexUp && !middleUp && !ringUp && !pinkyUp && thumbUp) {
      if (thumbTip.y < indexMcp.y) return { name: 'Good', confidence: 0.88 };
      else return { name: 'Bad', confidence: 0.88 };
    }

    // 6. Pointing (Index only extended) -> You, Come, Go, Me
    if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
      if (indexTip.x > wrist.x + 0.1) return { name: 'Go', confidence: 0.81 };
      if (indexTip.x < wrist.x - 0.1) return { name: 'Come', confidence: 0.81 };
      if (indexTip.y > wrist.y) return { name: 'Me / I', confidence: 0.77 }; // Pointing down/chest
      return { name: 'You', confidence: 0.79 };
    }

    // 7. Fist -> Yes / Sorry
    if (!indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
      return { name: 'Yes', confidence: 0.82 };
    }

    // 8. Open Palm -> Hello / Stop / Thank You / Please
    if (indexUp && middleUp && ringUp && pinkyUp) {
      if (wrist.y > 0.7) return { name: 'Thank You', confidence: 0.80 };
      if (wrist.y < 0.4) return { name: 'Hello', confidence: 0.85 };
      return { name: 'Stop', confidence: 0.85 };
    }

    return null;
  },

  classifier: null,

  async init(videoEl, canvasEl) {
    this._videoEl = videoEl;
    this._canvasEl = canvasEl;
    this._ctx = canvasEl.getContext('2d');

    // Attempt to load TFJS KNN
    try {
      if (window.knnClassifier && window.tf) {
        this.classifier = knnClassifier.create();
        // this._seedKNN(); // Disabled: Synthetic noise ruins practical ML detection without actual sample recording.
        console.log('[Gesture] TFJS KNN Classifier initialized (waiting for user training)');
      }
    } catch (e) {
      console.warn('[Gesture] TFJS Init error:', e);
    }

    // Attempt to load MediaPipe Hands
    try {
      if (window.Hands) {
        this.model = new window.Hands({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`
        });
        this.model.setOptions({
          maxNumHands: 1,
          modelComplexity: 0,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.5,
        });
        this.model.onResults((results) => this._onResults(results));
        console.log('[Gesture] MediaPipe Hands loaded');
      } else {
        console.warn('[Gesture] MediaPipe not available, using simulation');
      }
    } catch (e) {
      console.warn('[Gesture] Init error:', e);
    }

    return true;
  },

  _seedKNN() {
    // Synthetic data to pre-train the model based on relative coordinates
    // In a production app, this would load a massive JSON of collected user tensors.
    
    const addSynth = (label, isUp) => {
        const tensor = tf.tensor1d(Array(63).fill(0).map((_, i) => {
           // Provide basic differentiation vectors to prevent random guessing
           if (label === 'Stop' || label === 'Hello') return i % 3 === 1 ? -0.5 : 0; // Negative Y
           if (label === 'Good') return i < 15 ? 0.5 : -0.5; // Thumbs up differentiation
           return Math.random() * 0.1;
        }));
        this.classifier.addExample(tensor, label);
    };
    
    // Seed core ML base
    for (let i = 0; i < 5; i++) addSynth('Hello', true);
    for (let i = 0; i < 5; i++) addSynth('Stop', true);
    for (let i = 0; i < 5; i++) addSynth('Good', false);
  },

  async _onResults(results) {
    const { width, height } = this._canvasEl;
    this._ctx.clearRect(0, 0, width, height);

    if (!results.multiHandLandmarks?.length) {
      this.confidence = 0;
      return;
    }

    // Draw hand skeleton
    this._drawHand(results.multiHandLandmarks);

    const lm = results.multiHandLandmarks[0];
    let classified = null;

    // 1. Try ML Classifier (Only if explicitly trained by user in the future)
    if (this.classifier && this.classifier.getNumClasses() > 0) {
      try {
        const flatArray = [];
        lm.forEach(pt => { flatArray.push(pt.x, pt.y, pt.z); });
        const tensor = tf.tensor1d(flatArray);
        const prediction = await this.classifier.predictClass(tensor);
        tensor.dispose();
        
        // If high confidence, use ML
        if (prediction.confidences[prediction.label] > 0.8) {
           classified = { name: prediction.label, confidence: prediction.confidences[prediction.label] };
        }
      } catch (e) { console.error('ML Inference Error:', e); }
    }

    // 2. Primary Engine: Robust Spatial Heuristics
    // Because the KNN isn't seeded with 10k real-world coordinate frames, 
    // we rely on the mathematically robust palm/finger-extension logic.
    if (!classified) {
      classified = this._classifyFromLandmarks(results.multiHandLandmarks);
    }

    if (classified) {
      this.confidence = classified.confidence;
      if (classified.name !== this.lastSign) {
        this.lastSign = classified.name;
        if (this.onSign) this.onSign(classified.name, classified.confidence);
      }
    }
    if (this.onUpdate) this.onUpdate(this.confidence);
  },

  _drawHand(landmarks) {
    const w = this._canvasEl.width;
    const h = this._canvasEl.height;
    const ctx = this._ctx;

    // Connections between landmarks
    const connections = [
      [0,1],[1,2],[2,3],[3,4], // Thumb
      [0,5],[5,6],[6,7],[7,8], // Index
      [0,9],[9,10],[10,11],[11,12], // Middle
      [0,13],[13,14],[14,15],[15,16], // Ring
      [0,17],[17,18],[18,19],[19,20], // Pinky
      [5,9],[9,13],[13,17], // Palm
    ];

    landmarks.forEach(lmarks => {
      // Draw connections
      ctx.strokeStyle = 'rgba(108,99,255,0.7)';
      ctx.lineWidth = 2;
      connections.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(lmarks[a].x * w, lmarks[a].y * h);
        ctx.lineTo(lmarks[b].x * w, lmarks[b].y * h);
        ctx.stroke();
      });

      // Draw dots
      lmarks.forEach((pt, i) => {
        const isTip = [4,8,12,16,20].includes(i);
        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, isTip ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isTip ? '#00D4AA' : '#6C63FF';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });
  },

  // Simulation mode when no camera/model available
  _simInterval: null,
  _simIndex: 0,

  startSimulation() {
    this._simIndex = 0;
    this._simInterval = setInterval(() => {
      const vocab = this.SIGN_VOCAB;
      const sign = vocab[this._simIndex % vocab.length];
      this._simIndex++;
      const conf = 0.72 + Math.random() * 0.25;
      this.confidence = conf;
      this.lastSign = sign.name;
      if (this.onSign) this.onSign(sign.name, conf);
      if (this.onUpdate) this.onUpdate(conf);
    }, 2800 + Math.random() * 1200);
  },

  stopSimulation() {
    if (this._simInterval) {
      clearInterval(this._simInterval);
      this._simInterval = null;
    }
  },

  start(simulate = false) {
    this.isRunning = true;
    if (simulate || !this.model) {
      this.startSimulation();
    } else {
      this._processFrame();
    }
  },

  stop() {
    this.isRunning = false;
    this.stopSimulation();
    if (this._frameId) {
      cancelAnimationFrame(this._frameId);
      this._frameId = null;
    }
    this.lastSign = null;
    this.confidence = 0;
  },

  async _processFrame() {
    if (!this.isRunning) return;
    if (this.model && this._videoEl && this._videoEl.readyState >= 2) {
      try {
        await this.model.send({ image: this._videoEl });
      } catch (e) {}
    }
    this._frameId = requestAnimationFrame(() => this._processFrame());
  },

  // Get sign vocab entry by name
  getSignInfo(name) {
    return this.SIGN_VOCAB.find(s => s.name === name);
  },
};
