/**
 * Transform Logger State Module
 * Advanced state tracking for animated characters with transforms
 * 
 * Features:
 * - Animation state tracking
 * - Character state snapshots
 * - Frame-by-frame state logging
 * - State transitions
 * - Performance metrics
 * - State history
 * 
 * @module TransformLoggerState
 */

/**
 * Animation State Enum
 */
const AnimationState = {
  IDLE: 'IDLE',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  STOPPED: 'STOPPED',
  TRANSITIONING: 'TRANSITIONING',
  ERROR: 'ERROR'
};

/**
 * Character State Enum
 */
const CharacterState = {
  ALIVE: 'ALIVE',
  DEAD: 'DEAD',
  DAMAGED: 'DAMAGED',
  INVULNERABLE: 'INVULNERABLE',
  HIDDEN: 'HIDDEN'
};

/**
 * Transform Logger State
 * Tracks complete character state with animations and transforms
 */
class TransformLoggerState {
  /**
   * Create character state tracker
   * @param {string} characterId - Character identifier
   * @param {object} options - Configuration
   */
  constructor(characterId, options = {}) {
    if (!characterId || typeof characterId !== 'string') {
      throw new Error('characterId must be non-empty string');
    }

    this.characterId = characterId;
    this.createdAt = Date.now();
    this.lastUpdated = Date.now();

    // State properties
    this.animationState = options.animationState ?? AnimationState.STOPPED;
    this.characterState = options.characterState ?? CharacterState.ALIVE;
    this.isVisible = options.isVisible !== false;
    this.opacity = options.opacity ?? 1;
    this.zIndex = options.zIndex ?? 0;

    // Animation info
    this.currentAnimation = options.currentAnimation ?? null;
    this.currentFrame = options.currentFrame ?? 0;
    this.totalFrames = options.totalFrames ?? 0;
    this.frameDuration = options.frameDuration ?? 33; // ms
    this.playbackSpeed = options.playbackSpeed ?? 1;
    this.isLooping = options.isLooping !== false;

    // Transform state
    this.currentTransform = options.currentTransform ?? {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 }
    };

    this.targetTransform = options.targetTransform ?? null;
    this.transitionDuration = options.transitionDuration ?? 0;
    this.transitionElapsed = 0;

    // Health/Damage
    this.health = options.health ?? 100;
    this.maxHealth = options.maxHealth ?? 100;
    this.damageLastFrame = 0;
    this.damageTotalSession = 0;

    // Metadata
    this.metadata = options.metadata ?? {};

    // History tracking
    this.maxHistorySize = options.maxHistorySize ?? 100;
    this.stateHistory = [];
    this.animationHistory = [];
    this.transformHistory = [];

    // Statistics
    this.stats = {
      totalFramesProcessed: 0,
      totalAnimationsPlayed: 0,
      totalStateChanges: 0,
      totalTransformUpdates: 0,
      timeAnimating: 0,
      timePaused: 0,
      timeIdle: 0
    };

    // Listeners
    this.listeners = [];
  }

  // ═══════════════════════════════════════════════════════════════
  // STATE UPDATES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Update animation state
   * @param {string} newState - New animation state
   * @returns {boolean} success
   */
  setAnimationState(newState) {
    if (!Object.values(AnimationState).includes(newState)) {
      throw new Error(`Invalid animation state: ${newState}`);
    }

    if (newState !== this.animationState) {
      this.animationState = newState;
      this.stats.totalStateChanges++;
      this.lastUpdated = Date.now();
      this._notifyListeners('animationStateChanged', { from: this.animationState, to: newState });
    }

    return true;
  }

  /**
   * Update character state
   * @param {string} newState - New character state
   * @returns {boolean} success
   */
  setCharacterState(newState) {
    if (!Object.values(CharacterState).includes(newState)) {
      throw new Error(`Invalid character state: ${newState}`);
    }

    if (newState !== this.characterState) {
      const oldState = this.characterState;
      this.characterState = newState;
      this.stats.totalStateChanges++;
      this.lastUpdated = Date.now();
      this._notifyListeners('characterStateChanged', { from: oldState, to: newState });
    }

    return true;
  }

  /**
   * Start animation
   * @param {string} animationName - Animation to play
   * @param {object} options - Animation options
   * @returns {boolean} success
   */
  playAnimation(animationName, options = {}) {
    try {
      this.currentAnimation = animationName;
      this.currentFrame = options.startFrame ?? 0;
      this.totalFrames = options.totalFrames ?? 0;
      this.frameDuration = options.frameDuration ?? 33;
      this.playbackSpeed = options.playbackSpeed ?? 1;
      this.isLooping = options.isLooping !== false;

      this.setAnimationState(AnimationState.PLAYING);
      this.stats.totalAnimationsPlayed++;

      this._recordAnimationEvent({
        action: 'play',
        animation: animationName,
        options
      });

      this._notifyListeners('animationStarted', { animation: animationName });
      return true;
    } catch (error) {
      console.error(`[${this.characterId}] Error playing animation:`, error);
      return false;
    }
  }

  /**
   * Pause current animation
   * @returns {boolean} success
   */
  pauseAnimation() {
    if (this.animationState === AnimationState.PLAYING) {
      this.setAnimationState(AnimationState.PAUSED);
      this._recordAnimationEvent({
        action: 'pause',
        frame: this.currentFrame
      });
      this._notifyListeners('animationPaused', { frame: this.currentFrame });
      return true;
    }
    return false;
  }

  /**
   * Resume paused animation
   * @returns {boolean} success
   */
  resumeAnimation() {
    if (this.animationState === AnimationState.PAUSED) {
      this.setAnimationState(AnimationState.PLAYING);
      this._recordAnimationEvent({
        action: 'resume',
        frame: this.currentFrame
      });
      this._notifyListeners('animationResumed', { frame: this.currentFrame });
      return true;
    }
    return false;
  }

  /**
   * Stop animation
   * @returns {boolean} success
   */
  stopAnimation() {
    if (this.animationState !== AnimationState.STOPPED) {
      this.setAnimationState(AnimationState.STOPPED);
      this.currentFrame = 0;
      this._recordAnimationEvent({
        action: 'stop',
        animation: this.currentAnimation
      });
      this._notifyListeners('animationStopped', { animation: this.currentAnimation });
      return true;
    }
    return false;
  }

  /**
   * Update current frame
   * @param {number} frameNumber - New frame number
   * @returns {boolean} success
   */
  setFrame(frameNumber) {
    if (frameNumber < 0 || frameNumber >= this.totalFrames) {
      throw new Error(`Frame ${frameNumber} out of range [0, ${this.totalFrames})`);
    }

    this.currentFrame = frameNumber;
    this.stats.totalFramesProcessed++;
    this.lastUpdated = Date.now();

    return true;
  }

  /**
   * Update transform
   * @param {object} transform - {position, rotation, scale}
   * @param {boolean} recordHistory - Whether to record in history
   * @returns {boolean} success
   */
  setTransform(transform, recordHistory = true) {
    try {
      if (!transform || !transform.position) {
        throw new Error('Invalid transform object');
      }

      if (recordHistory) {
        this._recordTransformUpdate(this.currentTransform, transform);
      }

      this.currentTransform = {
        position: { ...transform.position },
        rotation: transform.rotation ?? 0,
        scale: { ...transform.scale } ?? { x: 1, y: 1 }
      };

      this.stats.totalTransformUpdates++;
      this.lastUpdated = Date.now();

      return true;
    } catch (error) {
      console.error(`[${this.characterId}] Error setting transform:`, error);
      return false;
    }
  }

  /**
   * Apply transform transition
   * @param {object} targetTransform - Target transform
   * @param {number} duration - Duration in ms
   * @returns {boolean} success
   */
  startTransformTransition(targetTransform, duration) {
    try {
      if (!targetTransform || !targetTransform.position) {
        throw new Error('Invalid target transform');
      }

      if (duration <= 0) {
        throw new Error('Duration must be positive');
      }

      this.targetTransform = {
        position: { ...targetTransform.position },
        rotation: targetTransform.rotation ?? 0,
        scale: { ...targetTransform.scale } ?? { x: 1, y: 1 }
      };

      this.transitionDuration = duration;
      this.transitionElapsed = 0;
      this.setAnimationState(AnimationState.TRANSITIONING);

      this._notifyListeners('transitionStarted', { duration });
      return true;
    } catch (error) {
      console.error(`[${this.characterId}] Error starting transition:`, error);
      return false;
    }
  }

  /**
   * Update ongoing transition
   * @param {number} deltaTime - Time delta in ms
   * @returns {boolean} transition complete
   */
  updateTransition(deltaTime) {
    if (this.animationState !== AnimationState.TRANSITIONING || !this.targetTransform) {
      return false;
    }

    this.transitionElapsed += deltaTime;

    if (this.transitionElapsed >= this.transitionDuration) {
      // Transition complete
      this.setTransform(this.targetTransform, true);
      this.targetTransform = null;
      this.setAnimationState(this.currentAnimation ? AnimationState.PLAYING : AnimationState.IDLE);
      this._notifyListeners('transitionComplete', {});
      return true;
    }

    // Interpolate
    const progress = this.transitionElapsed / this.transitionDuration;
    const interpolated = this._interpolateTransforms(
      this.currentTransform,
      this.targetTransform,
      progress
    );

    this.currentTransform = interpolated;
    return false;
  }

  /**
   * Apply damage
   * @param {number} amount - Damage amount
   * @returns {boolean} character still alive
   */
  takeDamage(amount) {
    if (amount <= 0) {
      throw new Error('Damage amount must be positive');
    }

    this.damageLastFrame = amount;
    this.damageTotalSession += amount;
    this.health = Math.max(0, this.health - amount);

    this._recordStateEvent({
      type: 'damage',
      amount,
      healthAfter: this.health
    });

    if (this.health <= 0) {
      this.setCharacterState(CharacterState.DEAD);
      this._notifyListeners('characterDied', { totalDamage: this.damageTotalSession });
      return false;
    }

    if (this.health < this.maxHealth * 0.25) {
      this.setCharacterState(CharacterState.DAMAGED);
    } else {
      this.setCharacterState(CharacterState.ALIVE);
    }

    this._notifyListeners('damageTaken', { amount, healthRemaining: this.health });
    return true;
  }

  /**
   * Heal damage
   * @param {number} amount - Heal amount
   */
  heal(amount) {
    if (amount <= 0) {
      throw new Error('Heal amount must be positive');
    }

    const oldHealth = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);

    this._recordStateEvent({
      type: 'heal',
      amount,
      healthAfter: this.health
    });

    if (this.health === this.maxHealth) {
      this.setCharacterState(CharacterState.ALIVE);
    }

    this._notifyListeners('healed', { amount, healthNow: this.health });
  }

  /**
   * Set visibility
   * @param {boolean} visible - Visible state
   */
  setVisible(visible) {
    this.isVisible = visible;
    this._recordStateEvent({
      type: 'visibility',
      visible
    });
    this._notifyListeners('visibilityChanged', { visible });
  }

  /**
   * Set opacity
   * @param {number} opacity - Opacity (0-1)
   */
  setOpacity(opacity) {
    if (opacity < 0 || opacity > 1) {
      throw new Error('Opacity must be between 0 and 1');
    }

    this.opacity = opacity;
    this._recordStateEvent({
      type: 'opacity',
      opacity
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // STATE RETRIEVAL
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get current complete state snapshot
   * @returns {object} state snapshot
   */
  getSnapshot() {
    return {
      characterId: this.characterId,
      timestamp: Date.now(),
      animation: {
        state: this.animationState,
        name: this.currentAnimation,
        frame: this.currentFrame,
        totalFrames: this.totalFrames,
        playbackSpeed: this.playbackSpeed,
        isLooping: this.isLooping
      },
      character: {
        state: this.characterState,
        health: this.health,
        maxHealth: this.maxHealth,
        isVisible: this.isVisible,
        opacity: this.opacity,
        zIndex: this.zIndex
      },
      transform: {
        current: { ...this.currentTransform },
        target: this.targetTransform ? { ...this.targetTransform } : null,
        transitioning: this.animationState === AnimationState.TRANSITIONING,
        transitionProgress: this.transitionDuration > 0 ? this.transitionElapsed / this.transitionDuration : 0
      },
      metadata: { ...this.metadata },
      stats: { ...this.stats }
    };
  }

  /**
   * Get animation state info
   * @returns {object} animation info
   */
  getAnimationInfo() {
    return {
      state: this.animationState,
      name: this.currentAnimation,
      frame: this.currentFrame,
      totalFrames: this.totalFrames,
      progress: this.totalFrames > 0 ? (this.currentFrame / this.totalFrames * 100).toFixed(2) + '%' : 'N/A',
      duration: this.totalFrames * this.frameDuration,
      playbackSpeed: this.playbackSpeed,
      isLooping: this.isLooping
    };
  }

  /**
   * Get character health info
   * @returns {object} health info
   */
  getHealthInfo() {
    return {
      current: this.health,
      maximum: this.maxHealth,
      percentage: ((this.health / this.maxHealth) * 100).toFixed(2) + '%',
      state: this.characterState,
      damageThisFrame: this.damageLastFrame,
      damageTotal: this.damageTotalSession
    };
  }

  /**
   * Get history
   * @param {string} historyType - 'state', 'animation', or 'transform'
   * @returns {array} history entries
   */
  getHistory(historyType = 'state') {
    switch (historyType) {
      case 'animation':
        return [...this.animationHistory];
      case 'transform':
        return [...this.transformHistory];
      case 'state':
      default:
        return [...this.stateHistory];
    }
  }

  /**
   * Get statistics
   * @returns {object} detailed statistics
   */
  getStats() {
    const lifespan = Date.now() - this.createdAt;
    return {
      ...this.stats,
      lifespan,
      uptime: lifespan,
      averageFramesPerSecond: (this.stats.totalFramesProcessed / (lifespan / 1000)).toFixed(2),
      averageAnimationsPerMinute: (this.stats.totalAnimationsPlayed / (lifespan / 60000)).toFixed(2)
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // LISTENERS & NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add event listener
   * @param {function} listener - Callback function
   */
  addEventListener(listener) {
    if (typeof listener === 'function') {
      this.listeners.push(listener);
    }
  }

  /**
   * Remove event listener
   * @param {function} listener - Callback function
   */
  removeEventListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners
   * @private
   */
  _notifyListeners(eventType, eventData) {
    const event = {
      type: eventType,
      characterId: this.characterId,
      timestamp: Date.now(),
      data: eventData
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error(`[${this.characterId}] Listener error:`, error);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HISTORY RECORDING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Record state change to history
   * @private
   */
  _recordStateEvent(event) {
    this.stateHistory.push({
      timestamp: Date.now(),
      ...event
    });

    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  /**
   * Record animation event
   * @private
   */
  _recordAnimationEvent(event) {
    this.animationHistory.push({
      timestamp: Date.now(),
      ...event
    });

    if (this.animationHistory.length > this.maxHistorySize) {
      this.animationHistory.shift();
    }
  }

  /**
   * Record transform update
   * @private
   */
  _recordTransformUpdate(fromTransform, toTransform) {
    this.transformHistory.push({
      timestamp: Date.now(),
      from: { ...fromTransform },
      to: { ...toTransform }
    });

    if (this.transformHistory.length > this.maxHistorySize) {
      this.transformHistory.shift();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Interpolate between two transforms
   * @private
   */
  _interpolateTransforms(from, to, t) {
    return {
      position: {
        x: from.position.x + (to.position.x - from.position.x) * t,
        y: from.position.y + (to.position.y - from.position.y) * t
      },
      rotation: from.rotation + (to.rotation - from.rotation) * t,
      scale: {
        x: from.scale.x + (to.scale.x - from.scale.x) * t,
        y: from.scale.y + (to.scale.y - from.scale.y) * t
      }
    };
  }

  /**
   * Clone state
   * @returns {TransformLoggerState} cloned instance
   */
  clone() {
    const cloned = new TransformLoggerState(this.characterId + '_clone', {
      animationState: this.animationState,
      characterState: this.characterState,
      isVisible: this.isVisible,
      opacity: this.opacity,
      zIndex: this.zIndex,
      health: this.health,
      maxHealth: this.maxHealth,
      metadata: this.metadata
    });
    cloned.currentFrame = this.currentFrame;
    cloned.currentTransform = { ...this.currentTransform };
    cloned.stateHistory = [...this.stateHistory];
    cloned.animationHistory = [...this.animationHistory];
    cloned.transformHistory = [...this.transformHistory];
    return cloned;
  }

  /**
   * Reset all state
   */
  reset() {
    this.animationState = AnimationState.STOPPED;
    this.characterState = CharacterState.ALIVE;
    this.currentAnimation = null;
    this.currentFrame = 0;
    this.health = this.maxHealth;
    this.damageLastFrame = 0;
    this.damageTotalSession = 0;
    this.stateHistory = [];
    this.animationHistory = [];
    this.transformHistory = [];
    this.stats = {
      totalFramesProcessed: 0,
      totalAnimationsPlayed: 0,
      totalStateChanges: 0,
      totalTransformUpdates: 0,
      timeAnimating: 0,
      timePaused: 0,
      timeIdle: 0
    };
    this.createdAt = Date.now();
  }
}

export default TransformLoggerState;
export { AnimationState, CharacterState };
