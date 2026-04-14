/* ===== SIGNBRIDGE - AVATAR SIGN ANIMATOR ===== */
/*
 * Draws animated hand/avatar SVG for sign language output.
 * Each sign has a keyframe sequence for fingers.
 */

import { Settings } from './settings.js';

export const Avatar = {
  _svgEl: null,
  _signNameEl: null,
  _currentSign: null,
  _animFrame: null,
  _t: 0,
  
  // Three.js State
  _threeScene: null,
  _threeCam: null,
  _threeRenderer: null,
  _handBones: [],
  _threeRaf: null,

  // Sign animations: each entry defines finger states [thumb,index,middle,ring,pinky] (0=closed, 1=open, 0.5=half)
  SIGNS: {
    'Hello':     { pose: [1,1,1,1,1], motion: 'wave',   color: '#6C63FF', emoji: '👋' },
    'Thank You': { pose: [1,1,0,0,0], motion: 'forward', color: '#00D4AA', emoji: '🙏' },
    'Yes':       { pose: [0,0,0,0,0], motion: 'nod',     color: '#4CAF50', emoji: '✊' },
    'No':        { pose: [0,1,1,0,0], motion: 'wave',    color: '#FF6B6B', emoji: '✌️' },
    'Help':      { pose: [1,0,0,0,0], motion: 'rise',    color: '#FFB347', emoji: '🤲' },
    'Please':    { pose: [1,1,1,1,1], motion: 'circle',  color: '#6C63FF', emoji: '🙏' },
    'Sorry':     { pose: [0,0,0,0,0], motion: 'circle',  color: '#FF6B6B', emoji: '✊' },
    'I Love You':{ pose: [1,1,0,0,1], motion: 'shake',   color: '#FF6B6B', emoji: '🤟' },
    'Water':     { pose: [0,1,1,1,0], motion: 'tap',     color: '#2196F3', emoji: '💧' },
    'Food':      { pose: [0.5,0.5,0.5,0.5,0.5], motion:'tap',  color:'#FF9800', emoji:'🍽️' },
    'Good':      { pose: [1,0,0,0,0], motion: 'nod',     color: '#4CAF50', emoji: '👍' },
    'Bad':       { pose: [1,0,0,0,0], motion: 'down',    color: '#FF6B6B', emoji: '👎' },
    'Stop':      { pose: [1,1,1,1,1], motion: 'push',    color: '#FF6B6B', emoji: '✋' },
    'Come':      { pose: [0,1,0,0,0], motion: 'curl',    color: '#00D4AA', emoji: '🫵' },
    'Go':        { pose: [0,1,0,0,0], motion: 'point',   color: '#00D4AA', emoji: '👉' },
    'Me / I':    { pose: [0,1,0,0,0], motion: 'self',    color: '#6C63FF', emoji: '☝️' },
    'You':       { pose: [0,1,0,0,0], motion: 'point',   color: '#6C63FF', emoji: '👆' },
    'More':      { pose: [0.5,0.5,0.5,0.5,0.5], motion:'tap', color:'#6C63FF', emoji:'🤌' },
    'Where?':    { pose: [0,1,0,0,0], motion: 'wave',    color: '#FFB347', emoji: '🤷' },
    'Pain / Hurt':{ pose:[0,1,0,0,0], motion: 'toward',  color: '#FF6B6B', emoji: '🤕' },
    'default':   { pose: [0.5,0.5,0.5,0.5,0.5], motion:'idle', color:'#9B9BBF', emoji:'✋' },
  },

  init(svgEl, signNameEl) {
    this._svgEl = svgEl;
    this._signNameEl = signNameEl;
    this._renderIdle();
  },

  showSign(name) {
    if (name === this._currentSign) return;
    this._currentSign = name;
    const signData = this.SIGNS[name] || this.SIGNS['default'];

    if (this._signNameEl) {
      this._signNameEl.textContent = signData.emoji + ' ' + (name || '');
    }

    this._animateSign(signData);
  },

  clearSign() {
    this._currentSign = null;
    if (this._signNameEl) this._signNameEl.textContent = '';
    this._renderIdle();
  },

  _animateSign(signData) {
    if (!this._svgEl) return;
    this._svgEl.style.transition = 'transform 0.3s ease';
    this._svgEl.style.transform = 'scale(0.9)';

    setTimeout(() => {
      this._svgEl.style.transform = 'scale(1)';
      this._renderHand(signData, this._currentSign);
      this._startMotion(signData.motion, signData.color);
    }, 150);
  },

  _renderHand(signData, signName) {
    if (!this._svgEl) return;
    
    const style = Settings.get('avatarStyle') || 'vector';
    const color = signData.color || '#9B9BBF';
    const pose = signData.pose || [0.5,0.5,0.5,0.5,0.5];
    const emoji = signData.emoji || '✋';
    const nameMap = (signName || 'default').toLowerCase();
    
    // Switch between 3D Canvas and SVG
    if (style === 'generative3d') {
        this._svgEl.style.display = 'none';
        this._initThreeJS();
        this._poseThreeHand(pose, color);
        return;
    } else {
        this._disposeThreeJS();
        this._svgEl.style.display = 'block';
    }

    let url = '';
    
    // Custom Asset checking logic
    if (style === 'realistic' && (nameMap === 'hello' || nameMap === 'stop')) {
        url = `assets/hand_${nameMap}.png`;
    } 
    else if (style === 'anime' && nameMap === 'stop') {
        url = `assets/anime_stop.png`;
    }
    // Fallback to Vector Emoji
    else {
        const twemojiCode = Array.from(emoji)
          .map(c => c.codePointAt(0).toString(16))
          .filter(c => c !== 'fe0f')
          .join('-');
        url = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${twemojiCode}.svg`;
    }

    this._svgEl.innerHTML = `
      <defs>
        <filter id="handGlow">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feComponentTransfer in="blur" result="glow">
            <feFuncA type="linear" slope="0.5"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="glow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="dropShadow">
          <feDropShadow dx="0" dy="15" stdDeviation="15" flood-color="#000000" flood-opacity="0.2"/>
        </filter>
      </defs>
      <circle cx="100" cy="100" r="60" fill="${color}" opacity="0.15" filter="url(#handGlow)"/>
      <image href="${url}" x="${style === 'vector' ? 30 : 10}" y="${style === 'vector' ? 30 : 10}" 
        width="${style === 'vector' ? 140 : 180}" height="${style === 'vector' ? 140 : 180}" 
        filter="url(#dropShadow)" />
    `;
  },

  _initThreeJS() {
    if (this._threeScene || !window.THREE) return;
    const container = this._svgEl.parentElement;
    
    this._threeScene = new window.THREE.Scene();
    this._threeCam = new window.THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this._threeCam.position.set(0, 0, 7.5);

    this._threeRenderer = new window.THREE.WebGLRenderer({ alpha: true, antialias: true });
    this._threeRenderer.setSize(200, 200);
    this._threeRenderer.domElement.style.position = 'absolute';
    this._threeRenderer.domElement.style.top = '0';
    this._threeRenderer.domElement.style.left = '50%';
    this._threeRenderer.domElement.style.transform = 'translateX(-50%)';
    this._threeRenderer.domElement.style.pointerEvents = 'none';
    this._threeRenderer.domElement.style.transition = 'transform 0.3s ease';
    this._threeRenderer.domElement.id = 'threejs-canvas';
    
    container.style.position = 'relative';
    container.appendChild(this._threeRenderer.domElement);

    // Lighting
    this._threeScene.add(new window.THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new window.THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(5, 10, 7);
    this._threeScene.add(dirLight);

    // Build Robot Hand Math
    const mat = new window.THREE.MeshStandardMaterial({ 
        color: 0xE8E8FA, 
        metalness: 0.6, 
        roughness: 0.4 
    });
    
    const palm = new window.THREE.Mesh(new window.THREE.BoxGeometry(2, 2.2, 0.5), mat);
    this._threeScene.add(palm);
    this._handBones = []; // Reset bones
    
    const createFinger = (x, y, len) => {
        const group = new window.THREE.Group();
        group.position.set(x, y, 0);
        const mesh = new window.THREE.Mesh(new window.THREE.CylinderGeometry(0.2, 0.2, len, 16), mat);
        mesh.position.y = len / 2;
        group.add(mesh);
        
        // Add glowing joint connector
        const jointMat = new window.THREE.MeshBasicMaterial({ color: 0x6C63FF });
        const joint = new window.THREE.Mesh(new window.THREE.SphereGeometry(0.25, 16, 16), jointMat);
        group.add(joint);
        
        palm.add(group);
        return group;
    };

    this._handBones.push(createFinger(-1.2, -0.2, 1.2)); // Thumb
    this._handBones.push(createFinger(-0.7, 1.1, 1.6));  // Index
    this._handBones.push(createFinger(0, 1.1, 1.7));     // Middle
    this._handBones.push(createFinger(0.7, 1.1, 1.6));   // Ring
    this._handBones.push(createFinger(1.2, 0.8, 1.2));   // Pinky
    
    // Rotate root for better viewing
    palm.rotation.x = -0.2;

    const animate = () => {
      this._threeRaf = requestAnimationFrame(animate);
      
      // Floating animation
      if (this._currentSign === 'default') {
          palm.position.y = Math.sin(Date.now() * 0.002) * 0.2;
      }
      this._threeRenderer.render(this._threeScene, this._threeCam);
    };
    animate();
  },

  _poseThreeHand(pose, color) {
     if (!this._handBones.length) return;
     
     // Update joint colors
     const jointColor = new window.THREE.Color(color);
     this._handBones.forEach(bone => {
         bone.children[1].material.color = jointColor;
     });

     // Smoothly animate finger rotations using TWEEN or simple lerp?
     // Since this is plain JS, we'll assign the target rotation and the render loop handles it immediately for a snap effect,
     // but the CSS motion handles overall translation.
     
     // pose format: [thumb, index, middle, ring, pinky] (1 = open, 0 = closed)
     const openState = 0;
     const closeState = Math.PI / 1.6; // Curl inward
     
     this._handBones.forEach((bone, idx) => {
         const p = pose[idx];
         let targetCurl = openState * p + closeState * (1 - p);
         if (idx === 0) { // Thumb curls differently
             bone.rotation.z = -targetCurl;
             bone.rotation.x = targetCurl / 2;
         } else {
             bone.rotation.x = targetCurl;
         }
     });
  },

  _disposeThreeJS() {
    if (this._threeRaf) cancelAnimationFrame(this._threeRaf);
    if (this._threeRenderer) {
        this._threeRenderer.domElement.remove();
        this._threeRenderer.dispose();
    }
    this._threeScene = null;
    this._threeCam = null;
    this._threeRenderer = null;
    this._handBones = [];
    this._threeRaf = null;
  },

  _renderIdle() {
    this._renderHand(this.SIGNS['default'], 'default');
  },

  _startMotion(motion, color) {
    // CSS-based motion via class toggle
    if (!this._svgEl) return;
    const el = this._svgEl;
    el.style.animation = 'none';
    void el.offsetWidth; // reflow
    const motionMap = {
      wave:    'handWave 0.8s ease-in-out 2',
      nod:     'avatarBob 0.5s ease-in-out 3',
      circle:  'rotateLoop 1.2s ease-in-out 1',
      point:   'fadeInRight 0.4s ease-out 1',
      self:    'fadeInLeft 0.4s ease-out 1',
      shake:   'handWave 0.6s ease-in-out 3',
      tap:     'avatarBob 0.4s ease-in-out 4',
      push:    'scaleInBounce 0.5s ease-out 1',
      forward: 'fadeInUp 0.5s ease-out 1',
      rise:    'fadeInUp 0.6s ease-out 2',
      down:    'fadeInDown 0.5s ease-out 1',
      curl:    'handWave 0.7s ease-in-out 2',
      toward:  'fadeInRight 0.5s ease-out 2',
      idle:    'float 3s ease-in-out infinite',
    };
    el.style.animation = motionMap[motion] || 'float 3s ease-in-out infinite';
  },
};
