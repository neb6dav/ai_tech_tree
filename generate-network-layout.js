#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DATA_FILE = 'ai-research-tech-tree.json';
const OUTPUT_FILE = 'network-layout-v1.json';
const LAYOUT_VERSION = 'network-v1';
const ALGORITHM = 'deterministic-lane-force-v1';
const SEED = 'ai-research-tech-tree-network-v1';
const ITERATIONS = 260;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hash32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function round(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sourceProjection(data) {
  return {
    lanes: data.lanes
      .map(lane => ({ id: lane.id, label: lane.label }))
      .sort((left, right) => compareText(left.id, right.id)),
    nodes: data.nodes
      .map(node => ({
        id: node.id,
        laneId: node.laneId,
        startYear: node.chronology.startYear,
        endYear: node.chronology.endYear,
        type: node.type
      }))
      .sort((left, right) => compareText(left.id, right.id)),
    relationships: data.relationships
      .map(relationship => ({
        id: relationship.id,
        sourceNodeId: relationship.sourceNodeId,
        targetNodeId: relationship.targetNodeId,
        relationshipType: relationship.relationshipType,
        evidenceGrade: relationship.evidenceGrade
      }))
      .sort((left, right) => compareText(left.id, right.id))
  };
}

function sourceDigest(data) {
  return sha256(JSON.stringify(sourceProjection(data)));
}

function buildLayout(data) {
  assert(data && Array.isArray(data.lanes), 'Normalized data is missing lanes');
  assert(Array.isArray(data.nodes) && data.nodes.length > 0, 'Normalized data is missing nodes');
  assert(Array.isArray(data.relationships), 'Normalized data is missing relationships');

  const laneIds = new Set(data.lanes.map(lane => lane.id));
  assert(laneIds.size === data.lanes.length, 'Lane identifiers must be unique');
  const sortedNodes = [...data.nodes].sort((left, right) => compareText(left.id, right.id));
  const nodeIndex = new Map(sortedNodes.map((node, index) => [node.id, index]));
  assert(nodeIndex.size === sortedNodes.length, 'Node identifiers must be unique');
  sortedNodes.forEach(node => assert(laneIds.has(node.laneId), `Unknown lane ${node.laneId} for ${node.id}`));

  const laneOrder = new Map(data.lanes.map((lane, index) => [lane.id, index]));
  const laneCount = data.lanes.length;
  const years = sortedNodes.map(node => node.chronology.startYear);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const yearSpan = Math.max(1, maxYear - minYear);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const clusterRadius = Math.max(720, laneCount * 52);

  const laneCenters = new Map(data.lanes.map((lane, index) => {
    const angle = -Math.PI / 2 + (index / laneCount) * Math.PI * 2;
    return [lane.id, {
      x: Math.cos(angle) * clusterRadius,
      y: Math.sin(angle) * clusterRadius,
      tangentX: -Math.sin(angle),
      tangentY: Math.cos(angle)
    }];
  }));

  const laneMembers = new Map(data.lanes.map(lane => [lane.id, []]));
  for (const node of sortedNodes) laneMembers.get(node.laneId).push(node);
  for (const members of laneMembers.values()) {
    members.sort((left, right) =>
      left.chronology.startYear - right.chronology.startYear || compareText(left.id, right.id));
  }

  const localIndex = new Map();
  for (const members of laneMembers.values()) members.forEach((node, index) => localIndex.set(node.id, index));

  const x = new Float64Array(sortedNodes.length);
  const y = new Float64Array(sortedNodes.length);
  const vx = new Float64Array(sortedNodes.length);
  const vy = new Float64Array(sortedNodes.length);

  sortedNodes.forEach((node, index) => {
    const center = laneCenters.get(node.laneId);
    const memberIndex = localIndex.get(node.id);
    const yearUnit = ((node.chronology.startYear - minYear) / yearSpan) * 2 - 1;
    const jitter = (hash32(`${SEED}:${node.id}`) / 0xffffffff - 0.5) * 0.6;
    const angle = memberIndex * goldenAngle + jitter;
    const radius = 30 * Math.sqrt(memberIndex + 1);
    x[index] = center.x + Math.cos(angle) * radius + center.tangentX * yearUnit * 150;
    y[index] = center.y + Math.sin(angle) * radius + center.tangentY * yearUnit * 150;
  });

  const gradeSpring = {
    direct: { strength: 0.024, length: 115 },
    partial: { strength: 0.02, length: 130 },
    contextual: { strength: 0.014, length: 165 },
    editorial: { strength: 0.011, length: 180 },
    unassessed: { strength: 0.009, length: 195 },
    hypothesis: { strength: 0.007, length: 225 }
  };
  const edges = [...data.relationships]
    .sort((left, right) => compareText(left.id, right.id))
    .map(relationship => {
      const source = nodeIndex.get(relationship.sourceNodeId);
      const target = nodeIndex.get(relationship.targetNodeId);
      assert(source !== undefined, `Unknown source node ${relationship.sourceNodeId}`);
      assert(target !== undefined, `Unknown target node ${relationship.targetNodeId}`);
      return { source, target, ...(gradeSpring[relationship.evidenceGrade] || gradeSpring.unassessed) };
    });

  const ax = new Float64Array(sortedNodes.length);
  const ay = new Float64Array(sortedNodes.length);
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    ax.fill(0);
    ay.fill(0);

    for (let left = 0; left < sortedNodes.length; left += 1) {
      for (let right = left + 1; right < sortedNodes.length; right += 1) {
        let dx = x[right] - x[left];
        let dy = y[right] - y[left];
        if (dx === 0 && dy === 0) {
          const angle = (hash32(`${sortedNodes[left].id}:${sortedNodes[right].id}`) / 0xffffffff) * Math.PI * 2;
          dx = Math.cos(angle) * 0.001;
          dy = Math.sin(angle) * 0.001;
        }
        const distanceSquared = dx * dx + dy * dy + 625;
        const distance = Math.sqrt(distanceSquared);
        const force = 8600 / distanceSquared;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        ax[left] -= fx;
        ay[left] -= fy;
        ax[right] += fx;
        ay[right] += fy;
      }
    }

    for (const edge of edges) {
      const dx = x[edge.target] - x[edge.source];
      const dy = y[edge.target] - y[edge.source];
      const distance = Math.max(0.001, Math.hypot(dx, dy));
      const force = (distance - edge.length) * edge.strength;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      ax[edge.source] += fx;
      ay[edge.source] += fy;
      ax[edge.target] -= fx;
      ay[edge.target] -= fy;
    }

    const progress = iteration / (ITERATIONS - 1);
    const laneStrength = 0.012 + progress * 0.014;
    sortedNodes.forEach((node, index) => {
      const center = laneCenters.get(node.laneId);
      const yearUnit = ((node.chronology.startYear - minYear) / yearSpan) * 2 - 1;
      const targetX = center.x + center.tangentX * yearUnit * 150;
      const targetY = center.y + center.tangentY * yearUnit * 150;
      ax[index] += (targetX - x[index]) * laneStrength;
      ay[index] += (targetY - y[index]) * laneStrength;
      ax[index] -= x[index] * 0.00045;
      ay[index] -= y[index] * 0.00045;
    });

    const damping = 0.78 + progress * 0.12;
    const maxStep = 16 - progress * 12;
    for (let index = 0; index < sortedNodes.length; index += 1) {
      vx[index] = (vx[index] + ax[index]) * damping;
      vy[index] = (vy[index] + ay[index]) * damping;
      const speed = Math.hypot(vx[index], vy[index]);
      if (speed > maxStep) {
        vx[index] = (vx[index] / speed) * maxStep;
        vy[index] = (vy[index] / speed) * maxStep;
      }
      x[index] += vx[index];
      y[index] += vy[index];
    }
  }

  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
  const maxExtent = Math.max(...x.map(value => Math.abs(value - meanX)), ...y.map(value => Math.abs(value - meanY)), 1);
  const scale = 1800 / maxExtent;
  const positions = sortedNodes.map((node, index) => ({
    id: node.id,
    laneId: node.laneId,
    x: round((x[index] - meanX) * scale),
    y: round((y[index] - meanY) * scale)
  }));
  const positionById = new Map(positions.map(position => [position.id, position]));
  const lanes = data.lanes.map((lane, index) => {
    const members = laneMembers.get(lane.id).map(node => positionById.get(node.id));
    return {
      id: lane.id,
      label: lane.label,
      order: index,
      nodeCount: members.length,
      centroid: {
        x: round(members.reduce((sum, node) => sum + node.x, 0) / members.length),
        y: round(members.reduce((sum, node) => sum + node.y, 0) / members.length)
      }
    };
  });

  return {
    schemaVersion: '1.0.0',
    layoutVersion: LAYOUT_VERSION,
    algorithm: ALGORITHM,
    seed: SEED,
    iterations: ITERATIONS,
    sourceDigest: sourceDigest(data),
    nodeCount: positions.length,
    relationshipCount: data.relationships.length,
    coordinateSystem: { dimensions: 2, units: 'layout', extent: [-1800, 1800] },
    lanes,
    nodes: positions
  };
}

function serializeLayout(layout) {
  return `${JSON.stringify(layout, null, 2)}\n`;
}

function main() {
  const dataPath = path.join(ROOT, DATA_FILE);
  const outputPath = path.join(ROOT, OUTPUT_FILE);
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const body = serializeLayout(buildLayout(data));
  if (process.argv.includes('--check')) {
    assert(fs.existsSync(outputPath), `Missing ${OUTPUT_FILE}`);
    assert(fs.readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n') === body, `${OUTPUT_FILE} is stale; run npm run build`);
  } else {
    fs.writeFileSync(outputPath, body, 'utf8');
  }
  console.log(JSON.stringify({
    status: process.argv.includes('--check') ? 'CURRENT' : 'GENERATED',
    file: OUTPUT_FILE,
    sourceDigest: JSON.parse(body).sourceDigest,
    nodes: data.nodes.length,
    relationships: data.relationships.length
  }, null, 2));
}

if (require.main === module) main();

module.exports = { ALGORITHM, LAYOUT_VERSION, buildLayout, serializeLayout, sourceDigest, sourceProjection };
