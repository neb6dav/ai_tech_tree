'use strict'

const DEFAULT_OPTIONS = Object.freeze({
  width: 3200,
  left: 170,
  right: 90,
  top: 28,
  bottom: 54,
  nodeWidth: 176,
  nodeHeight: 52,
  nodeGap: 24,
  rowGap: 16,
  bandHeader: 48,
  bandFooter: 28,
  bandGap: 18
})

function finite (value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clamp (value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function nodeYear (node, domain) {
  if (Number.isFinite(Number(node && node.year)) && Number.isFinite(Number(node && node.yearEnd))) {
    return (Number(node.year) + Number(node.yearEnd)) / 2
  }
  if (Number.isFinite(Number(node && node.year))) return Number(node.year)
  if (node && node.type === 'open_opportunity') return domain.endYear
  return domain.startYear
}

function normalizedDomain (metadata) {
  const source = metadata && metadata.timeDomain ? metadata.timeDomain : {}
  const startYear = finite(source.startYear, 1900)
  const endYear = Math.max(startYear + 1, finite(source.endYear, startYear + 1))
  const focusStartYear = clamp(finite(source.focusStartYear, startYear), startYear + 1, endYear - 1)
  return { startYear, endYear, focusStartYear }
}

function timeRatio (year, domain, historicalShare = 0.24) {
  const value = clamp(year, domain.startYear, domain.endYear)
  if (value <= domain.focusStartYear) {
    return historicalShare * (value - domain.startYear) / Math.max(1, domain.focusStartYear - domain.startYear)
  }
  return historicalShare + (1 - historicalShare) * (value - domain.focusStartYear) / Math.max(1, domain.endYear - domain.focusStartYear)
}

/**
 * Produce deterministic, precomputed SVG geometry for an opportunity map.
 * Horizontal position carries time; vertical bands carry ontology. Within a
 * band, rows are only collision-avoidance lanes and have no semantic weight.
 */
function computeOpportunityLayout (payload, suppliedOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...suppliedOptions }
  const metadata = payload && payload.metadata ? payload.metadata : {}
  const domain = normalizedDomain(metadata)
  const bands = Array.isArray(metadata.visualBands)
    ? [...metadata.visualBands].sort((a, b) => finite(a.order, 0) - finite(b.order, 0) || String(a.id).localeCompare(String(b.id)))
    : []
  const bandIds = new Set(bands.map(band => band.id))
  const nodes = Array.isArray(payload && payload.nodes) ? payload.nodes : []
  const usableWidth = options.width - options.left - options.right - options.nodeWidth
  const positioned = []
  const bandLayouts = []
  let cursorY = options.top

  for (const band of bands) {
    const candidates = nodes
      .filter(node => node && node.bandId === band.id)
      .map(node => {
        const year = clamp(nodeYear(node, domain), domain.startYear, domain.endYear)
        const ratio = timeRatio(year, domain)
        return { node, year, targetX: options.left + ratio * usableWidth }
      })
      .sort((left, right) => left.targetX - right.targetX || String(left.node.id).localeCompare(String(right.node.id)))

    const rowStarts = []
    const assignments = []
    const maximumRows = 5
    for (const candidate of [...candidates].reverse()) {
      const eligible = rowStarts
        .map((start, row) => ({ start, row }))
        .filter(item => candidate.targetX + options.nodeWidth <= item.start - options.nodeGap)
        .sort((left, right) => left.start - right.start)
      let row = eligible[0]?.row
      let x = candidate.targetX
      if (row == null && rowStarts.length < maximumRows) {
        row = rowStarts.length
        rowStarts.push(Infinity)
      } else if (row == null) {
        row = rowStarts.map((start, index) => ({ start, index })).sort((left, right) => right.start - left.start || left.index - right.index)[0].index
        x = Math.min(candidate.targetX, rowStarts[row] - options.nodeGap - options.nodeWidth)
      }
      x = clamp(x, options.left, options.width - options.right - options.nodeWidth)
      rowStarts[row] = x
      assignments.push({ ...candidate, row, x })
    }

    const rowCount = Math.max(1, rowStarts.length)
    const bandHeight = options.bandHeader + rowCount * options.nodeHeight + Math.max(0, rowCount - 1) * options.rowGap + options.bandFooter
    const bandLayout = {
      ...band,
      x: 0,
      y: cursorY,
      width: options.width,
      height: bandHeight,
      rowCount
    }
    bandLayouts.push(bandLayout)

    for (const assignment of assignments) {
      const y = cursorY + options.bandHeader + assignment.row * (options.nodeHeight + options.rowGap)
      positioned.push({
        id: assignment.node.id,
        node: assignment.node,
        bandId: band.id,
        row: assignment.row,
        year: assignment.year,
        x: assignment.x,
        y,
        width: options.nodeWidth,
        height: options.nodeHeight,
        cx: assignment.x + options.nodeWidth / 2,
        cy: y + options.nodeHeight / 2
      })
    }
    cursorY += bandHeight + options.bandGap
  }

  const unknown = nodes.filter(node => node && !bandIds.has(node.bandId))
  if (unknown.length) throw new Error(`Opportunity layout contains ${unknown.length} node(s) with an unknown visual band.`)

  const height = Math.max(520, cursorY - options.bandGap + options.bottom)
  const byId = new Map(positioned.map(item => [item.id, item]))
  const timeTicks = []
  const years = new Set([domain.startYear, domain.focusStartYear, domain.endYear])
  const historicalSpan = domain.focusStartYear - domain.startYear
  const historicalStep = historicalSpan > 70 ? 20 : historicalSpan > 35 ? 10 : 5
  for (let year = Math.ceil(domain.startYear / historicalStep) * historicalStep; year < domain.focusStartYear; year += historicalStep) years.add(year)
  const focusSpan = domain.endYear - domain.focusStartYear
  const focusStep = focusSpan > 16 ? 5 : focusSpan > 8 ? 2 : 1
  for (let year = domain.focusStartYear; year <= domain.endYear; year += focusStep) years.add(year)
  for (const year of [...years].sort((left, right) => left - right)) {
    timeTicks.push({ year, x: options.left + timeRatio(year, domain) * usableWidth + options.nodeWidth / 2, focus: year === domain.focusStartYear })
  }

  return { width: options.width, height, domain, bands: bandLayouts, nodes: positioned, byId, timeTicks, options }
}

function opportunityPath (source, target, relationship, index = 0) {
  if (!source || !target) return ''
  const forward = target.cx >= source.cx
  const sx = forward ? source.x + source.width : source.x
  const tx = forward ? target.x : target.x + target.width
  const sy = source.cy
  const ty = target.cy
  const distance = Math.max(42, Math.abs(tx - sx) * 0.46)
  if (Math.abs(sy - ty) < 4 && Math.abs(tx - sx) < source.width * 1.35) {
    const lift = 44 + (index % 4) * 12
    return `M ${sx} ${sy} C ${sx + (forward ? distance : -distance)} ${sy - lift}, ${tx - (forward ? distance : -distance)} ${ty - lift}, ${tx} ${ty}`
  }
  return `M ${sx} ${sy} C ${sx + (forward ? distance : -distance)} ${sy}, ${tx - (forward ? distance : -distance)} ${ty}, ${tx} ${ty}`
}

module.exports = {
  DEFAULT_OPTIONS,
  computeOpportunityLayout,
  nodeYear,
  opportunityPath,
  timeRatio
}
