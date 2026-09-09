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
  global.AtlasWorkspaceLogic = { connections: connections, neighbors: neighbors, degree: degree, searchNodes: searchNodes, boundedNeighborhood: boundedNeighborhood };
}(window));
