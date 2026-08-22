import { computeOpportunityLayout, opportunityPath } from './opportunity-layout.cjs'

export const VERSION = '1.1.0'

const SVG_NS = 'http://www.w3.org/2000/svg'
const STATUS_LABELS = Object.freeze({
  rapidly_expanding: 'Rapidly expanding',
  actively_improving: 'Actively improving',
  mature_but_useful: 'Mature but useful',
  locally_saturated: 'Locally saturated',
  constraint_bound: 'Constraint-bound',
  displaced_in_this_context: 'Displaced in this context',
  reopened_by_a_new_complement: 'Reopened by a new complement',
  evidence_mixed: 'Evidence mixed',
  not_yet_assessed: 'Not yet assessed'
})
const SHORT_STATUS_LABELS = Object.freeze({
  rapidly_expanding: 'Expanding',
  actively_improving: 'Improving',
  mature_but_useful: 'Mature',
  locally_saturated: 'Locally saturated',
  constraint_bound: 'Constraint-bound',
  displaced_in_this_context: 'Locally displaced',
  reopened_by_a_new_complement: 'Reopened',
  evidence_mixed: 'Mixed evidence',
  not_yet_assessed: 'Unassessed'
})

const DIRECTIONAL_RELATIONSHIPS = new Set([
  'adapts_formalism_from',
  'applied_to',
  'blocked_by',
  'candidate_application',
  'derives_from',
  'displaced_in_context_by',
  'documented_historical_influence',
  'enables',
  'improves',
  'mitigates_constraint',
  'reopened_by'
])

function svgElement (name, attributes = {}, text) {
  const element = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attributes)) {
    if (value != null) element.setAttribute(key, String(value))
  }
  if (text != null) element.textContent = String(text)
  return element
}

function domElement (name, attributes = {}, text) {
  const element = document.createElement(name)
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') element.className = value
    else if (key === 'dataset') Object.assign(element.dataset, value)
    else if (key in element && key !== 'role') element[key] = value
    else element.setAttribute(key, value)
  }
  if (text != null) element.textContent = String(text)
  return element
}

function clamp (value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function cssNumber (element, name, fallback) {
  const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}

function hexToRgba (value) {
  const hex = value.slice(1)
  if (![3, 4, 6, 8].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) return null
  const expanded = hex.length < 5 ? [...hex].map(character => character + character).join('') : hex
  return [
    Number.parseInt(expanded.slice(0, 2), 16) / 255,
    Number.parseInt(expanded.slice(2, 4), 16) / 255,
    Number.parseInt(expanded.slice(4, 6), 16) / 255,
    expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1
  ]
}

function cssColorToRgba (value) {
  const normalized = String(value || '').trim()
  if (normalized.startsWith('#')) return hexToRgba(normalized)
  const match = normalized.match(/^rgba?\(\s*([^)]*)\)$/i)
  if (!match) return null
  const channels = match[1].split(/[\s,/]+/).filter(Boolean)
  if (channels.length < 3 || channels.length > 4) return null
  const rgb = channels.slice(0, 3).map(channel => channel.endsWith('%')
    ? clamp(Number.parseFloat(channel) / 100, 0, 1)
    : clamp(Number.parseFloat(channel) / 255, 0, 1))
  const alpha = channels[3] == null
    ? 1
    : channels[3].endsWith('%')
      ? clamp(Number.parseFloat(channels[3]) / 100, 0, 1)
      : clamp(Number.parseFloat(channels[3]), 0, 1)
  return [...rgb, alpha]
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

function yearLabel (node) {
  if (!node || node.yearPrecision === 'undated') return 'Date unassessed'
  if (Number.isFinite(Number(node.year)) && Number.isFinite(Number(node.yearEnd)) && Number(node.yearEnd) !== Number(node.year)) {
    return `${node.year}\u2013${node.yearEnd}`
  }
  if (Number.isFinite(Number(node.year))) return node.yearPrecision === 'ongoing' ? `${node.year}\u2013present` : String(node.year)
  return node.type === 'open_opportunity' ? 'Open frontier' : 'Date unassessed'
}

function evidenceGrade (relationship) {
  return relationship && relationship.evidence && relationship.evidence.grade
    ? relationship.evidence.grade
    : 'unassessed'
}

function nodeLabel (node) {
  const status = node && node.status ? STATUS_LABELS[node.status.state] || node.status.state : 'Status unassessed'
  return `${node.title}. ${yearLabel(node)}. ${status}. Open details.`
}

function titleLines (title, maximum = 24) {
  const words = String(title || '').trim().split(/\s+/)
  const lines = ['', '']
  for (const word of words) {
    const index = lines[0].length < maximum ? 0 : 1
    if (index === 1 && lines[1].length + word.length + 1 > maximum + 5) {
      lines[1] = `${lines[1].replace(/[.,;:]$/, '')}\u2026`
      break
    }
    lines[index] = `${lines[index]} ${word}`.trim()
  }
  return lines.filter(Boolean)
}

function typedAtlasIds (node) {
  return Array.isArray(node && node.atlasLinks)
    ? node.atlasLinks.map(link => link && link.atlasNodeId).filter(Boolean)
    : []
}

function createUnavailable (reason, onError) {
  const error = new Error(reason)
  if (typeof onError === 'function') onError(error)
  return {
    available: false,
    reason,
    select: () => false,
    selectByAtlasNode: () => false,
    clearSelection: () => {},
    getNodeElement: () => undefined,
    setBand: () => false,
    fit: () => {},
    zoomBy: () => false,
    resize: () => {},
    refresh: () => {},
    getState: () => ({ bandId: 'all', selectedId: null, zoom: 1 }),
    destroy: () => {}
  }
}

export function create ({ container, payload, onNodeActivate, onSelectionChange, onStateChange, onError } = {}) {
  try {
    if (!(container instanceof HTMLElement)) return createUnavailable('Opportunity View host is missing.', onError)
    if (!payload || !payload.metadata || !Array.isArray(payload.nodes) || !Array.isArray(payload.relationships)) {
      return createUnavailable('Opportunity View data is missing or invalid.', onError)
    }

    const canvas = container.querySelector('#opportunityCanvas')
    const branchSelect = container.querySelector('#opportunityBandSelect')
    const status = container.querySelector('#opportunityStatus')
    const outline = container.querySelector('#opportunityOutline')
    if (!canvas || !branchSelect || !status || !outline) return createUnavailable('Opportunity View controls are incomplete.', onError)

    const layout = computeOpportunityLayout(payload)
    const nodeById = new Map(payload.nodes.map(node => [node.id, node]))
    const relationshipById = new Map(payload.relationships.map(edge => [edge.id, edge]))
    const branchById = new Map((payload.applicationBranches || []).map(branch => [branch.id, branch]))
    const layoutById = layout.byId
    const nodeElements = new Map()
    const edgeElements = new Map()
    let selectedId = null
    let branchId = 'all'
    let zoom = 1
    let translateX = 0
    let translateY = 0
    let destroyed = false
    let graphGroup
    let svg
    let visibleNodeIds = new Set()
    let visibleRelationshipIds = new Set()
    let pointerState = null
    const activePointers = new Map()
    let pinchState = null

    function populateBranchSelect () {
      branchSelect.replaceChildren()
      branchSelect.appendChild(domElement('option', { value: 'all' }, 'All application branches'))
      for (const branch of payload.applicationBranches || []) {
        branchSelect.appendChild(domElement('option', { value: branch.id }, branch.title))
      }
      branchSelect.value = branchId
    }

    function visibleSets () {
      if (branchId === 'all' || !branchById.has(branchId)) {
        return {
          nodes: new Set(payload.nodes.map(node => node.id)),
          relationships: new Set(payload.relationships.map(edge => edge.id))
        }
      }
      const branch = branchById.get(branchId)
      return {
        nodes: new Set(branch.nodeIds || []),
        relationships: new Set(branch.relationshipIds || [])
      }
    }

    function updateTransform () {
      if (graphGroup) graphGroup.setAttribute('transform', `translate(${translateX} ${translateY}) scale(${zoom})`)
      if (svg) {
        const bounds = canvas.getBoundingClientRect()
        const baseScale = Math.min(bounds.width / layout.width, bounds.height / layout.height)
        svg.classList.toggle('is-overview', baseScale > 0 && 11.5 * zoom * baseScale < 8.5)
        updateOverviewLabels(baseScale, bounds)
      }
    }

    function updateOverviewLabels (baseScale, bounds) {
      if (!svg) return
      const overview = svg.classList.contains('is-overview')
      for (const element of nodeElements.values()) {
        element.classList.remove('is-overview-label')
        element.removeAttribute('data-overview-label')
        element.querySelectorAll('.opportunityNodeTitle').forEach((title, index) => {
          title.style.removeProperty('display')
          title.style.removeProperty('font-size')
          title.style.removeProperty('paint-order')
          title.style.removeProperty('stroke')
          title.style.removeProperty('stroke-width')
          title.style.removeProperty('stroke-linejoin')
          title.setAttribute('x', '18')
          title.setAttribute('y', String(15 + index * 13))
          title.removeAttribute('text-anchor')
        })
      }
      if (!overview || !(baseScale > 0)) return

      const maximum = bounds.width <= 700 ? 4 : 8
      const occupied = []
      const candidateIds = []
      const seen = new Set()
      const add = id => {
        if (id && visibleNodeIds.has(id) && !seen.has(id)) {
          seen.add(id)
          candidateIds.push(id)
        }
      }
      add(selectedId)
      add(branchById.get(branchId)?.anchorNodeId)
      layout.nodes.filter(position => visibleNodeIds.has(position.id) && position.node.type === 'open_opportunity')
        .sort((left, right) => left.x - right.x || left.y - right.y || left.id.localeCompare(right.id))
        .forEach(position => add(position.id))

      const renderedWidth = layout.width * baseScale
      const renderedHeight = layout.height * baseScale
      const offsetX = Math.max(0, (bounds.width - renderedWidth) / 2)
      const offsetY = Math.max(0, (bounds.height - renderedHeight) / 2)
      const actualScale = Math.max(0.01, baseScale * zoom)
      for (const id of candidateIds) {
        if (occupied.length >= maximum) break
        const position = layoutById.get(id)
        const element = nodeElements.get(id)
        if (!position || !element) continue
        const x = offsetX + (position.cx * zoom + translateX) * baseScale
        const y = offsetY + (position.cy * zoom + translateY) * baseScale
        const width = Math.min(190, Math.max(76, position.node.title.length * 6.1 + 18))
        const height = 26
        const rectangle = { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 }
        const force = id === selectedId
        if (!force && (rectangle.right < 0 || rectangle.left > bounds.width || rectangle.bottom < 0 || rectangle.top > bounds.height)) continue
        if (!force && occupied.some(item => !(rectangle.right < item.left || rectangle.left > item.right || rectangle.bottom < item.top || rectangle.top > item.bottom))) continue
        occupied.push(rectangle)
        element.classList.add('is-overview-label')
        element.dataset.overviewLabel = id === selectedId ? 'selected' : 'frontier'
        element.querySelectorAll('.opportunityNodeTitle').forEach((title, index) => {
          title.style.display = 'block'
          title.style.fontSize = `${11.5 / actualScale}px`
          title.style.paintOrder = 'stroke'
          title.style.stroke = 'var(--surface)'
          title.style.strokeWidth = `${3 / actualScale}px`
          title.style.strokeLinejoin = 'round'
          title.setAttribute('x', String(position.width / 2))
          title.setAttribute('y', String((-8 + index * 13) / actualScale))
          title.setAttribute('text-anchor', 'middle')
        })
      }
    }

    function makeDefinitions () {
      const defs = svgElement('defs')
      const marker = svgElement('marker', {
        id: 'opportunityArrow',
        markerWidth: 8,
        markerHeight: 8,
        refX: 7,
        refY: 4,
        orient: 'auto',
        markerUnits: 'strokeWidth'
      })
      marker.appendChild(svgElement('path', { d: 'M 0 0 L 8 4 L 0 8 z', fill: 'context-stroke' }))
      defs.appendChild(marker)
      return defs
    }

    function renderBands () {
      const group = svgElement('g', { 'aria-hidden': 'true' })
      for (const band of layout.bands) {
        group.appendChild(svgElement('rect', {
          class: 'opportunityBand',
          x: band.x,
          y: band.y,
          width: band.width,
          height: band.height,
          rx: 9
        }))
        group.appendChild(svgElement('line', {
          class: 'opportunityBandRule',
          x1: layout.options.left - 16,
          y1: band.y + 35,
          x2: layout.width - layout.options.right + 16,
          y2: band.y + 35
        }))
        group.appendChild(svgElement('text', {
          class: 'opportunityBandLabel',
          x: 16,
          y: band.y + 24
        }, band.label))
        if (band.id === 'band-frontier') {
          group.appendChild(svgElement('rect', {
            class: 'opportunityFrontier',
            x: layout.options.left - 16,
            y: band.y + 39,
            width: layout.width - layout.options.left - layout.options.right + 32,
            height: Math.max(42, band.height - 48),
            rx: 8
          }))
        }
      }
      for (const tick of layout.timeTicks) {
        group.appendChild(svgElement('line', {
          class: 'opportunityTimeRule',
          x1: tick.x,
          y1: layout.options.top,
          x2: tick.x,
          y2: layout.height - layout.options.bottom
        }))
        group.appendChild(svgElement('text', {
          class: 'opportunityTimeLabel',
          x: tick.x,
          y: 18,
          'text-anchor': 'middle'
        }, tick.year))
      }
      graphGroup.appendChild(group)
    }

    function renderEdges () {
      const group = svgElement('g', { class: 'opportunityEdges', 'aria-hidden': 'true' })
      let index = 0
      for (const relationship of payload.relationships) {
        if (!visibleRelationshipIds.has(relationship.id) || !visibleNodeIds.has(relationship.sourceNodeId) || !visibleNodeIds.has(relationship.targetNodeId)) continue
        const source = layoutById.get(relationship.sourceNodeId)
        const target = layoutById.get(relationship.targetNodeId)
        const pathData = opportunityPath(source, target, relationship, index++)
        if (!pathData) continue
        const path = svgElement('path', {
          class: `opportunityEdge evidence-${evidenceGrade(relationship)}`,
          d: pathData,
          'data-relationship-id': relationship.id,
          'data-relationship-type': relationship.type,
          'data-directional': DIRECTIONAL_RELATIONSHIPS.has(relationship.type) ? 'true' : 'false',
          'data-visual-state': 'context'
        })
        path.appendChild(svgElement('title', {}, `${relationship.type.replaceAll('_', ' ')}; ${evidenceGrade(relationship)} evidence`))
        group.appendChild(path)
        edgeElements.set(relationship.id, path)
      }
      graphGroup.appendChild(group)
    }

    function renderNode (position) {
      const node = position.node
      const group = svgElement('g', {
        class: 'opportunityNode',
        transform: `translate(${position.x} ${position.y})`,
        role: 'button',
        tabindex: '-1',
        'aria-label': nodeLabel(node),
        'aria-pressed': 'false',
        'aria-expanded': 'false',
        'data-node-id': node.id,
        'data-node-type': node.type,
        'data-visual-state': 'context'
      })
      group.appendChild(svgElement('rect', {
        class: 'opportunityNodeBox',
        width: position.width,
        height: position.height,
        rx: 8
      }))
      group.appendChild(svgElement('circle', { class: 'opportunityNodeGlyph', cx: 10, cy: 12, r: 3.4 }))
      const lines = titleLines(node.title)
      lines.forEach((line, index) => {
        group.appendChild(svgElement('text', {
          class: 'opportunityNodeTitle',
          x: 18,
          y: 15 + index * 13
        }, line))
      })
      group.appendChild(svgElement('text', {
        class: 'opportunityNodeMeta',
        x: 10,
        y: position.height - 8
      }, `${yearLabel(node)} \u00b7 ${SHORT_STATUS_LABELS[node.status && node.status.state] || 'Unassessed'}`))
      group.addEventListener('click', event => activateNode(node.id, group, event))
      group.addEventListener('keydown', event => handleNodeKeydown(event, node.id))
      nodeElements.set(node.id, group)
      return group
    }

    function renderNodes () {
      const group = svgElement('g', { class: 'opportunityNodes' })
      for (const position of layout.nodes) {
        if (visibleNodeIds.has(position.id)) group.appendChild(renderNode(position))
      }
      graphGroup.appendChild(group)
      const first = layout.nodes.find(position => visibleNodeIds.has(position.id))
      if (first && nodeElements.has(first.id)) nodeElements.get(first.id).tabIndex = 0
    }

    function renderPendingNote () {
      if (payload.metadata.status !== 'pending_research') return
      const group = svgElement('g', { 'aria-hidden': 'true' })
      group.appendChild(svgElement('line', {
        class: 'opportunityPlaceholderLine',
        x1: layout.options.left + 240,
        y1: layout.height / 2,
        x2: layout.width - layout.options.right - 80,
        y2: layout.height / 2
      }))
      group.appendChild(svgElement('text', {
        class: 'opportunityPlaceholderText',
        x: layout.width / 2,
        y: layout.height / 2 - 14,
        'text-anchor': 'middle'
      }, 'Research scaffold: no opportunity claims have been imported yet.'))
      graphGroup.appendChild(group)
    }

    function renderOutline () {
      outline.replaceChildren()
      for (const band of layout.bands) {
        const items = layout.nodes.filter(position => position.bandId === band.id && visibleNodeIds.has(position.id))
        if (!items.length) continue
        const section = domElement('section', { className: 'opportunityOutlineGroup' })
        section.appendChild(domElement('h2', {}, band.label))
        const list = domElement('ul')
        for (const item of items) {
          const listItem = domElement('li')
          const button = domElement('button', {
            type: 'button',
            className: 'opportunityOutlineButton',
            dataset: { opportunityOutlineId: item.id }
          })
          button.append(document.createTextNode(item.node.title))
          button.appendChild(domElement('span', { className: 'opportunityOutlineMeta' }, `${yearLabel(item.node)} \u00b7 ${STATUS_LABELS[item.node.status && item.node.status.state] || 'Status unassessed'}`))
          button.addEventListener('click', () => activateNode(item.id, button))
          listItem.appendChild(button)
          list.appendChild(listItem)
        }
        section.appendChild(list)
        outline.appendChild(section)
      }
    }

    function updateStatus () {
      const branch = branchById.get(branchId)
      const selected = selectedId ? nodeById.get(selectedId) : null
      const scope = branch ? branch.title : 'All application branches'
      const overview = svg?.classList.contains('is-overview') ? ' Overview mode: a bounded set of open-frontier labels remains visible; zoom for every label.' : ''
      status.textContent = selected
        ? `${scope}. ${visibleNodeIds.size} developments and opportunities shown. Selected: ${selected.title}.`
        : `${scope}. ${visibleNodeIds.size} developments and opportunities and ${visibleRelationshipIds.size} relationships shown. Select a node for evidence and research details.${overview}`
    }

    function resetEdgeInlineStyle (element) {
      element.style.removeProperty('opacity')
      element.style.removeProperty('stroke')
      element.style.removeProperty('stroke-width')
      element.style.removeProperty('marker-end')
      element.removeAttribute('data-contrast-fallback')
    }

    function focusEdgeStyle (element) {
      resetEdgeInlineStyle(element)
      const canvasStyle = getComputedStyle(canvas)
      const background = cssColorToRgba(canvasStyle.getPropertyValue('--surface')) || cssColorToRgba(canvasStyle.backgroundColor) || [0.055, 0.067, 0.09, 1]
      const computedStroke = cssColorToRgba(getComputedStyle(element).stroke)
      const target = clamp(cssNumber(canvas, '--opportunity-edge-focus-contrast', 3), 1, 21)
      const preferredOpacity = clamp(cssNumber(canvas, '--opportunity-edge-focus-opacity', 0.96), 0, 1)
      let stroke = computedStroke
      let minimum = stroke ? minimumContrastAlpha(stroke, background, target) : undefined
      if (minimum == null) {
        const focusValue = canvasStyle.getPropertyValue('--opportunity-edge-focus').trim() || canvasStyle.getPropertyValue('--focus').trim()
        const focusColor = cssColorToRgba(focusValue)
        const focusMinimum = focusColor ? minimumContrastAlpha(focusColor, background, target) : undefined
        if (focusMinimum != null) {
          element.style.stroke = focusValue
          stroke = focusColor
          minimum = focusMinimum
          element.dataset.contrastFallback = 'focus'
        }
      }
      if (minimum == null) {
        const black = [0, 0, 0, 1]
        const white = [1, 1, 1, 1]
        const fallback = contrastRatio(black, background) >= contrastRatio(white, background) ? black : white
        element.style.stroke = fallback === black ? '#000' : '#fff'
        minimum = minimumContrastAlpha(fallback, background, target) ?? 1
        element.dataset.contrastFallback = 'monochrome'
      }
      element.style.opacity = String(Math.max(preferredOpacity, minimum))
      element.style.strokeWidth = String(clamp(cssNumber(canvas, '--opportunity-edge-focus-width', 2.75), 1, 8))
      element.style.markerEnd = element.dataset.directional === 'true' ? 'url(#opportunityArrow)' : 'none'
    }

    function updateHighlight () {
      const relatedNodes = new Set(selectedId ? [selectedId] : [])
      const relatedEdges = new Set()
      if (selectedId) {
        for (const edge of payload.relationships) {
          if (!visibleRelationshipIds.has(edge.id)) continue
          if (edge.sourceNodeId === selectedId || edge.targetNodeId === selectedId) {
            relatedEdges.add(edge.id)
            relatedNodes.add(edge.sourceNodeId)
            relatedNodes.add(edge.targetNodeId)
          }
        }
      }
      if (graphGroup) graphGroup.classList.toggle('has-selection', Boolean(selectedId))
      for (const [id, element] of nodeElements) {
        const selected = id === selectedId
        const related = Boolean(selectedId && relatedNodes.has(id))
        element.classList.toggle('is-selected', selected)
        element.classList.toggle('is-related', related)
        element.classList.toggle('is-dim', Boolean(selectedId && !relatedNodes.has(id)))
        element.dataset.visualState = selected ? 'selected' : related ? 'related' : selectedId ? 'muted' : 'context'
        element.setAttribute('aria-pressed', String(selected))
        element.tabIndex = selected ? 0 : -1
      }
      if (!selectedId) {
        const first = layout.nodes.find(position => visibleNodeIds.has(position.id))
        if (first && nodeElements.has(first.id)) nodeElements.get(first.id).tabIndex = 0
      }
      for (const [id, element] of edgeElements) {
        const related = relatedEdges.has(id)
        element.classList.toggle('is-related', related)
        element.dataset.visualState = related ? 'focus' : selectedId ? 'muted' : 'context'
        if (related) focusEdgeStyle(element)
        else {
          resetEdgeInlineStyle(element)
          element.style.markerEnd = 'none'
          if (selectedId) element.style.opacity = String(clamp(cssNumber(canvas, '--opportunity-edge-muted-opacity', 0.08), 0, 1))
        }
      }
      outline.querySelectorAll('[data-opportunity-outline-id]').forEach(button => {
        button.setAttribute('aria-current', button.dataset.opportunityOutlineId === selectedId ? 'true' : 'false')
      })
      if (svg) {
        const bounds = canvas.getBoundingClientRect()
        updateOverviewLabels(Math.min(bounds.width / layout.width, bounds.height / layout.height), bounds)
      }
      updateStatus()
    }

    function focusPosition (position, focusElement = true) {
      if (!position) return
      const bounds = canvas.getBoundingClientRect()
      const baseScale = Math.min(bounds.width / layout.width, bounds.height / layout.height)
      const readable = baseScale > 0 ? 11 / (11.5 * baseScale) : 1.55
      const desired = Math.max(zoom, readable, 1.55)
      zoom = clamp(desired, 0.7, 12)
      translateX = layout.width / 2 - position.cx * zoom
      translateY = layout.height / 2 - position.cy * zoom
      updateTransform()
      updateStatus()
      if (focusElement) requestAnimationFrame(() => nodeElements.get(position.id)?.focus({ preventScroll: true }))
    }

    function select (id, options = {}) {
      if (destroyed || !visibleNodeIds.has(id) || !nodeById.has(id)) return false
      if (selectedId && selectedId !== id) nodeElements.get(selectedId)?.setAttribute('aria-expanded', 'false')
      selectedId = id
      updateHighlight()
      if (options.focus !== false) focusPosition(layoutById.get(id), options.focusElement !== false)
      if (options.notify !== false && typeof onSelectionChange === 'function') onSelectionChange(nodeById.get(id), nodeElements.get(id))
      return true
    }

    function activateNode (id, element, event) {
      if (!select(id, { notify: true, focus: element instanceof SVGElement })) return
      const node = nodeById.get(id)
      nodeElements.get(id)?.setAttribute('aria-expanded', 'true')
      if (typeof onNodeActivate === 'function') onNodeActivate(node, element || nodeElements.get(id), event)
    }

    function clearSelection (options = {}) {
      if (selectedId) nodeElements.get(selectedId)?.setAttribute('aria-expanded', 'false')
      selectedId = null
      updateHighlight()
      if (options.notify !== false && typeof onSelectionChange === 'function') onSelectionChange(null)
    }

    function nearestNode (currentId, direction) {
      const current = layoutById.get(currentId)
      if (!current) return null
      const candidates = layout.nodes.filter(item => visibleNodeIds.has(item.id) && item.id !== currentId)
      const signed = candidates.filter(item => {
        if (direction === 'left') return item.cx < current.cx
        if (direction === 'right') return item.cx > current.cx
        if (direction === 'up') return item.cy < current.cy
        return item.cy > current.cy
      })
      return signed.sort((left, right) => {
        const leftPrimary = direction === 'left' || direction === 'right' ? Math.abs(left.cx - current.cx) : Math.abs(left.cy - current.cy)
        const rightPrimary = direction === 'left' || direction === 'right' ? Math.abs(right.cx - current.cx) : Math.abs(right.cy - current.cy)
        const leftSecondary = direction === 'left' || direction === 'right' ? Math.abs(left.cy - current.cy) : Math.abs(left.cx - current.cx)
        const rightSecondary = direction === 'left' || direction === 'right' ? Math.abs(right.cy - current.cy) : Math.abs(right.cx - current.cx)
        return leftPrimary + leftSecondary * 0.32 - (rightPrimary + rightSecondary * 0.32)
      })[0] || null
    }

    function handleNodeKeydown (event, id) {
      const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
      if (directions[event.key]) {
        event.preventDefault()
        const next = nearestNode(id, directions[event.key])
        if (next) {
          nodeElements.get(id).tabIndex = -1
          nodeElements.get(next.id).tabIndex = 0
          focusPosition(next, true)
        }
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        activateNode(id, nodeElements.get(id), event)
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        const ordered = layout.nodes.filter(item => visibleNodeIds.has(item.id)).sort((a, b) => a.cx - b.cx || a.cy - b.cy)
        const next = event.key === 'Home' ? ordered[0] : ordered[ordered.length - 1]
        if (next) {
          nodeElements.get(id).tabIndex = -1
          nodeElements.get(next.id).tabIndex = 0
          focusPosition(next, true)
        }
      }
    }

    function fit () {
      const items = layout.nodes.filter(item => visibleNodeIds.has(item.id))
      if (!items.length) {
        zoom = 1
        translateX = 0
        translateY = 0
        updateTransform()
        return
      }
      const minimumX = Math.min(...items.map(item => item.x)) - 55
      const maximumX = Math.max(...items.map(item => item.x + item.width)) + 55
      const minimumY = Math.min(...items.map(item => item.y)) - 55
      const maximumY = Math.max(...items.map(item => item.y + item.height)) + 55
      const compact = canvas.getBoundingClientRect().width > 0 && canvas.getBoundingClientRect().width <= 700
      if (compact) {
        const branch = branchById.get(branchId)
        const anchor = layoutById.get(branch?.anchorNodeId) || layoutById.get(selectedId) || items[0]
        zoom = 8
        translateX = layout.width / 2 - anchor.cx * zoom
        translateY = layout.height / 2 - anchor.cy * zoom
      } else {
        zoom = clamp(Math.min(layout.width / Math.max(1, maximumX - minimumX), layout.height / Math.max(1, maximumY - minimumY)), 0.72, 2.8)
        translateX = (layout.width - (minimumX + maximumX) * zoom) / 2
        translateY = (layout.height - (minimumY + maximumY) * zoom) / 2
      }
      updateTransform()
      updateStatus()
    }

    function zoomBy (factor) {
      const next = Number(factor)
      if (!Number.isFinite(next) || next <= 0) return false
      const before = zoom
      zoom = clamp(zoom * next, 0.55, 12)
      const centerX = (layout.width / 2 - translateX) / before
      const centerY = (layout.height / 2 - translateY) / before
      translateX = layout.width / 2 - centerX * zoom
      translateY = layout.height / 2 - centerY * zoom
      updateTransform()
      updateStatus()
      return true
    }

    function setBand (id) {
      const next = id === 'all' || branchById.has(id) ? id : 'all'
      if (branchId === next && svg) return true
      const previousSelection = selectedId
      branchId = next
      branchSelect.value = branchId
      render()
      fit()
      if (branchId !== 'all') {
        const anchor = layoutById.get(branchById.get(branchId)?.anchorNodeId)
        if (anchor) focusPosition(anchor, false)
      }
      if (previousSelection && !selectedId && typeof onSelectionChange === 'function') onSelectionChange(null)
      if (typeof onStateChange === 'function') onStateChange({ bandId: branchId, selectedId, zoom, translateX, translateY })
      return true
    }

    function render () {
      const sets = visibleSets()
      visibleNodeIds = sets.nodes
      visibleRelationshipIds = sets.relationships
      if (selectedId && !visibleNodeIds.has(selectedId)) selectedId = null
      nodeElements.clear()
      edgeElements.clear()
      canvas.replaceChildren()
      svg = svgElement('svg', {
        class: 'opportunityGraph',
        viewBox: `0 0 ${layout.width} ${layout.height}`,
        role: 'group',
        'aria-labelledby': 'opportunityTitle opportunityNote',
        preserveAspectRatio: 'xMidYMid meet'
      })
      svg.appendChild(makeDefinitions())
      graphGroup = svgElement('g', { class: 'opportunityGraphViewport' })
      svg.appendChild(graphGroup)
      renderBands()
      renderEdges()
      renderPendingNote()
      renderNodes()
      canvas.appendChild(svg)
      renderOutline()
      updateTransform()
      updateHighlight()
      bindPointerEvents()
    }

    function pointInViewBox (event) {
      try {
        const point = svg.createSVGPoint()
        point.x = event.clientX
        point.y = event.clientY
        const local = point.matrixTransform(svg.getScreenCTM().inverse())
        return { x: local.x, y: local.y }
      } catch (_) {}
      const bounds = svg.getBoundingClientRect()
      return {
        x: (event.clientX - bounds.left) * layout.width / Math.max(1, bounds.width),
        y: (event.clientY - bounds.top) * layout.height / Math.max(1, bounds.height)
      }
    }

    function bindPointerEvents () {
      svg.addEventListener('pointerdown', event => {
        if (event.target.closest('.opportunityNode')) return
        const point = pointInViewBox(event)
        activePointers.set(event.pointerId, point)
        pointerState = { id: event.pointerId, start: point, tx: translateX, ty: translateY }
        svg.setPointerCapture(event.pointerId)
        if (activePointers.size === 2) {
          const points = [...activePointers.values()]
          const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
          pinchState = {
            distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
            zoom,
            contentX: (center.x - translateX) / zoom,
            contentY: (center.y - translateY) / zoom
          }
          pointerState = null
        }
      })
      svg.addEventListener('pointermove', event => {
        const point = pointInViewBox(event)
        if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, point)
        if (pinchState && activePointers.size >= 2) {
          const points = [...activePointers.values()].slice(0, 2)
          const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
          const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
          zoom = clamp(pinchState.zoom * distance / Math.max(1, pinchState.distance), 0.55, 12)
          translateX = center.x - pinchState.contentX * zoom
          translateY = center.y - pinchState.contentY * zoom
          updateTransform()
        } else if (pointerState && pointerState.id === event.pointerId) {
          translateX = pointerState.tx + point.x - pointerState.start.x
          translateY = pointerState.ty + point.y - pointerState.start.y
          updateTransform()
        }
      })
      const finish = event => {
        activePointers.delete(event.pointerId)
        if (pointerState && pointerState.id === event.pointerId) pointerState = null
        if (activePointers.size < 2) pinchState = null
        if (activePointers.size === 1) {
          const [id, point] = activePointers.entries().next().value
          pointerState = { id, start: point, tx: translateX, ty: translateY }
        }
      }
      svg.addEventListener('pointerup', finish)
      svg.addEventListener('pointercancel', finish)
      svg.addEventListener('wheel', event => {
        event.preventDefault()
        zoomBy(event.deltaY < 0 ? 1.13 : 1 / 1.13)
      }, { passive: false })
    }

    function selectByAtlasNode (atlasNodeId, options = {}) {
      const matches = payload.nodes.filter(item => typedAtlasIds(item).includes(atlasNodeId)).sort((left, right) => {
        const leftSame = left.atlasLinks?.some(link => link.atlasNodeId === atlasNodeId && link.relation === 'same_as')
        const rightSame = right.atlasLinks?.some(link => link.atlasNodeId === atlasNodeId && link.relation === 'same_as')
        return Number(rightSame) - Number(leftSame) || Number(visibleNodeIds.has(right.id)) - Number(visibleNodeIds.has(left.id)) || left.id.localeCompare(right.id)
      })
      const node = matches[0]
      if (!node) return false
      if (!visibleNodeIds.has(node.id)) setBand('all')
      return select(node.id, options)
    }

    populateBranchSelect()
    branchSelect.addEventListener('change', () => setBand(branchSelect.value))
    render()
    fit()

    return {
      available: true,
      reason: null,
      select,
      selectByAtlasNode,
      clearSelection,
      getNodeElement: id => nodeElements.get(id),
      setBand,
      fit,
      zoomBy,
      resize: () => updateTransform(),
      refresh: () => {
        render()
        fit()
      },
      getState: () => ({ bandId: branchId, selectedId, zoom, translateX, translateY }),
      destroy: () => {
        destroyed = true
        canvas.replaceChildren()
        outline.replaceChildren()
        branchSelect.replaceChildren()
      }
    }
  } catch (error) {
    return createUnavailable(error && error.message ? error.message : 'Opportunity View failed to initialize.', onError)
  }
}
