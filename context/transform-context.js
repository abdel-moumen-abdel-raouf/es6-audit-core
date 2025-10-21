/**
 * TransformContext Module
 * Hierarchical transform tracking for logging system
 *
 * Features:
 * - Object transform storage (position, rotation, scale)
 * - Hierarchical relationships (parent-child)
 * - World transform computation
 * - Transform state snapshots
 * - Validation and error handling
 *
 * @module TransformContext
 */

/**
 * Simple Transform representation
 * Stores position, rotation (radians), and scale
 */
class SimpleTransform {
  constructor(position = { x: 0, y: 0 }, rotation = 0, scale = { x: 1, y: 1 }) {
    this.position = { ...position };
    this.rotation = rotation; // radians
    this.scale = { ...scale };
    this.createdAt = Date.now();
  }

  /**
   * Clone transform
   * @returns {SimpleTransform} independent copy
   */
  clone() {
    return new SimpleTransform(this.position, this.rotation, this.scale);
  }

  /**
   * Convert to JSON
   * @returns {object} serializable transform data
   */
  toJSON() {
    return {
      position: { ...this.position },
      rotation: this.rotation,
      scale: { ...this.scale },
      createdAt: this.createdAt,
    };
  }

  /**
   * Compose two transforms (multiply)
   * compose(parent, child) returns the world transform of child when parent is parent
   * Formula: position' = parent.rotate(child.position * parent.scale) + parent.position
   *          rotation' = child.rotation + parent.rotation
   *          scale' = child.scale * parent.scale
   * @param {SimpleTransform} parent - Parent transform
   * @param {SimpleTransform} child - Child transform
   * @returns {SimpleTransform} composed transform (world transform)
   */
  static compose(parent, child) {
    // Compose rotation: child rotation + parent rotation
    const composedRotation = child.rotation + parent.rotation;

    // Compose position: apply parent's rotation+scale to child's position, then add parent's position
    const cos = Math.cos(parent.rotation);
    const sin = Math.sin(parent.rotation);

    // Scale child position by parent scale
    const scaledX = child.position.x * parent.scale.x;
    const scaledY = child.position.y * parent.scale.y;

    // Rotate the scaled position by parent's rotation
    const rotatedX = scaledX * cos - scaledY * sin;
    const rotatedY = scaledX * sin + scaledY * cos;

    // Add parent's position
    const composedPosition = {
      x: rotatedX + parent.position.x,
      y: rotatedY + parent.position.y,
    };

    // Compose scale: child scale multiplied by parent scale
    const composedScale = {
      x: child.scale.x * parent.scale.x,
      y: child.scale.y * parent.scale.y,
    };

    return new SimpleTransform(composedPosition, composedRotation, composedScale);
  }

  /**
   * Check if transform is identity
   * @returns {boolean}
   */
  isIdentity() {
    return (
      this.position.x === 0 &&
      this.position.y === 0 &&
      this.rotation === 0 &&
      this.scale.x === 1 &&
      this.scale.y === 1
    );
  }

  /**
   * Get string representation
   * @returns {string}
   */
  toString() {
    return `Transform(pos:[${this.position.x.toFixed(2)},${this.position.y.toFixed(2)}], rot:${((this.rotation * 180) / Math.PI).toFixed(2)}°, scale:[${this.scale.x.toFixed(2)},${this.scale.y.toFixed(2)}])`;
  }
}

/**
 * TransformContext Class
 * Manages hierarchical transform tracking for objects
 */
class TransformContext {
  /**
   * Create transform context
   * @param {object} options - Configuration options
   */
  constructor(options = {}) {
    this.transforms = new Map(); // objectId -> SimpleTransform
    this.hierarchies = new Map(); // objectId -> parentId
    this.names = new Map(); // objectId -> name
    this.metadata = new Map(); // objectId -> custom metadata
    this.worldTransformCache = new Map(); // objectId -> cached world transform
    this.dirtyFlags = new Set(); // objectIds that need world transform recomputation
    this.maxCacheSize = options.maxCacheSize ?? 1000;
    this.cacheHitCount = 0;
    this.cacheMissCount = 0;
    this.stats = {
      totalObjects: 0,
      totalHierarchies: 0,
      cacheHitRate: 0,
      lastUpdate: null,
    };
  }

  /**
   * Set local transform for object
   * @param {string} objectId - Object identifier
   * @param {SimpleTransform|object} transform - Transform or transform data
   * @throws {Error} if transform invalid
   */
  setTransform(objectId, transform) {
    if (!objectId || typeof objectId !== 'string') {
      throw new Error('objectId must be non-empty string');
    }

    let t = transform;
    if (!(transform instanceof SimpleTransform)) {
      if (typeof transform !== 'object' || !transform || !transform.position) {
        throw new Error('transform must be SimpleTransform or object with position property');
      }
      t = new SimpleTransform(
        transform.position,
        transform.rotation ?? 0,
        transform.scale ?? { x: 1, y: 1 }
      );
    }

    this.transforms.set(objectId, t);
    this._invalidateWorldTransform(objectId);
    this.stats.lastUpdate = Date.now();
  }

  /**
   * Get local transform for object
   * @param {string} objectId - Object identifier
   * @returns {SimpleTransform|null} transform or null if not set
   */
  getTransform(objectId) {
    const t = this.transforms.get(objectId);
    return t ? t.clone() : null;
  }

  /**
   * Set parent relationship
   * @param {string} objectId - Child object
   * @param {string|null} parentId - Parent object (null to remove parent)
   * @throws {Error} if circular hierarchy detected
   */
  setParent(objectId, parentId) {
    if (!objectId || typeof objectId !== 'string') {
      throw new Error('objectId must be non-empty string');
    }

    if (parentId !== null && typeof parentId !== 'string') {
      throw new Error('parentId must be string or null');
    }

    // Check for circular hierarchy
    if (parentId) {
      // Check 1: Is parentId already an ancestor of objectId?
      if (this._isAncestor(parentId, objectId)) {
        throw new Error(
          `Circular hierarchy detected: ${parentId} is already ancestor of ${objectId}`
        );
      }

      // Check 2: Is objectId already an ancestor of parentId?
      if (this._isAncestor(objectId, parentId)) {
        throw new Error(
          `Circular hierarchy detected: ${objectId} is already ancestor of ${parentId}`
        );
      }
    }

    this.hierarchies.set(objectId, parentId);
    this._invalidateWorldTransform(objectId);
    this.stats.lastUpdate = Date.now();
  }

  /**
   * Get parent ID
   * @param {string} objectId - Object identifier
   * @returns {string|null}
   */
  getParent(objectId) {
    return this.hierarchies.get(objectId) ?? null;
  }

  /**
   * Set object name
   * @param {string} objectId - Object identifier
   * @param {string} name - Display name
   */
  setName(objectId, name) {
    if (typeof name !== 'string') {
      throw new Error('name must be string');
    }
    this.names.set(objectId, name);
  }

  /**
   * Get object name
   * @param {string} objectId - Object identifier
   * @returns {string|null}
   */
  getName(objectId) {
    return this.names.get(objectId) ?? null;
  }

  /**
   * Set custom metadata
   * @param {string} objectId - Object identifier
   * @param {object} metadata - Metadata object
   */
  setMetadata(objectId, metadata) {
    if (typeof metadata !== 'object' || metadata === null) {
      throw new Error('metadata must be object');
    }
    this.metadata.set(objectId, { ...metadata });
  }

  /**
   * Get custom metadata
   * @param {string} objectId - Object identifier
   * @returns {object|null}
   */
  getMetadata(objectId) {
    const m = this.metadata.get(objectId);
    return m ? { ...m } : null;
  }

  /**
   * Get world transform for object
   * Computes by composing parent transforms up hierarchy
   * @param {string} objectId - Object identifier
   * @returns {SimpleTransform} world transform
   */
  getWorldTransform(objectId) {
    // Check cache first
    if (this.worldTransformCache.has(objectId) && !this.dirtyFlags.has(objectId)) {
      this.cacheHitCount++;
      return this.worldTransformCache.get(objectId).clone();
    }

    this.cacheMissCount++;

    // Get local transform
    const localTransform = this.transforms.get(objectId);
    if (!localTransform) {
      return new SimpleTransform(); // Identity transform
    }

    // Get parent transform
    const parentId = this.hierarchies.get(objectId);
    if (!parentId) {
      // No parent, local is world
      this.worldTransformCache.set(objectId, localTransform.clone());
      this.dirtyFlags.delete(objectId);
      return localTransform.clone();
    }

    // Compose with parent's world transform
    // Order: compose(parent, local) means parent * local
    const parentWorld = this.getWorldTransform(parentId);
    const worldTransform = SimpleTransform.compose(parentWorld, localTransform);

    this.worldTransformCache.set(objectId, worldTransform.clone());
    this.dirtyFlags.delete(objectId);

    return worldTransform;
  }

  /**
   * Get all ancestors of object
   * @param {string} objectId - Object identifier
   * @returns {string[]} array of ancestor IDs (immediate parent first)
   */
  getAncestors(objectId) {
    const ancestors = [];
    let current = this.hierarchies.get(objectId);

    while (current) {
      ancestors.push(current);
      current = this.hierarchies.get(current);
    }

    return ancestors;
  }

  /**
   * Get all descendants of object
   * @param {string} objectId - Object identifier
   * @returns {string[]} array of descendant IDs
   */
  getDescendants(objectId) {
    const descendants = [];

    for (const [id, parentId] of this.hierarchies.entries()) {
      if (parentId === objectId) {
        descendants.push(id);
        descendants.push(...this.getDescendants(id));
      }
    }

    return descendants;
  }

  /**
   * Get hierarchy level (depth from root)
   * @param {string} objectId - Object identifier
   * @returns {number} depth (0 = root, 1 = child of root, etc)
   */
  getHierarchyLevel(objectId) {
    return this.getAncestors(objectId).length;
  }

  /**
   * Get root object (topmost ancestor)
   * @param {string} objectId - Object identifier
   * @returns {string|null} root ID or null if objectId not found
   */
  getRoot(objectId) {
    if (!this.transforms.has(objectId) && !this.hierarchies.has(objectId)) {
      return null;
    }

    const ancestors = this.getAncestors(objectId);
    return ancestors.length > 0 ? ancestors[ancestors.length - 1] : objectId;
  }

  /**
   * Log event with transform context
   * Creates snapshot with world transform, parent info, and metadata
   * @param {string} objectId - Object identifier
   * @param {string} message - Log message
   * @param {object} additionalData - Additional log data
   * @returns {object} context-enriched log entry
   */
  log(objectId, message, additionalData = {}) {
    if (!objectId || typeof objectId !== 'string') {
      throw new Error('objectId must be non-empty string');
    }

    const worldTransform = this.getWorldTransform(objectId);
    const parentId = this.getParent(objectId);
    const ancestors = this.getAncestors(objectId);
    const name = this.getName(objectId);
    const metadata = this.getMetadata(objectId);

    return {
      objectId,
      message,
      timestamp: Date.now(),
      transform: worldTransform.toJSON(),
      hierarchy: {
        parentId,
        ancestors,
        level: ancestors.length,
        name,
      },
      metadata,
      additionalData,
    };
  }

  /**
   * Batch log multiple objects
   * @param {object} entries - Map of objectId -> {message, data}
   * @returns {object[]} array of log entries
   */
  batchLog(entries) {
    if (typeof entries !== 'object' || entries === null) {
      throw new Error('entries must be object');
    }

    const results = [];
    for (const [objectId, { message, data }] of Object.entries(entries)) {
      results.push(this.log(objectId, message, data));
    }
    return results;
  }

  /**
   * Clear transform for object and its descendants
   * @param {string} objectId - Object identifier
   * @param {boolean} recursive - If true, also clear descendants
   */
  clear(objectId, recursive = true) {
    if (recursive) {
      const descendants = this.getDescendants(objectId);
      for (const id of descendants) {
        this.transforms.delete(id);
        this.hierarchies.delete(id);
        this.names.delete(id);
        this.metadata.delete(id);
        this.worldTransformCache.delete(id);
        this.dirtyFlags.delete(id);
      }
    }

    this.transforms.delete(objectId);
    this.hierarchies.delete(objectId);
    this.names.delete(objectId);
    this.metadata.delete(objectId);
    this.worldTransformCache.delete(objectId);
    this.dirtyFlags.delete(objectId);

    this.stats.lastUpdate = Date.now();
  }

  /**
   * Clear all transforms and state
   */
  clearAll() {
    this.transforms.clear();
    this.hierarchies.clear();
    this.names.clear();
    this.metadata.clear();
    this.worldTransformCache.clear();
    this.dirtyFlags.clear();
    this.cacheHitCount = 0;
    this.cacheMissCount = 0;
    this.stats = {
      totalObjects: 0,
      totalHierarchies: 0,
      cacheHitRate: 0,
      lastUpdate: Date.now(),
    };
  }

  /**
   * Get statistics
   * @returns {object} context statistics
   */
  getStats() {
    const totalCacheAccess = this.cacheHitCount + this.cacheMissCount;
    return {
      totalObjects: this.transforms.size,
      totalHierarchies: this.hierarchies.size,
      cachedTransforms: this.worldTransformCache.size,
      cacheHitCount: this.cacheHitCount,
      cacheMissCount: this.cacheMissCount,
      cacheHitRate:
        totalCacheAccess > 0
          ? ((this.cacheHitCount / totalCacheAccess) * 100).toFixed(2) + '%'
          : '0%',
      dirtyCount: this.dirtyFlags.size,
      lastUpdate: this.stats.lastUpdate,
    };
  }

  /**
   * Get snapshot of entire state
   * @returns {object} state snapshot
   */
  getSnapshot() {
    const snapshot = {
      transforms: {},
      hierarchies: Object.fromEntries(this.hierarchies),
      names: Object.fromEntries(this.names),
      metadata: Object.fromEntries(this.metadata),
      timestamp: Date.now(),
    };

    for (const [id, transform] of this.transforms.entries()) {
      snapshot.transforms[id] = transform.toJSON();
    }

    return snapshot;
  }

  /**
   * Restore from snapshot
   * @param {object} snapshot - State snapshot
   */
  restoreFromSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('snapshot must be object');
    }

    this.clearAll();

    if (snapshot.transforms) {
      for (const [id, data] of Object.entries(snapshot.transforms)) {
        this.setTransform(id, data);
      }
    }

    if (snapshot.hierarchies) {
      for (const [id, parentId] of Object.entries(snapshot.hierarchies)) {
        if (parentId) {
          this.setParent(id, parentId);
        }
      }
    }

    if (snapshot.names) {
      for (const [id, name] of Object.entries(snapshot.names)) {
        this.setName(id, name);
      }
    }

    if (snapshot.metadata) {
      for (const [id, meta] of Object.entries(snapshot.metadata)) {
        this.setMetadata(id, meta);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Invalidate world transform cache for object and descendants
   * @private
   */
  _invalidateWorldTransform(objectId) {
    this.dirtyFlags.add(objectId);
    const descendants = this.getDescendants(objectId);
    for (const id of descendants) {
      this.dirtyFlags.add(id);
    }
  }

  /**
   * Check if ancestor is in hierarchy above descendant
   * @private
   */
  _isAncestor(ancestorId, objectId) {
    let current = this.hierarchies.get(objectId);
    while (current) {
      if (current === ancestorId) return true;
      current = this.hierarchies.get(current);
    }
    return false;
  }
}

export default TransformContext;
export { SimpleTransform };
