(function (global) {
  'use strict';
  function connections(data, id) {
    return (data.relationships || []).filter(function (edge) {
      return edge.sourceNodeId === id || edge.targetNodeId === id;
    });
  }
  function neighbors(data, id) {
    var ids = new Set();
    connections(data, id).forEach(function (edge) {
      ids.add(edge.sourceNodeId === id ? edge.targetNodeId : edge.sourceNodeId);
    });
    return Array.from(ids);
  }
  function degree(data, id) { return connections(data, id).length; }
  function searchNodes(data, query) {
    var needle = String(query || '').trim().toLowerCase();
    if (!needle) return data.nodes || [];
    return (data.nodes || []).filter(function (node) {
      return [node.title, node.id, node.description, node.laneId].join(' ').toLowerCase().indexOf(needle) >= 0;
    });
  }
  function boundedNeighborhood(data, selectedId, limit) {
    var nodes = (data.nodes || []).filter(function (node) { return node.id === selectedId; });
    var ids = neighbors(data, selectedId).sort(function (a, b) { return degree(data, b) - degree(data, a); }).slice(0, limit || 18);
    ids.forEach(function (id) {
      var node = (data.nodes || []).find(function (candidate) { return candidate.id === id; });
      if (node) nodes.push(node);
    });
    var visible = new Set(nodes.map(function (node) { return node.id; }));
    return { nodes: nodes, edges: (data.relationships || []).filter(function (edge) { return visible.has(edge.sourceNodeId) && visible.has(edge.targetNodeId); }), totalConnections: connections(data, selectedId).length };
  }
  function chronologyLayout(data, options) {
    options = options || {};
    var width = options.width || 1000, height = options.height || 650, nodes = data.nodes || [], lanes = (data.catalog && data.catalog.lanes) || [], eras = (data.catalog && data.catalog.eras) || [], laneIndex = new Map(lanes.map(function(lane, index) { return [lane.id, index]; }));
    var years = Array.from(new Set(nodes.map(function(n) { return n.dateOverride && n.dateOverride.start || n.year || 0; }))).sort(function(a, b) { return a - b; });
    var minYear = years[0] || 0, maxYear = years[years.length - 1] || minYear, plot = { x0: options.left || 145, x1: Math.max(146, width - 30), y0: 50, y1: Math.min(height - 40, 610) }, innerW = plot.x1 - plot.x0, innerH = plot.y1 - plot.y0, yearX = new Map(years.map(function(year, index) { return [year, plot.x0 + index * innerW / Math.max(1, years.length - 1)]; })), positions = new Map();
    var grouped = new Map();
    nodes.slice().sort(function(a, b) { return (a.dateOverride && a.dateOverride.start || a.year || 0) - (b.dateOverride && b.dateOverride.start || b.year || 0) || (a.ordinal || 0) - (b.ordinal || 0); }).forEach(function(n) {
      var year = n.dateOverride && n.dateOverride.start || n.year || minYear, lane = laneIndex.has(n.laneId) ? laneIndex.get(n.laneId) : 0, key = year + ':' + lane, list = grouped.get(key) || []; list.push(n); grouped.set(key, list);
    });
    var maxStacks = lanes.map(function(_, lane) { var max = 1; grouped.forEach(function(list, key) { if (Number(key.split(':')[1]) === lane) max = Math.max(max, list.length); }); return max; }), laneHeights = maxStacks.map(function(max) { return max * 9 + 9; }), laneTotal = laneHeights.reduce(function(sum, value) { return sum + value; }, 0), laneScale = Math.min(1, innerH / Math.max(1, laneTotal));
    grouped.forEach(function(list, key) {
      var parts = key.split(':'), year = Number(parts[0]), lane = Number(parts[1]), laneStart = plot.y0 + laneHeights.slice(0, lane).reduce(function(sum, value) { return sum + value * laneScale; }, 0), laneHeight = laneHeights[lane] * laneScale, baseY = laneStart + laneHeight / 2, step = 9 * laneScale, start = baseY - (list.length - 1) * step / 2;
      list.forEach(function(n, index) { positions.set(n.id, { x: Number(yearX.get(year).toFixed(2)), y: Number(Math.max(plot.y0, Math.min(plot.y1, start + index * step)).toFixed(2)), year: year, lane: n.laneId, era: eras.find(function(era) { var y0 = era.y0 !== undefined ? era.y0 : era.start, y1 = era.y1 !== undefined ? era.y1 : era.end; return year >= y0 && year <= y1; }) || null }); });
    });
    positions.lanes = lanes.map(function(lane, index) { var y0 = plot.y0 + laneHeights.slice(0, index).reduce(function(sum, value) { return sum + value * laneScale; }, 0), y1 = y0 + laneHeights[index] * laneScale; return { id: lane.id, label: lane.n || lane.label || lane.name || lane.id, y: Number(((y0 + y1) / 2).toFixed(2)), y0: Number(y0.toFixed(2)), y1: Number(y1.toFixed(2)) }; });
    positions.eras = eras.map(function(era) { var y0 = era.y0 !== undefined ? era.y0 : era.start, y1 = era.y1 !== undefined ? era.y1 : era.end; return { label: era.n || era.label || '', y0: y0, y1: y1, x0: Number(yearX.get(years.find(function(year) { return year >= y0; }) || minYear).toFixed(2)), x1: Number(yearX.get(years.slice().reverse().find(function(year) { return year <= y1; }) || maxYear).toFixed(2)) }; });
    positions.ticks = years.filter(function(year) { return !years.length || year === minYear || year === maxYear || year % 5 === 0; }).map(function(year) { return { year: year, x: Number(yearX.get(year).toFixed(2)) }; });
    positions.bounds = { minYear: minYear, maxYear: maxYear, width: width, height: height, plot: plot };
    return positions;
  }
  function classification(node) { return node && (node.classificationCode || (node.classification && node.classification.code) || ''); }
  function classificationLabel(code, catalog) { return catalog && catalog.classifications && catalog.classifications[code] ? catalog.classifications[code].n : code || 'Unclassified'; }
  function highlighted(node, facet) { return facet === 'all' || !facet || classification(node) === facet; }
  global.AtlasWorkspaceLogic = { connections: connections, neighbors: neighbors, degree: degree, searchNodes: searchNodes, boundedNeighborhood: boundedNeighborhood, chronologyLayout: chronologyLayout, classification: classification, classificationLabel: classificationLabel, highlighted: highlighted };
}(window));
