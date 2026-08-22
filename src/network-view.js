import { Graph } from '@cosmos.gl/graph'

/**
 * Thin, deterministic adapter between the atlas data model and cosmos.gl.
 *
 * The host owns layout and meaning. It must provide stable node IDs and fixed
 * two-dimensional coordinates. This module only renders those coordinates and
 * translates WebGL interactions back to the host's original node/edge records.
 */

export const VERSION = '1.0.1'
export const COSMOS_GRAPH_VERSION = '3.4.0'

export const THEMES = Object.freeze({
  dark: Object.freeze({
    background: '#090d16',
    point: '#aab5c5',
    link: '#64748b',
    activeLink: '#f8fafc',
    greyPoint: '#657080',
    ring: '#f8fafc',
    outline: '#cbd5e1',
    linkFocusContrast: 3,
    linkGreyoutOpacity: 0.07,
    linkVisibilityMinTransparency: 0.45,
    highlightedLinkMinTransparency: 1,
    highlightedLinkWidth: 1.65,
    focusedLinkWidthIncrease: 2.5
  }),
  light: Object.freeze({
    background: '#f8fafc',
    point: '#334155',
    link: '#718096',
    activeLink: '#0f172a',
    greyPoint: '#94a3b8',
    ring: '#0f172a',
    outline: '#334155',
    linkFocusContrast: 3,
    linkGreyoutOpacity: 0.07,
    linkVisibilityMinTransparency: 0.45,
    highlightedLinkMinTransparency: 1,
    highlightedLinkWidth: 1.65,
    focusedLinkWidthIncrease: 2.5
  })
})

const NO_HIGHLIGHT = Object.freeze({
  nodeIds: undefined,
  edgeIds: undefined,
  outlineNodeIds: undefined,
  focusLinkId: undefined
})

function asElement (value) {
  if (typeof document === 'undefined') return null
  if (typeof value === 'string') return document.querySelector(value)
  return value instanceof HTMLElement ? value : null
}

function finite (value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function clamp (value, minimum, maximum, fallback) {
  const number = finite(value)
  return number == null ? fallback : Math.max(minimum, Math.min(maximum, number))
}

function iterableSet (value) {
  if (value == null) return undefined
  if (typeof value === 'string') return new Set([value])
  if (value instanceof Set) return new Set([...value].map(String))
  if (Array.isArray(value) || typeof value[Symbol.iterator] === 'function') {
    return new Set([...value].map(String))
  }
  return undefined
}

function hasOwn (object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function tableValue (table, key) {
  if (key == null || table == null) return undefined
  const value = table instanceof Map ? table.get(key) : table[key]
  if (typeof value === 'string' || Array.isArray(value)) return value
  return value?.color ?? value?.c ?? value?.value
}

function hexToRgba (value) {
  const hex = value.slice(1)
  if (![3, 4, 6, 8].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) return null
  const expanded = hex.length < 5 ? [...hex].map(character => character + character).join('') : hex
  const hasAlpha = expanded.length === 8
  return [
    parseInt(expanded.slice(0, 2), 16) / 255,
    parseInt(expanded.slice(2, 4), 16) / 255,
    parseInt(expanded.slice(4, 6), 16) / 255,
    hasAlpha ? parseInt(expanded.slice(6, 8), 16) / 255 : 1
  ]
}

function cssFunctionToRgba (value) {
  const match = value.match(/^rgba?\(\s*([^)]*)\)$/i)
  if (!match) return null
  const channels = match[1].split(/[\s,\/]+/).filter(Boolean)
  if (channels.length < 3 || channels.length > 4) return null
  const rgb = channels.slice(0, 3).map(channel => {
    if (channel.endsWith('%')) return clamp(parseFloat(channel) / 100, 0, 1, 0)
    return clamp(parseFloat(channel) / 255, 0, 1, 0)
  })
  const alpha = channels[3] == null
    ? 1
    : channels[3].endsWith('%')
      ? clamp(parseFloat(channels[3]) / 100, 0, 1, 1)
      : clamp(parseFloat(channels[3]), 0, 1, 1)
  return [...rgb, alpha]
}

function rgba (value, fallback) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (value.length < 3) return rgba(fallback, [0.5, 0.5, 0.5, 1])
    const scale = value.slice(0, 3).some(channel => Number(channel) > 1) ? 255 : 1
    return [
      clamp(Number(value[0]) / scale, 0, 1, 0),
      clamp(Number(value[1]) / scale, 0, 1, 0),
      clamp(Number(value[2]) / scale, 0, 1, 0),
      clamp(value[3] == null ? 1 : Number(value[3]), 0, 1, 1)
    ]
  }
  if (typeof value === 'string') {
    const normalized = value.trim()
    const parsed = normalized.startsWith('#')
      ? hexToRgba(normalized)
      : cssFunctionToRgba(normalized)
    if (parsed) return parsed
  }
  if (fallback != null && fallback !== value) return rgba(fallback)
  return [0.5, 0.5, 0.5, 1]
}

function writeColor (buffer, index, color) {
  const offset = index * 4
  buffer[offset] = color[0]
  buffer[offset + 1] = color[1]
  buffer[offset + 2] = color[2]
  buffer[offset + 3] = color[3]
}

function srgbChannelToLinear (channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function relativeLuminance (color) {
  return 0.2126 * srgbChannelToLinear(color[0]) +
    0.7152 * srgbChannelToLinear(color[1]) +
    0.0722 * srgbChannelToLinear(color[2])
}

function contrastRatio (first, second) {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second))
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (light + 0.05) / (dark + 0.05)
}

function compositeColor (foreground, background, alpha) {
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
    1
  ]
}

function minimumContrastAlpha (foreground, background, target) {
  if (contrastRatio(compositeColor(foreground, background, 1), background) < target) return undefined
  let low = 0
  let high = 1
  for (let index = 0; index < 14; index++) {
    const middle = (low + high) / 2
    if (contrastRatio(compositeColor(foreground, background, middle), background) >= target) high = middle
    else low = middle
  }
  return high
}

function readableLinkColor (baseColor, theme) {
  const background = rgba(theme.background, theme.name === 'light' ? '#f8fafc' : '#090d16')
  const target = clamp(theme.linkFocusContrast, 1, 21, 3)
  const candidates = [
    baseColor,
    rgba(theme.activeLink ?? theme.focusLink ?? theme.ring, theme.ring),
    contrastRatio([0, 0, 0, 1], background) >= contrastRatio([1, 1, 1, 1], background)
      ? [0, 0, 0, 1]
      : [1, 1, 1, 1]
  ]
  for (const candidate of candidates) {
    const minimum = minimumContrastAlpha(candidate, background, target)
    if (minimum != null) return [candidate[0], candidate[1], candidate[2], Math.max(candidate[3] ?? 1, minimum)]
  }
  return candidates[candidates.length - 1]
}

function nodeLaneId (node) {
  return node.laneId ?? node.lane ?? node.branchId
}

function nodeStatusId (node) {
  return node.statusId ?? node.statusCode ?? node.s ?? node.legacyClassification?.code
}

function readPositionValue (value) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return [finite(value[0]), finite(value[1])]
  }
  if (value && typeof value === 'object') {
    return [finite(value.x), finite(value.y)]
  }
  return [undefined, undefined]
}

function positionForNode (positions, node, index, nodeCount) {
  let value
  if (typeof positions === 'function') {
    value = positions(node, index)
  } else if (positions instanceof Map) {
    value = positions.get(node.id)
  } else if (ArrayBuffer.isView(positions)) {
    if (positions.length !== nodeCount * 2) {
      throw new RangeError(`Expected ${nodeCount * 2} position values; received ${positions.length}.`)
    }
    value = [positions[index * 2], positions[index * 2 + 1]]
  } else if (Array.isArray(positions)) {
    const isFlat = positions.length === nodeCount * 2 && positions.every(item => finite(item) != null)
    value = isFlat ? [positions[index * 2], positions[index * 2 + 1]] : positions[index]
  } else if (positions && typeof positions === 'object') {
    value = positions[node.id]
  }

  if (value == null) value = node.position ?? [node.x, node.y]
  const [x, y] = readPositionValue(value)
  if (x == null || y == null) {
    throw new TypeError(`Node "${node.id}" is missing a finite fixed x/y position.`)
  }
  return [x, y]
}

function normalizePositionSource (positions) {
  const source = positions?.nodes ?? positions
  if (Array.isArray(source) && source.length && source.every(value => value && typeof value === 'object' && value.id != null)) {
    return new Map(source.map(value => [String(value.id), value]))
  }
  return source
}

function endpointId (edge, side, nodes) {
  const source = side === 'source'
  const value = source
    ? edge.sourceNodeId ?? edge.sourceId ?? edge.source ?? edge.a
    : edge.targetNodeId ?? edge.targetId ?? edge.target ?? edge.b
  if (typeof value === 'number') return nodes[value]?.id
  if (value && typeof value === 'object') return value.id
  return value == null ? undefined : String(value)
}

function normalizeData ({ nodes, edges = [], positions, lanes = [], statusColors = {} }) {
  if (!Array.isArray(nodes)) throw new TypeError('NetworkAtlas requires a nodes array.')
  if (!Array.isArray(edges)) throw new TypeError('NetworkAtlas edges must be an array.')

  const nodeById = new Map()
  const positionSource = normalizePositionSource(positions)
  const normalizedNodes = nodes.map((record, index) => {
    const id = record?.id == null ? '' : String(record.id)
    if (!id) throw new TypeError(`Node at index ${index} has no stable id.`)
    if (nodeById.has(id)) throw new TypeError(`Duplicate node id "${id}".`)
    const node = { id, record, index, position: positionForNode(positionSource, record, index, nodes.length) }
    nodeById.set(id, node)
    return node
  })

  const edgeIds = new Set()
  const normalizedEdges = edges.map((record, index) => {
    const sourceId = endpointId(record, 'source', nodes)
    const targetId = endpointId(record, 'target', nodes)
    if (!nodeById.has(sourceId) || !nodeById.has(targetId)) {
      throw new TypeError(`Edge at index ${index} has an unknown endpoint (${sourceId ?? '?'} -> ${targetId ?? '?'}).`)
    }
    const id = record?.id == null ? `${sourceId}>${targetId}:${index}` : String(record.id)
    if (edgeIds.has(id)) throw new TypeError(`Duplicate edge id "${id}".`)
    edgeIds.add(id)
    return { id, record, index, sourceId, targetId }
  })

  const laneColors = new Map()
  const laneRecords = lanes instanceof Map
    ? [...lanes.entries()].map(([id, value]) => ({ id, ...(typeof value === 'object' ? value : { color: value }) }))
    : Array.isArray(lanes)
      ? lanes
      : Object.entries(lanes ?? {}).map(([id, value]) => ({ id, ...(typeof value === 'object' ? value : { color: value }) }))
  laneRecords.forEach(lane => {
    const id = lane?.id ?? lane?.code
    const color = lane?.color ?? lane?.c
    if (id != null && color != null) laneColors.set(String(id), color)
  })

  return {
    nodes: normalizedNodes,
    edges: normalizedEdges,
    nodeById,
    laneColors,
    statusColors
  }
}

function normalizeTheme (theme) {
  if (theme == null) return { name: 'dark', ...THEMES.dark }
  if (typeof theme === 'string') {
    const name = theme.toLowerCase() === 'light' ? 'light' : 'dark'
    return { name, ...THEMES[name] }
  }
  const name = theme.name === 'light' ? 'light' : 'dark'
  const normalized = { name, ...THEMES[name], ...theme }
  normalized.activeLink = theme.activeLink ?? theme.focusLink ?? theme.highlightLink ?? normalized.activeLink
  normalized.linkFocusContrast = clamp(theme.linkFocusContrast, 1, 21, normalized.linkFocusContrast)
  normalized.linkGreyoutOpacity = clamp(theme.linkGreyoutOpacity, 0, 1, normalized.linkGreyoutOpacity)
  normalized.linkVisibilityMinTransparency = clamp(theme.linkVisibilityMinTransparency, 0, 1, normalized.linkVisibilityMinTransparency)
  normalized.highlightedLinkMinTransparency = clamp(theme.highlightedLinkMinTransparency, 0, 1, normalized.highlightedLinkMinTransparency)
  normalized.highlightedLinkWidth = clamp(theme.highlightedLinkWidth, 0.25, 8, normalized.highlightedLinkWidth)
  normalized.focusedLinkWidthIncrease = clamp(theme.focusedLinkWidthIncrease, 0, 12, normalized.focusedLinkWidthIncrease)
  return normalized
}

function normalizeFilter (filter) {
  if (filter == null) return Object.freeze({})
  if (typeof filter === 'function') return Object.freeze({ node: filter })
  const directIds = iterableSet(filter)
  if (directIds) return Object.freeze({ nodeIds: directIds })
  if (typeof filter !== 'object') throw new TypeError('NetworkAtlas filter must be a predicate, iterable of node ids, object, or null.')
  return Object.freeze({
    nodeIds: iterableSet(filter.nodeIds ?? filter.nodes),
    edgeIds: iterableSet(filter.edgeIds ?? filter.edges),
    laneIds: iterableSet(filter.laneIds ?? filter.lanes),
    statusIds: iterableSet(filter.statusIds ?? filter.statuses),
    node: typeof filter.node === 'function' ? filter.node : undefined,
    edge: typeof filter.edge === 'function' ? filter.edge : undefined
  })
}

function normalizeHighlight (highlight) {
  if (highlight == null) return NO_HIGHLIGHT
  return Object.freeze({
    nodeIds: hasOwn(highlight, 'nodeIds') || hasOwn(highlight, 'nodes')
      ? iterableSet(highlight.nodeIds ?? highlight.nodes) ?? new Set()
      : undefined,
    edgeIds: hasOwn(highlight, 'edgeIds') || hasOwn(highlight, 'edges')
      ? iterableSet(highlight.edgeIds ?? highlight.edges) ?? new Set()
      : undefined,
    outlineNodeIds: hasOwn(highlight, 'outlineNodeIds') || hasOwn(highlight, 'outlines')
      ? iterableSet(highlight.outlineNodeIds ?? highlight.outlines) ?? new Set()
      : undefined,
    focusLinkId: highlight.focusLinkId ?? highlight.focusEdgeId
  })
}

function passesNodeFilter (node, filter) {
  const record = node.record
  if (filter.nodeIds && !filter.nodeIds.has(node.id)) return false
  if (filter.laneIds && !filter.laneIds.has(String(nodeLaneId(record)))) return false
  if (filter.statusIds && !filter.statusIds.has(String(nodeStatusId(record)))) return false
  return filter.node ? Boolean(filter.node(record, node.index)) : true
}

function linkStyle (record) {
  const value = record.style ?? record.linkStyle
  if (value === 1 || value === '1' || value === 'dashed' || value === 'dash') return 1
  if (value === 2 || value === '2' || value === 'dotted' || value === 'dot') return 2
  return 0
}

function buildVisibleState (data, filter, theme, defaults) {
  const nodes = data.nodes.filter(node => passesNodeFilter(node, filter))
  const indexById = new Map(nodes.map((node, index) => [node.id, index]))
  const edges = data.edges.filter(edge => {
    if (!indexById.has(edge.sourceId) || !indexById.has(edge.targetId)) return false
    if (filter.edgeIds && !filter.edgeIds.has(edge.id)) return false
    if (!filter.edge) return true
    return Boolean(filter.edge(edge.record, edge.index, data.nodeById.get(edge.sourceId).record, data.nodeById.get(edge.targetId).record))
  })
  const edgeIndexById = new Map(edges.map((edge, index) => [edge.id, index]))

  const positions = new Float32Array(nodes.length * 2)
  const pointColors = new Float32Array(nodes.length * 4)
  const pointSizes = new Float32Array(nodes.length)
  nodes.forEach((node, index) => {
    positions[index * 2] = node.position[0]
    positions[index * 2 + 1] = node.position[1]
    const record = node.record
    const color = record.color ??
      tableValue(data.statusColors, nodeStatusId(record)) ??
      data.laneColors.get(String(nodeLaneId(record))) ??
      theme.point
    writeColor(pointColors, index, rgba(color, theme.point))
    pointSizes[index] = clamp(record.networkSize ?? record.pointSize ?? record.size, 2, 24, defaults.pointSize)
  })

  const links = new Float32Array(edges.length * 2)
  const linkColors = new Float32Array(edges.length * 4)
  const linkWidths = new Float32Array(edges.length)
  const linkStyles = new Float32Array(edges.length)
  const linkArrows = new Array(edges.length)
  edges.forEach((edge, index) => {
    links[index * 2] = indexById.get(edge.sourceId)
    links[index * 2 + 1] = indexById.get(edge.targetId)
    writeColor(linkColors, index, rgba(edge.record.color ?? theme.link, theme.link))
    linkWidths[index] = clamp(edge.record.width ?? edge.record.linkWidth, 0.25, 8, defaults.linkWidth)
    linkStyles[index] = linkStyle(edge.record)
    linkArrows[index] = Boolean(edge.record.arrow ?? edge.record.arrows ?? false)
  })

  return {
    nodes,
    edges,
    indexById,
    edgeIndexById,
    positions,
    pointColors,
    pointSizes,
    links,
    linkColors,
    baseLinkColors: linkColors.slice(),
    linkWidths,
    baseLinkWidths: linkWidths.slice(),
    linkStyles,
    linkArrows
  }
}

function highlightedLinkBuffers (visible, highlight, theme) {
  const colors = visible.baseLinkColors.slice()
  const widths = visible.baseLinkWidths.slice()
  const activeIds = new Set(highlight.edgeIds ?? [])
  if (highlight.focusLinkId != null) activeIds.add(String(highlight.focusLinkId))
  for (const id of activeIds) {
    const index = visible.edgeIndexById.get(id)
    if (index == null) continue
    const offset = index * 4
    const readable = readableLinkColor([
      visible.baseLinkColors[offset],
      visible.baseLinkColors[offset + 1],
      visible.baseLinkColors[offset + 2],
      visible.baseLinkColors[offset + 3]
    ], theme)
    writeColor(colors, index, readable)
    widths[index] = Math.max(widths[index], theme.highlightedLinkWidth)
  }
  return { colors, widths }
}

function renderFallback (container, message) {
  if (!container) return null
  const fallback = document.createElement('div')
  fallback.dataset.networkAtlasFallback = 'true'
  fallback.setAttribute('role', 'status')
  fallback.style.cssText = 'box-sizing:border-box;display:grid;place-items:center;min-height:12rem;padding:2rem;text-align:center;color:inherit;background:inherit;font:500 0.95rem/1.5 system-ui,sans-serif;'
  fallback.textContent = message
  container.replaceChildren(fallback)
  return fallback
}

export function getSupport () {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { supported: false, reason: 'Network view requires a browser.' }
  }
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
    if (!context) return { supported: false, reason: 'WebGL 2 is unavailable on this device.' }
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return { supported: true, reason: null }
  } catch (error) {
    return { supported: false, reason: error instanceof Error ? error.message : 'WebGL 2 initialization failed.' }
  }
}

export function isSupported () {
  return getSupport().supported
}

class UnavailableNetworkAtlas {
  constructor (container, reason, error, onError) {
    this.available = false
    this.reason = reason
    this.error = error
    this.ready = Promise.resolve(false)
    this.fallback = renderFallback(container, `${reason} Use the Timeline or List view instead.`)
    if (typeof onError === 'function') onError(error ?? new Error(reason), { phase: 'initialize', fatal: true })
  }

  setData () { return false }
  setFilter () { return false }
  setTheme () { return false }
  setHighlight () { return false }
  highlightNeighborhood () { return false }
  focus () { return false }
  clearFocus () { return false }
  fit () { return false }
  zoomBy () { return false }
  getZoomLevel () { return undefined }
  hasNode () { return false }
  getNode () { return undefined }
  getNodeScreenPosition () { return undefined }
  getSampledNodes () { return [] }
  spaceToScreenPosition () { return undefined }
  getState () { return { available: false, reason: this.reason, nodeCount: 0, edgeCount: 0 } }
  destroy () { this.fallback?.remove() }
}

class NetworkAtlasController {
  constructor (options) {
    this.available = true
    this.destroyed = false
    this.container = options.container
    this.callbacks = {
      onNodeClick: options.onNodeClick,
      onNodeHover: options.onNodeHover,
      onLinkClick: options.onLinkClick,
      onLinkHover: options.onLinkHover,
      onBackgroundClick: options.onBackgroundClick,
      onZoom: options.onZoom,
      onError: options.onError,
      onReady: options.onReady
    }
    this.focusOnClick = Boolean(options.focusOnClick)
    this.theme = normalizeTheme(options.theme)
    this.defaults = {
      pointSize: clamp(options.pointSize, 2, 24, 5.5),
      linkWidth: clamp(options.linkWidth, 0.25, 8, 0.8)
    }
    this.labelNodeIds = iterableSet(options.labelNodeIds ?? options.labelNodes) ?? new Set()
    this.labelPriority = typeof options.labelPriority === 'function' ? options.labelPriority : undefined
    this.filter = normalizeFilter(options.filter)
    this.highlight = normalizeHighlight(options.highlight)
    this.focusNodeId = options.focusNodeId == null ? undefined : String(options.focusNodeId)

    this.graph = new Graph(this.container, this.graphConfig(options))
    if (!this.setData(options)) {
      const error = this.lastError ?? new Error('NetworkAtlas rejected the initial graph data.')
      try { this.graph.destroy() } catch {}
      throw error
    }
    this.ready = this.graph.ready.then(() => {
      if (this.destroyed) return false
      if (options.fitOnInit !== false) this.fit(undefined, { duration: 0, padding: options.fitPadding })
      if (typeof this.callbacks.onReady === 'function') this.callbacks.onReady(this)
      return true
    }).catch(error => {
      this.fail(error, 'initialize')
      return false
    })
  }

  graphConfig (options) {
    return {
      enableSimulation: false,
      transitionDuration: 0,
      backgroundColor: this.theme.background,
      pointDefaultColor: this.theme.point,
      pointDefaultSize: this.defaults.pointSize,
      pointGreyoutColor: this.theme.greyPoint,
      pointGreyoutOpacity: 0.16,
      linkDefaultColor: this.theme.link,
      linkDefaultWidth: this.defaults.linkWidth,
      linkGreyoutOpacity: this.theme.linkGreyoutOpacity,
      focusedLinkWidthIncrease: this.theme.focusedLinkWidthIncrease,
      renderHoveredPointRing: true,
      hoveredPointRingColor: this.theme.ring,
      focusedPointRingColor: this.theme.ring,
      outlinedPointRingColor: this.theme.outline,
      hoveredPointCursor: 'pointer',
      enableDrag: false,
      enableZoom: options.enableZoom !== false,
      enableSimulationDuringZoom: false,
      fitViewOnInit: false,
      rescalePositions: false,
      randomSeed: options.randomSeed ?? 'ai-research-tech-tree-network-v1',
      attribution: '',
      scalePointsOnZoom: false,
      scaleLinksOnZoom: false,
      curvedLinks: false,
      linkVisibilityDistanceRange: [80, 800],
      linkVisibilityMinTransparency: this.theme.linkVisibilityMinTransparency,
      pointSamplingDistance: clamp(options.pointSamplingDistance, 16, 300, 96),
      onPointClick: (index, position, event) => this.handleNodeClick(index, position, event),
      onPointMouseOver: (index, position, event) => this.handleNodeHover(index, position, event),
      onPointMouseOut: event => this.handleNodeHover(undefined, undefined, event),
      onLinkClick: (index, event) => this.handleLinkClick(index, event),
      onLinkMouseOver: index => this.handleLinkHover(index),
      onLinkMouseOut: event => this.handleLinkHover(undefined, event),
      onBackgroundClick: event => this.callbacks.onBackgroundClick?.(event, this),
      onZoom: (event, userDriven) => this.callbacks.onZoom?.({ event, userDriven, controller: this })
    }
  }

  notifyError (error, phase, fatal = false) {
    this.callbacks.onError?.(error, { phase, fatal, controller: this })
  }

  fail (error, phase) {
    if (this.destroyed) return
    this.available = false
    this.reason = error instanceof Error ? error.message : String(error)
    this.notifyError(error instanceof Error ? error : new Error(this.reason), phase, true)
    try { this.graph?.destroy() } catch {}
    renderFallback(this.container, 'The network view could not start on this device. Use the Timeline or List view instead.')
  }

  setData (input) {
    if (this.destroyed || !this.available) return false
    try {
      const data = normalizeData(input)
      const visible = buildVisibleState(data, this.filter, this.theme, this.defaults)
      this.data = data
      this.visible = visible
      this.lastError = undefined
      this.applyVisibleState()
      return true
    } catch (error) {
      this.lastError = error
      this.notifyError(error, 'data', false)
      return false
    }
  }

  applyVisibleState () {
    const view = this.visible
    this.graph.setPointPositions(view.positions, true)
    this.graph.setPointColors(view.pointColors)
    this.graph.setPointSizes(view.pointSizes)
    this.graph.setLinks(view.links)
    this.graph.setLinkColors(view.linkColors)
    this.graph.setLinkWidths(view.linkWidths)
    this.graph.setLinkStyles(view.linkStyles)
    this.graph.setLinkArrows(view.linkArrows)
    this.applyVisualState()
    this.graph.render(undefined, 0)
  }

  applyVisualState () {
    const points = this.highlight.nodeIds == null
      ? undefined
      : [...this.highlight.nodeIds].map(id => this.visible.indexById.get(id)).filter(index => index != null)
    const links = this.highlight.edgeIds == null
      ? undefined
      : [...this.highlight.edgeIds].map(id => this.visible.edgeIndexById.get(id)).filter(index => index != null)
    const outlines = this.highlight.outlineNodeIds == null
      ? undefined
      : [...this.highlight.outlineNodeIds].map(id => this.visible.indexById.get(id)).filter(index => index != null)
    const focusPoint = this.focusNodeId == null ? undefined : this.visible.indexById.get(this.focusNodeId)
    const focusLink = this.highlight.focusLinkId == null
      ? undefined
      : this.visible.edgeIndexById.get(String(this.highlight.focusLinkId))
    const linkVisuals = highlightedLinkBuffers(this.visible, this.highlight, this.theme)
    const hasActiveLink = links?.length > 0 || focusLink != null
    this.graph.setLinkColors(linkVisuals.colors)
    this.graph.setLinkWidths(linkVisuals.widths)
    this.graph.setConfigPartial({
      highlightedPointIndices: points,
      highlightedLinkIndices: links,
      outlinedPointIndices: outlines,
      focusedPointIndex: focusPoint,
      focusedLinkIndex: focusLink,
      linkVisibilityMinTransparency: hasActiveLink
        ? this.theme.highlightedLinkMinTransparency
        : this.theme.linkVisibilityMinTransparency
    })
  }

  setFilter (filter) {
    if (this.destroyed || !this.available) return false
    try {
      const nextFilter = normalizeFilter(filter)
      const visible = buildVisibleState(this.data, nextFilter, this.theme, this.defaults)
      this.filter = nextFilter
      this.visible = visible
      this.applyVisibleState()
      return true
    } catch (error) {
      this.notifyError(error, 'filter', false)
      return false
    }
  }

  setTheme (theme) {
    if (this.destroyed || !this.available) return false
    try {
      const nextTheme = normalizeTheme(theme)
      const visible = buildVisibleState(this.data, this.filter, nextTheme, this.defaults)
      this.theme = nextTheme
      this.visible = visible
      this.graph.setConfigPartial({
        backgroundColor: nextTheme.background,
        pointDefaultColor: nextTheme.point,
        pointGreyoutColor: nextTheme.greyPoint,
        linkDefaultColor: nextTheme.link,
        linkGreyoutOpacity: nextTheme.linkGreyoutOpacity,
        focusedLinkWidthIncrease: nextTheme.focusedLinkWidthIncrease,
        hoveredPointRingColor: nextTheme.ring,
        focusedPointRingColor: nextTheme.ring,
        outlinedPointRingColor: nextTheme.outline
      })
      this.applyVisibleState()
      return true
    } catch (error) {
      this.notifyError(error, 'theme', false)
      return false
    }
  }

  setHighlight (highlight) {
    if (this.destroyed || !this.available) return false
    try {
      this.highlight = normalizeHighlight(highlight)
      this.applyVisualState()
      return true
    } catch (error) {
      this.notifyError(error, 'highlight', false)
      return false
    }
  }

  highlightNeighborhood (nodeId, options = {}) {
    const id = String(nodeId)
    if (!this.visible.indexById.has(id)) return false
    const edgeIds = new Set()
    const nodeIds = new Set(options.includeSelf === false ? [] : [id])
    this.visible.edges.forEach(edge => {
      if (edge.sourceId !== id && edge.targetId !== id) return
      edgeIds.add(edge.id)
      nodeIds.add(edge.sourceId)
      nodeIds.add(edge.targetId)
    })
    return this.setHighlight({
      nodeIds,
      edgeIds,
      outlineNodeIds: options.outline === false ? undefined : [id]
    })
  }

  focus (nodeId, options = {}) {
    if (this.destroyed || !this.available) return false
    const id = String(nodeId)
    const index = this.visible.indexById.get(id)
    if (index == null) return false
    this.focusNodeId = id
    if (options.highlightNeighborhood) this.highlightNeighborhood(id, options)
    this.applyVisualState()
    if (options.zoom !== false) {
      this.graph.zoomToPointByIndex(
        index,
        clamp(options.duration, 0, 5000, 250),
        clamp(options.scale, 0.1, 100, 3),
        options.canZoomOut !== false,
        false
      )
    }
    return true
  }

  clearFocus () {
    if (this.destroyed || !this.available) return false
    this.focusNodeId = undefined
    this.applyVisualState()
    return true
  }

  fit (nodeIds, options = {}) {
    if (this.destroyed || !this.available || !this.visible.nodes.length) return false
    const ids = iterableSet(nodeIds)
    const indices = ids == null
      ? this.visible.nodes.map((_, index) => index)
      : [...ids].map(id => this.visible.indexById.get(id)).filter(index => index != null)
    if (!indices.length) return false
    this.graph.fitViewByPointIndices(
      indices,
      clamp(options.duration, 0, 5000, 250),
      clamp(options.padding, 0, 0.8, 0.12),
      false
    )
    return true
  }

  getZoomLevel () {
    if (this.destroyed || !this.available || !this.graph?.isReady) return undefined
    try {
      return this.graph.getZoomLevel()
    } catch (error) {
      this.notifyError(error, 'zoom', false)
      return undefined
    }
  }

  zoomBy (factor, options = {}) {
    const current = this.getZoomLevel()
    const multiplier = finite(factor)
    if (current == null || multiplier == null || multiplier <= 0) return false
    try {
      const next = clamp(current * multiplier, 0.01, 1000, current)
      this.graph.zoom(next, clamp(options.duration, 0, 5000, 180), false)
      return true
    } catch (error) {
      this.notifyError(error, 'zoom', false)
      return false
    }
  }

  hasNode (nodeId) {
    return this.data?.nodeById.has(String(nodeId)) ?? false
  }

  getNode (nodeId) {
    return this.data?.nodeById.get(String(nodeId))?.record
  }

  getNodeScreenPosition (nodeId) {
    if (this.destroyed || !this.available || !this.graph?.isReady) return undefined
    const index = this.visible.indexById.get(String(nodeId))
    if (index == null) return undefined
    const offset = index * 2
    try {
      return this.graph.spaceToScreenPosition([
        this.visible.positions[offset],
        this.visible.positions[offset + 1]
      ])
    } catch (error) {
      this.notifyError(error, 'screen-position', false)
      return undefined
    }
  }

  spaceToScreenPosition (position) {
    if (this.destroyed || !this.available || !this.graph?.isReady) return undefined
    const [x, y] = readPositionValue(position)
    if (x == null || y == null) return undefined
    try {
      return this.graph.spaceToScreenPosition([x, y])
    } catch (error) {
      this.notifyError(error, 'screen-position', false)
      return undefined
    }
  }

  getSampledNodes (limit = 24) {
    if (this.destroyed || !this.available || !this.graph?.isReady) return []
    const maximum = Math.max(0, Math.min(this.visible.nodes.length, Math.floor(finite(limit) ?? 24)))
    if (!maximum) return []
    try {
      const sampled = this.graph.getSampledPointPositionsMap()
      const sampledIndices = [...sampled.keys()]
        .filter(index => this.visible.nodes[index])
        .sort((left, right) => left - right)
      const indices = []
      const seen = new Set()
      const addIndex = index => {
        if (index == null || !this.visible.nodes[index] || seen.has(index) || indices.length >= maximum) return
        seen.add(index)
        indices.push(index)
      }
      addIndex(this.visible.indexById.get(this.focusNodeId))
      for (const id of this.highlight.outlineNodeIds ?? []) addIndex(this.visible.indexById.get(id))
      for (const id of this.highlight.nodeIds ?? []) addIndex(this.visible.indexById.get(id))
      for (const id of this.labelNodeIds) addIndex(this.visible.indexById.get(id))
      const priorityNodes = this.visible.nodes.map((node, index) => {
        const record = node.record
        const explicit = finite(this.labelPriority?.(record, node.index) ?? record.networkLabelPriority ?? record.labelPriority)
        const frontier = record.isFrontier === true || record.frontier === true || record.type === 'open_opportunity' || String(nodeStatusId(record)) === 'g'
        return { index, priority: explicit ?? (frontier ? Number.MAX_SAFE_INTEGER : undefined) }
      }).filter(item => item.priority != null).sort((left, right) => left.priority - right.priority || left.index - right.index)
      for (const item of priorityNodes) addIndex(item.index)
      for (const index of sampledIndices.length ? sampledIndices : this.visible.nodes.map((_, index) => index)) addIndex(index)
      return indices.map(index => {
        const node = this.visible.nodes[index]
        const spacePosition = sampled.get(index) ?? [
          this.visible.positions[index * 2],
          this.visible.positions[index * 2 + 1]
        ]
        return {
          id: node.id,
          record: node.record,
          screenPosition: this.graph.spaceToScreenPosition(spacePosition)
        }
      })
    } catch (error) {
      this.notifyError(error, 'sample-labels', false)
      return []
    }
  }

  getState () {
    return {
      available: this.available,
      ready: Boolean(this.graph?.isReady),
      theme: this.theme.name,
      focusNodeId: this.focusNodeId,
      highlightedEdgeCount: this.highlight.edgeIds?.size ?? 0,
      linkFocusContrast: this.theme.linkFocusContrast,
      nodeCount: this.visible?.nodes.length ?? 0,
      edgeCount: this.visible?.edges.length ?? 0,
      totalNodeCount: this.data?.nodes.length ?? 0,
      totalEdgeCount: this.data?.edges.length ?? 0
    }
  }

  handleNodeClick (index, position, event) {
    const node = this.visible.nodes[index]
    if (!node) return
    if (this.focusOnClick) this.focus(node.id, { zoom: false })
    this.callbacks.onNodeClick?.(node.record, {
      id: node.id,
      index: node.index,
      visibleIndex: index,
      position,
      event,
      controller: this
    })
  }

  handleNodeHover (index, position, event) {
    const node = index == null ? undefined : this.visible.nodes[index]
    this.callbacks.onNodeHover?.(node?.record ?? null, {
      id: node?.id,
      index: node?.index,
      visibleIndex: index,
      position,
      event,
      controller: this
    })
  }

  handleLinkClick (index, event) {
    const edge = this.visible.edges[index]
    if (!edge) return
    this.callbacks.onLinkClick?.(edge.record, {
      id: edge.id,
      index: edge.index,
      visibleIndex: index,
      event,
      controller: this
    })
  }

  handleLinkHover (index, event) {
    const edge = index == null ? undefined : this.visible.edges[index]
    this.callbacks.onLinkHover?.(edge?.record ?? null, {
      id: edge?.id,
      index: edge?.index,
      visibleIndex: index,
      event,
      controller: this
    })
  }

  destroy () {
    if (this.destroyed) return
    this.destroyed = true
    this.available = false
    try { this.graph?.destroy() } catch {}
  }
}

/**
 * Create a deterministic network renderer.
 *
 * @param {object} options
 * @param {HTMLElement|string} options.container Target element or selector.
 * @param {Array<object>} options.nodes Records with stable `id` values.
 * @param {Array<object>} options.edges Records with source/target IDs.
 * @param {Float32Array|Array|Map|object|function} options.positions Fixed x/y positions.
 * @param {Iterable<string>} [options.labelNodeIds] Ordered IDs to return before sampled label candidates.
 * @param {function(object, number): number} [options.labelPriority] Optional lower-first label priority.
 * @param {string|object} [options.theme] Theme colors plus optional active-link contrast controls.
 * @returns {NetworkAtlasController|UnavailableNetworkAtlas}
 */
export function create (options = {}) {
  const container = asElement(options.container)
  if (!container) {
    return new UnavailableNetworkAtlas(null, 'Network view container was not found.', new Error('Network view container was not found.'), options.onError)
  }
  const support = getSupport()
  if (!support.supported) {
    return new UnavailableNetworkAtlas(container, support.reason, new Error(support.reason), options.onError)
  }
  try {
    return new NetworkAtlasController({ ...options, container })
  } catch (error) {
    return new UnavailableNetworkAtlas(
      container,
      'The network view could not be initialized.',
      error instanceof Error ? error : new Error(String(error)),
      options.onError
    )
  }
}
