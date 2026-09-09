(() => {
  (function() {
    "use strict";
    var script = document.getElementById("atlas-data"), data = {};
    try {
      data = JSON.parse(script ? script.textContent : "{}");
    } catch (_) {
      data = {};
    }
    data.nodes = Array.isArray(data.nodes) ? data.nodes : [];
    data.relationships = Array.isArray(data.relationships) ? data.relationships : [];
    data.catalog = data.catalog || {};
    var logic = window.AtlasWorkspaceLogic, root = document.querySelector("[data-atlas-workspace]");
    if (!root || !logic) return;
    var N = new Map(data.nodes.map(function(n) {
      return [n.id, n];
    })), E = new Map(data.relationships.map(function(e) {
      return [e.key, e];
    })), pilot = data.evidencePilot || {}, PS = new Map((pilot.sources || []).map(function(s) {
      return [s.id, s];
    })), PN = new Map((pilot.relationships || []).map(function(n) {
      return [n.relationshipKey, n];
    })), opp = data.opportunity || {}, OS = new Map((opp.sources || []).map(function(s) {
      return [s.id, s];
    }));
    var state = { selectedNodeId: "transformer", selectedEdgeKey: null, opportunityCardId: null, view: "explore", query: "", tourId: "pilot", tourStep: 0, scope: "full", highlight: "all", showAllConnections: false, camera: { x: 0, y: 0, scale: 1 } }, svg = document.getElementById("atlas-map"), content = document.getElementById("map-content"), detail = document.getElementById("detail-panel"), list = document.getElementById("list-panel"), search = document.getElementById("node-search"), results = document.getElementById("search-results");
    var el = function(t, x, c) {
      var n = document.createElement(t);
      if (x !== void 0) n.textContent = x;
      if (c) n.className = c;
      return n;
    }, node = function(id) {
      return N.get(id);
    };
    var mapWidth = 1000, fullLayout = logic.chronologyLayout(data, { width: 1000, height: 650, left: 220 });
    function url(s) {
      try {
        var u = new URL(s && (s.revisionUrl || s.url || s.canonicalUrl));
        return ["http:", "https:"].indexOf(u.protocol) >= 0 ? u.href : "";
      } catch (_) {
        return "";
      }
    }
    function link(s) {
      var h = url(s);
      if (!h) return el("span", s && s.title || "Unlinked source", "source-link");
      var a = el("a", "\u2197 " + (s.title || h), "source-link");
      a.href = h;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      return a;
    }
    function parse() {
      var hashParams = new URLSearchParams(location.hash.slice(1)), queryParams = new URLSearchParams(location.search), p = hashParams, id = hashParams.get("node") || queryParams.get("node"), k = hashParams.get("edge") || hashParams.get("relationship"), v = hashParams.get("view") || queryParams.get("view");
      if (v === "network" || v === "timeline") v = "explore";
      if (queryParams.get("embed") === "1") document.body.classList.add("embed-mode");
      state.selectedNodeId = "transformer";
      state.selectedEdgeKey = null;
      state.view = "explore";
      state.tourStep = 0;
      state.camera = { x: 0, y: 0, scale: 1 };
      state.scope = p.get("scope") === "focus" ? "focus" : "full";
      state.highlight = ["all", "x", "d", "r"].indexOf(p.get("highlight")) >= 0 ? p.get("highlight") : "all";
      state.query = hashParams.get("q") || queryParams.get("q") || "";
      search.value = state.query;
      if (id && N.has(id)) state.selectedNodeId = id;
      if (k && E.has(k)) state.selectedEdgeKey = k;
      if (["explore", "learn", "list", "opportunity"].indexOf(v) >= 0) state.view = v;
      state.opportunityCardId = p.get("opportunity") || p.get("card") || null;
      var cards = opp.openOpportunities || [];
      // Explicit legacy card aliases must not shadow valid corpus record IDs.
      if (!p.has("opportunity") && p.get("card") === "opp01") state.opportunityCardId = "card-opp01";
      var opportunityIds = new Set(cards.concat(opp.nodes || [], opp.constraints || [], opp.relationships || []).map(function(record) { return record.id; }));
      if (!opportunityIds.has(state.opportunityCardId)) state.opportunityCardId = cards[0] ? cards[0].id : null;
      if ((p.has("opportunity") || p.has("card")) && !v) state.view = "opportunity";
      var tours = data.presentation && data.presentation.tours || [], tourId = p.get("tour") || "pilot";
      if (tourId !== "pilot" && !tours.some(function(tour) { return tour.slug === tourId; })) tourId = "pilot";
      state.tourId = tourId;
      var step = Number(p.get("step"));
      if (Number.isInteger(step) && step >= 0) state.tourStep = step;
      var tourSteps = tourData().steps || [];
      if (state.view === "learn" && tourSteps.length) { state.scope = "focus"; state.camera = { x: 0, y: 0, scale: 1 }; state.tourStep = Math.min(state.tourStep, tourSteps.length - 1); var tourStep = tourSteps[state.tourStep]; if (tourStep.nodeId && N.has(tourStep.nodeId)) state.selectedNodeId = tourStep.nodeId; state.selectedEdgeKey = tourStep.relationshipKey && E.has(tourStep.relationshipKey) ? tourStep.relationshipKey : null; }
      if (state.selectedEdgeKey) {
        var selectedEdge = E.get(state.selectedEdgeKey);
        if (state.selectedNodeId !== selectedEdge.sourceNodeId && state.selectedNodeId !== selectedEdge.targetNodeId) state.selectedNodeId = selectedEdge.sourceNodeId;
      }
      write(true);
    }
    function write(replace) {
      var p = new URLSearchParams();
      if (state.selectedNodeId) p.set("node", state.selectedNodeId);
      if (state.selectedEdgeKey) p.set("edge", state.selectedEdgeKey);
      if (state.view !== "explore") p.set("view", state.view);
      if (state.view === "learn" && state.tourStep) p.set("step", String(state.tourStep));
      if (state.view === "learn" && state.tourId !== "pilot") p.set("tour", state.tourId);
      if (state.view === "opportunity" && state.opportunityCardId) p.set("opportunity", state.opportunityCardId);
      if (state.query) p.set("q", state.query);
      if (state.scope === "focus") p.set("scope", "focus");
      if (state.highlight !== "all") p.set("highlight", state.highlight);
      var query = new URLSearchParams(location.search);
      ["node", "view", "q"].forEach(function(key) { query.delete(key); });
      (replace ? history.replaceState : history.pushState).call(history, null, "", location.pathname + (query.size ? "?" + query.toString() : "") + (p.toString() ? "#" + p.toString() : ""));
    }
    function selectNode(id, searching) {
      if (!N.has(id)) return;
      closeSearch();
      state.selectedNodeId = id;
      state.selectedEdgeKey = null;
      state.showAllConnections = false;
      state.view = "explore";
      detail.scrollTop = 0;
      if (searching && state.scope === "full") centerRecord(id);
      write(false);
      render();
    }
    function selectEdge(k) {
      if (!E.has(k)) return;
      closeSearch();
      var selected = E.get(k);
      if (state.selectedNodeId !== selected.sourceNodeId && state.selectedNodeId !== selected.targetNodeId) state.selectedNodeId = selected.sourceNodeId;
      state.selectedEdgeKey = k;
      state.view = "explore";
      state.showAllConnections = false;
      detail.scrollTop = 0;
      write(false);
      render();
    }
    function sourceList(parent, arr, title) {
      if (!arr || !arr.length) return;
      parent.appendChild(el("h3", title));
      arr.forEach(function(s) {
        parent.appendChild(link(s));
      });
    }
    function closeSearch() {
      results.hidden = true;
      search.setAttribute("aria-expanded", "false");
      search.removeAttribute("aria-activedescendant");
    }
    function renderNode() {
      var n = node(state.selectedNodeId);
      var humanize = function(value) {
        return String(value || "unreviewed").replace(/_/g, " ").replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
      };
      detail.replaceChildren();
      if (!n) return;
      var lane = (data.catalog.lanes || []).find(function(item) { return item.id === n.laneId; });
      detail.appendChild(el("div", (n.year || "\u2014") + " \xB7 " + (lane ? lane.label || lane.n || lane.name : n.laneId || "Unassigned"), "record-kicker"));
      detail.appendChild(el("h2", n.title, "record-title"));
      var open = el("a", "Open reading page", "source-link"); open.href = "nodes/" + encodeURIComponent(n.id) + "/"; detail.appendChild(open);
      detail.appendChild(el("p", n.description || "No description recorded.", "record-desc"));
      var classification = (data.catalog.classifications || {})[logic.classification(n)] || {}, profile = n.statusProfile || {}, statusAudit = n.audit && n.audit.mapStatus;
      detail.appendChild(el("div", (classification.g || "") + " " + (classification.n || "Unclassified"), "history-status"));
      var historyNote = el("details", null, "history-evidence"), summary = el("summary", "Historical status and evidence");
      historyNote.appendChild(summary);
      historyNote.appendChild(el("p", "Activity: " + humanize(profile.activity || "not_assessed") + " · Trajectory: " + humanize(profile.trajectory || "not_assessed")));
      historyNote.appendChild(el("p", "Status confidence: " + humanize(profile.confidence || "unrated") + (profile.asOf ? " · As of " + profile.asOf : "")));
      if (profile.rationale) historyNote.appendChild(el("p", profile.rationale));
      historyNote.appendChild(el("p", "Status review: " + humanize(statusAudit && statusAudit.state || "not_assessed") + (statusAudit && statusAudit.confidence ? " · " + humanize(statusAudit.confidence) : "")));
      if (statusAudit && statusAudit.note) historyNote.appendChild(el("p", statusAudit.note));
      (statusAudit && statusAudit.sources || []).forEach(function(source) { historyNote.appendChild(link(source)); });
      if (["x", "d", "r"].indexOf(logic.classification(n)) >= 0) historyNote.open = true;
      detail.appendChild(historyNote);
      if (n.dateOverride) {
        detail.appendChild(el("p", "Recorded dates: " + (n.dateOverride.label || [n.dateOverride.start, n.dateOverride.end].filter(Boolean).join("–")), "record-kicker"));
        (n.dateOverride.milestones || []).forEach(function(milestone) { detail.appendChild(el("p", typeof milestone === "string" ? milestone : [milestone.year, milestone.label || milestone.title || milestone.note].filter(Boolean).join(" · "))); });
      }
      sourceList(detail, (n.research && n.research.works || []).concat(n.research && n.research.sources || []), "Primary papers and supplemental reading");
      var a = n.audit && n.audit.development, c = el("div", null, "evidence-card");
      c.appendChild(el("span", "Record match: " + humanize(a && a.state || "contextual") + " \xB7 " + humanize(a && a.confidence || "unrated"), "badge"));
      c.appendChild(el("p", a && a.note || "No canonical audit note recorded."));
      (a && a.sources || []).forEach(function(s) {
        c.appendChild(link(s));
      });
      detail.appendChild(el("h3", "Record source check"));
      detail.appendChild(c);
      var questions = [];
      (n.research && n.research.questions || []).concat(n.questions || []).forEach(function(question) {
        if (question && questions.indexOf(question) < 0) questions.push(question);
      });
      if (n.direction && n.direction.question && questions.indexOf(n.direction.question) < 0) questions.push(n.direction.question);
      if (questions.length) {
        detail.appendChild(el("h3", "Research questions"));
        questions.forEach(function(question) { detail.appendChild(el("p", question)); });
      }
      if (n.direction && (n.direction.closureCriteria || n.direction.closureBrief)) {
        detail.appendChild(el("h3", "Closure test"));
        detail.appendChild(el("p", n.direction.closureBrief || n.direction.closureCriteria));
      }
      var edges = logic.connections(data, n.id), sec = el("section");
      sec.appendChild(el("h3", "Connections \xB7 " + edges.length));
      sec.appendChild(el("p", (state.showAllConnections ? "Showing all " : "Showing " + Math.min(12, edges.length) + " of ") + edges.length + " adjacent connections."));
      edges.map(function(edge, index) { return { edge: edge, index: index }; }).sort(function(left, right) {
        var rank = function(edge) { return edge.evidenceGrade === "direct" ? 2 : edge.evidenceGrade === "partial" ? 1 : 0; };
        return rank(right.edge) - rank(left.edge) || left.index - right.index;
      }).slice(0, state.showAllConnections ? edges.length : 12).forEach(function(item) {
        var e = item.edge;
        var o = node(e.sourceNodeId === n.id ? e.targetNodeId : e.sourceNodeId), r = el("div", null, "connection"), b = el("button", (e.sourceNodeId === n.id ? "\u2192 " : "\u2190 ") + (o ? o.title : e.targetNodeId));
        b.type = "button";
        b.addEventListener("click", function() {
          selectNode(o && o.id);
        });
        r.appendChild(b);
        r.appendChild(el("p", humanize(e.relationshipType || "association") + " \xB7 Grade " + humanize(e.evidenceGrade || "contextual") + " \xB7 " + humanize(e.reviewState || "unreviewed")));
        var inspect = el("button", "Inspect evidence");
        inspect.type = "button";
        inspect.addEventListener("click", function() { selectEdge(e.key); });
        r.appendChild(inspect);
        sec.appendChild(r);
      });
      if (edges.length > 12 && !state.showAllConnections) {
        var more = el("button", "Show all connections");
        more.type = "button";
        more.addEventListener("click", function() {
          state.showAllConnections = true;
          renderNode();
        });
        sec.appendChild(more);
      }
      detail.appendChild(sec);
    }
    function renderEdge() {
      var e = E.get(state.selectedEdgeKey);
      if (!e) return renderNode();
      var humanize = function(value) {
        return String(value || "unreviewed").replace(/_/g, " ").replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
      };
      detail.replaceChildren();
      var back = el("button", "Back to selected record", "source-link");
      back.type = "button";
      back.addEventListener("click", function() {
        state.selectedEdgeKey = null;
        write(false);
        render();
      });
      detail.appendChild(back);
      detail.appendChild(el("div", "RELATIONSHIP INSPECTION", "eyebrow"));
      detail.appendChild(el("h2", (node(e.sourceNodeId) || {}).title + " \u2192 " + (node(e.targetNodeId) || {}).title));
      detail.appendChild(el("p", humanize(e.relationshipType || "Recorded association"), "record-kicker"));
      detail.appendChild(el("p", e.rationale || "No canonical rationale recorded.", "record-desc"));
      [e.sourceNodeId, e.targetNodeId].forEach(function(id) {
        var open = el("button", "Open " + ((node(id) || {}).title || id), "source-link");
        open.type = "button";
        open.addEventListener("click", function() { selectNode(id); });
        detail.appendChild(open);
      });
      var c = el("div", null, "evidence-card");
      c.appendChild(el("span", "Grade: " + humanize(e.evidenceGrade || "contextual") + " \xB7 " + humanize(e.reviewState || "unreviewed"), "badge"));
      c.appendChild(el("p", "Canonical audit: " + (e.audit && e.audit.note || "No audit note.")));
      (e.audit && e.audit.sources || []).forEach(function(source) {
        c.appendChild(link(source));
        if (source.locator) c.appendChild(el("p", "Locator: " + source.locator, "record-kicker"));
      });
      detail.appendChild(c);
      var pn = PN.get(e.key);
      if (pn) {
        var d2 = el("div", null, "evidence-card");
        d2.appendChild(el("span", "AI-assisted \xB7 Pending curator review \xB7 " + humanize(pn.disposition || "unresolved"), "badge"));
        d2.appendChild(el("p", pn.claim || ""));
        d2.appendChild(el("p", pn.limitation || ""));
        var pilotSources = (pn.sourceIds || []).filter(function(id) { return PS.has(id); });
        if (!pilotSources.length) {
          d2.appendChild(el("p", "No pilot sources recorded.", "record-kicker"));
        }
        pilotSources.forEach(function(id) {
          var source = PS.get(id);
          d2.appendChild(link(source));
          if (source.locator) d2.appendChild(el("p", "Locator: " + source.locator, "record-kicker"));
        });
        detail.appendChild(d2);
      }
    }
    function svgElement(tag, attrs, text) {
      var result = document.createElementNS("http://www.w3.org/2000/svg", tag);
      Object.keys(attrs || {}).forEach(function(key) { result.setAttribute(key, attrs[key]); });
      if (text !== undefined) result.textContent = text;
      return result;
    }
    function centerRecord(id) {
      var at = fullLayout.get(id);
      if (at) state.camera = { x: mapWidth / 2 - at.x * 3, y: 325 - at.y * 3, scale: 3 };
    }
    function renderFullMap() {
      var selected = state.selectedNodeId, camera = state.camera, positions = fullLayout;
      var active = document.activeElement, restoreFocus = active && svg.contains(active), focusId = active && active.dataset && active.dataset.id, focusEdge = active && active.dataset && active.dataset.edgeId;
      content.replaceChildren();
      var defs = svgElement("defs"), marker = svgElement("marker", { id: "tree-arrow", markerWidth: 5, markerHeight: 5, refX: 4, refY: 2.5, orient: "auto", markerUnits: "userSpaceOnUse" });
      marker.appendChild(svgElement("path", { d: "M0,0 L5,2.5 L0,5 Z", class: "tree-arrow" }));
      defs.appendChild(marker); content.appendChild(defs);
      var guides = svgElement("g", { class: "chronology-guides", "aria-hidden": "true" });
      positions.lanes.forEach(function(lane, index) {
        guides.appendChild(svgElement("rect", { x: 215, y: lane.y0, width: mapWidth - 235, height: lane.y1 - lane.y0, class: "lane-band" + (index % 2 ? " alternate" : "") }));
        var title = lane.label.toLowerCase().replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        var label = svgElement("text", { x: 207, y: lane.y + 4, "text-anchor": "end", class: "lane-label" }, title.length > 23 ? title.slice(0, 21) + "…" : title);
        label.appendChild(svgElement("title", {}, lane.label)); guides.appendChild(label);
      });
      positions.eras.forEach(function(era, index) {
        var band = svgElement("rect", { x: era.x0 - 4, y: 28, width: Math.max(4, era.x1 - era.x0 + 8), height: 7, class: "era-band" + (index % 2 ? " alternate" : "") });
        band.appendChild(svgElement("title", {}, era.y0 + "–" + era.y1 + ": " + era.label)); guides.appendChild(band);
      });
      var lastTick = -100;
      positions.ticks.forEach(function(tick, index) {
        if (tick.x - lastTick < 48 && index !== positions.ticks.length - 1) return;
        if (index !== positions.ticks.length - 1 && tick.x > mapWidth - 75) return;
        lastTick = tick.x;
        guides.appendChild(svgElement("line", { x1: tick.x, x2: tick.x, y1: 40, y2: 612, class: "year-line" }));
        guides.appendChild(svgElement("text", { x: tick.x, y: 21, "text-anchor": "middle", class: "year-label" }, tick.year));
      });
      content.appendChild(guides);
      var edgeLayer = svgElement("g"), hits = svgElement("g"), nodesLayer = svgElement("g"), labels = svgElement("g", { class: "overview-labels", "aria-hidden": "true" });
      data.relationships.forEach(function(edge) {
        var a = positions.get(edge.sourceNodeId), b = positions.get(edge.targetNodeId);
        if (!a || !b) return;
        var adjacent = edge.sourceNodeId === selected || edge.targetNodeId === selected;
        var dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
        var endX = b.x - dx / length * 5, endY = b.y - dy / length * 5, bend = Math.max(8, Math.abs(dx) * 0.45);
        var path = "M" + a.x + "," + a.y + " C" + (a.x + bend) + "," + a.y + " " + (endX - bend) + "," + endY + " " + endX + "," + endY;
        var classes = "edge" + (adjacent ? " related " + (edge.sourceNodeId === selected ? "outgoing" : "incoming") : "") + (edge.key === state.selectedEdgeKey ? " selected" : "");
        edgeLayer.appendChild(svgElement("path", { d: path, class: classes, "data-grade": edge.evidenceGrade || "unassessed", "data-kind": edge.legacyKind, "marker-end": "url(#tree-arrow)" }));
        if (adjacent) {
          var hit = svgElement("path", { d: path, class: "edge-hit", "data-edge-id": edge.key, tabindex: "0", role: "button", "aria-label": "Inspect relationship from " + node(edge.sourceNodeId).title + " to " + node(edge.targetNodeId).title });
          hit.onclick = function() { selectEdge(edge.key); };
          hit.onkeydown = function(event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectEdge(edge.key); } };
          hits.appendChild(hit);
        }
      });
      var ordered = data.nodes.slice().sort(function(a, b) { var pa = positions.get(a.id), pb = positions.get(b.id); return pa.x - pb.x || pa.y - pb.y; });
      ordered.forEach(function(n, index) {
        var at = positions.get(n.id), code = logic.classification(n), classification = (data.catalog.classifications || {})[code] || {};
        var g = svgElement("g", { transform: "translate(" + at.x + " " + at.y + ")", class: "node" + (n.id === selected ? " selected" : "") + (logic.highlighted(n, state.highlight) ? " highlighted" : " faded"), "data-id": n.id, "data-classification": code, tabindex: n.id === selected ? "0" : "-1", role: "button", "aria-label": "Open " + n.title, "aria-description": (classification.n || "") + "; " + at.year + ". Use arrow keys to browse." });
        g.appendChild(svgElement("title", {}, n.title + " · " + at.year + " · " + (classification.n || "")));
        g.appendChild(svgElement("circle", { r: 4.3, class: "marker-target" }));
        g.appendChild(svgElement("text", { x: 0, y: 0, "text-anchor": "middle", "dominant-baseline": "central", class: "history-glyph" }, classification.g || "●"));
        g.onclick = function() { selectNode(n.id); };
        g.onkeydown = function(event) {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectNode(n.id); }
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(event.key) >= 0) {
            event.preventDefault();
            var next = ordered[Math.max(0, Math.min(ordered.length - 1, index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1)))];
            selectNode(next.id);
            var nextPoint = positions.get(next.id), px = nextPoint.x * state.camera.scale + state.camera.x, py = nextPoint.y * state.camera.scale + state.camera.y;
            if (px < 30 || px > mapWidth - 30 || py < 40 || py > 610) { centerRecord(next.id); renderMap(); }
            var target = Array.from(content.querySelectorAll(".node")).find(function(item) { return item.dataset.id === next.id; });
            if (target) target.focus({ preventScroll: true });
          }
        };
        nodesLayer.appendChild(g);
      });
      // Text is a separate layer: marker hit areas stay small and labels never overlap each other.
      var occupied = [], anchors = new Set(["turing36", "perceptron", "mycin", "backprop", "alexnet", "transformer", "hopfield", "itp", "kgraphs"]);
      ordered.slice().sort(function(a, b) { var rank = function(n) { return n.id === selected ? 0 : state.highlight !== "all" && logic.highlighted(n, state.highlight) ? 1 : anchors.has(n.id) ? 2 : 3; }; return rank(a) - rank(b); }).forEach(function(n) {
        var at = positions.get(n.id), isSelected = n.id === selected, matches = logic.highlighted(n, state.highlight);
        if (!isSelected && (!matches || camera.scale < 2 && !anchors.has(n.id) && state.highlight === "all")) return;
        var px = at.x * camera.scale + camera.x, py = at.y * camera.scale + camera.y;
        if (px < 215 && camera.scale === 1 || px < 5 || px > mapWidth - 15 || py < 40 || py > 610) return;
        var text = n.title.length > 26 ? n.title.slice(0, 24) + "…" : n.title, width = text.length * 8 + 12, x = Math.min(mapWidth - 20 - width, px + 9), y = py - 22;
        var box = { x: x, y: y, w: width, h: 18 };
        if (!isSelected && occupied.some(function(b) { return box.x < b.x + b.w + 6 && box.x + box.w + 6 > b.x && box.y < b.y + b.h + 3 && box.y + box.h + 3 > b.y; })) return;
        occupied.push(box);
        var label = svgElement("g", { transform: "translate(" + ((x - camera.x) / camera.scale) + " " + ((y - camera.y) / camera.scale) + ") scale(" + (1 / camera.scale) + ")", class: isSelected ? "selected-label" : "" });
        label.appendChild(svgElement("rect", { x: 0, y: 0, width: width, height: 21, rx: 3 }));
        label.appendChild(svgElement("text", { x: 6, y: 15 }, text)); labels.appendChild(label);
      });
      content.append(edgeLayer, hits, nodesLayer, labels);
      content.setAttribute("transform", "translate(" + camera.x + " " + camera.y + ") scale(" + camera.scale + ")");
      if (restoreFocus) {
        var focusTarget = Array.from(content.querySelectorAll(".node, .edge-hit")).find(function(item) { return focusId && item.dataset.id === focusId || focusEdge && item.dataset.edgeId === focusEdge; });
        (focusTarget || svg).focus({ preventScroll: true });
      }
      document.getElementById("map-title").textContent = "Full tree · " + positions.bounds.minYear + "–" + positions.bounds.maxYear;
      document.getElementById("map-count").textContent = data.nodes.length + " records · " + data.relationships.length + " relationships";
    }
    function renderMap() {
      svg.classList.toggle("full-tree", state.scope === "full");
      var bounds = svg.getBoundingClientRect(), nextWidth = state.scope === "full" && bounds.height ? Math.max(1000, Math.round(650 * bounds.width / bounds.height)) : 1000;
      if (nextWidth !== mapWidth) {
        mapWidth = nextWidth;
        fullLayout = logic.chronologyLayout(data, { width: mapWidth, height: 650, left: 220 });
        state.camera = { x: 0, y: 0, scale: 1 };
      }
      svg.setAttribute("viewBox", "0 0 " + mapWidth + " 650");
      if (state.scope === "full") return renderFullMap();
      var active = document.activeElement, restoreMapFocus = active && svg.contains(active), focusId = active && active.dataset ? active.dataset.id : null, focusEdgeId = active && active.dataset ? active.dataset.edgeId : null;
      content.replaceChildren();
      var id = state.selectedNodeId, all = logic.connections(data, id), hood = logic.boundedNeighborhood(data, id, 11), ids = new Set(hood.nodes.map(function(n) {
        return n.id;
      })), preferredIn = ["attention", "layernorm", "lstm"], preferredOut = ["bert", "gpt2", "vit", "flash", "offlinerl", "gato"], inc = preferredIn.map(function(preferred) { return all.some(function(e) { return e.targetNodeId === id && e.sourceNodeId === preferred; }) ? node(preferred) : null; }).filter(Boolean).concat(all.filter(function(e) { return e.targetNodeId === id && ids.has(e.sourceNodeId) && preferredIn.indexOf(e.sourceNodeId) < 0; }).map(function(e) { return node(e.sourceNodeId); })).slice(0, 3), out = preferredOut.map(function(preferred) { return all.some(function(e) { return e.sourceNodeId === id && e.targetNodeId === preferred; }) ? node(preferred) : null; }).filter(Boolean).concat(all.filter(function(e) { return e.sourceNodeId === id && ids.has(e.targetNodeId) && preferredOut.indexOf(e.targetNodeId) < 0; }).map(function(e) { return node(e.targetNodeId); })).slice(0, 6), w = 1000, h = 650, p = /* @__PURE__ */ new Map([[id, { x: 500, y: 325 }]]);
      var selectedEdge = state.selectedEdgeKey && E.get(state.selectedEdgeKey), selectedOther = selectedEdge && (selectedEdge.sourceNodeId === id ? selectedEdge.targetNodeId : selectedEdge.sourceNodeId), selectedOtherNode = selectedOther && node(selectedOther);
      if (selectedOtherNode && !inc.some(function(candidate) { return candidate.id === selectedOtherNode.id; }) && !out.some(function(candidate) { return candidate.id === selectedOtherNode.id; })) {
        (selectedEdge.sourceNodeId === id ? out : inc).push(selectedOtherNode);
      }
      inc.forEach(function(n, i) {
        p.set(n.id, { x: 150, y: 650 / (inc.length + 1) * (i + 1) });
      });
      out.forEach(function(n, i) {
        p.set(n.id, { x: 850, y: 650 / (out.length + 1) * (i + 1) });
      });
      all.forEach(function(e) {
        var a = p.get(e.sourceNodeId), b = p.get(e.targetNodeId);
        if (!a || !b) return;
        var l = document.createElementNS("http://www.w3.org/2000/svg", "line");
        l.setAttribute("x1", a.x);
        l.setAttribute("y1", a.y);
        l.setAttribute("x2", b.x);
        l.setAttribute("y2", b.y);
        l.setAttribute("class", "edge" + (e.key === state.selectedEdgeKey ? " selected" : ""));
        l.dataset.grade = e.evidenceGrade || "contextual";
        content.appendChild(l);
        var hit = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        var length = Math.hypot(b.x - a.x, b.y - a.y), dx = -(b.y - a.y) / length * 10, dy = (b.x - a.x) / length * 10;
        hit.setAttribute("points", [[a.x+dx,a.y+dy],[b.x+dx,b.y+dy],[b.x-dx,b.y-dy],[a.x-dx,a.y-dy]].map(function(point) { return point.join(","); }).join(" "));
        hit.setAttribute("class", "edge-hit");
        hit.dataset.edgeId = e.key;
        hit.setAttribute("tabindex", "0");
        hit.setAttribute("role", "button");
        hit.setAttribute("aria-label", "Inspect relationship from " + ((node(e.sourceNodeId) || {}).title || e.sourceNodeId) + " to " + ((node(e.targetNodeId) || {}).title || e.targetNodeId));
        hit.addEventListener("click", function() {
          selectEdge(e.key);
        });
        hit.addEventListener("keydown", function(ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            selectEdge(e.key);
          }
        });
        content.appendChild(hit);
      });
      p.forEach(function(at, id2) {
        var n = node(id2), g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "node" + (id2 === state.selectedNodeId ? " selected" : ""));
        g.dataset.id = id2;
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.setAttribute("aria-label", "Open " + n.title);
        var r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        r.setAttribute("x", at.x - 105);
        r.setAttribute("y", at.y - 35);
        r.setAttribute("width", 210);
        r.setAttribute("height", 70);
        r.setAttribute("rx", 5);
        r.setAttribute("class", "node-card" + (id2 === state.selectedNodeId ? " selected" : ""));
        g.appendChild(r);
        var t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", at.x - 92);
        t.setAttribute("y", at.y - 8);
        t.setAttribute("class", "node-card-label");
        var words = n.title.split(" "), first = "", second = ""; words.forEach(function(word) { if ((first + " " + word).trim().length <= 23 && !second) first = (first + " " + word).trim(); else second = (second + " " + word).trim(); }); t.textContent = first; if (second) { var t2 = document.createElementNS("http://www.w3.org/2000/svg", "text"); t2.setAttribute("x", at.x - 92); t2.setAttribute("y", at.y + 9); t2.setAttribute("class", "node-card-label"); t2.textContent = second.slice(0, 25); g.appendChild(t2); }
        g.appendChild(t);
        var y = document.createElementNS("http://www.w3.org/2000/svg", "text");
        y.setAttribute("x", at.x - 92);
        y.setAttribute("y", at.y + 28);
        y.setAttribute("class", "node-card-year");
        y.textContent = n.year || "\u2014";
        g.appendChild(y);
        g.addEventListener("click", function() {
          selectNode(id2);
        });
        g.addEventListener("keydown", function(ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            selectNode(id2);
          }
        });
        content.appendChild(g);
        Array.from(g.querySelectorAll(".node-card-label")).forEach(function(label) {
          var full = label.textContent;
          while (label.getComputedTextLength() > 184 && full.length > 1) {
            full = full.slice(0, -1);
            label.textContent = full.trimEnd() + "…";
          }
        });
      });
      content.setAttribute("transform", "translate(" + state.camera.x + " " + state.camera.y + ") scale(" + state.camera.scale + ")");
      var focusTarget = null;
      Array.from(content.querySelectorAll(".node")).some(function(candidate) {
        if (candidate.dataset.id === focusId || (!focusTarget && focusId === state.selectedNodeId && candidate.dataset.id === state.selectedNodeId)) { focusTarget = candidate; return true; }
        return false;
      });
      if (!focusTarget && focusEdgeId) Array.from(content.querySelectorAll(".edge-hit")).some(function(candidate) { if (candidate.dataset.edgeId === focusEdgeId) { focusTarget = candidate; return true; } return false; });
      if (!focusTarget && state.selectedEdgeKey) Array.from(content.querySelectorAll(".edge-hit")).some(function(candidate) { if (candidate.dataset.edgeId === state.selectedEdgeKey) { focusTarget = candidate; return true; } return false; });
      if (!focusTarget && state.selectedNodeId) Array.from(content.querySelectorAll(".node")).some(function(candidate) { if (candidate.dataset.id === state.selectedNodeId) { focusTarget = candidate; return true; } return false; });
      if (focusTarget && restoreMapFocus) focusTarget.focus({ preventScroll: true });
      document.getElementById("map-title").textContent = "Around " + ((node(id) || {}).title || "selected record");
      document.getElementById("map-count").textContent = p.size + " shown \xB7 " + all.length + " adjacent connections \xB7 " + data.nodes.length + " total";
    }
    function renderList() {
      list.replaceChildren();
      list.appendChild(el("div", "ALL RECORDED DEVELOPMENTS", "eyebrow"));
      var grid = el("div", null, "list-grid");
      logic.searchNodes(data, state.query).forEach(function(n) {
        var b = el("button", null, "list-card");
        b.type = "button";
        b.appendChild(el("strong", n.title));
        b.appendChild(el("small", n.year + " \xB7 " + n.laneId));
        b.addEventListener("click", function() {
          selectNode(n.id, true);
        });
        grid.appendChild(b);
      });
      list.appendChild(grid);
    }
    function tourData() { var tours = data.presentation && data.presentation.tours || []; if (state.tourId === "pilot" && pilot.tour) return pilot.tour; return tours.find(function(t) { return t.slug === state.tourId; }) || tours[0] || {}; }
    function selectTourStep(index) { var steps = tourData().steps || []; if (!steps.length) return; state.scope = "focus"; state.tourStep = Math.max(0, Math.min(steps.length - 1, index)); var step = steps[state.tourStep]; state.selectedNodeId = step.nodeId || state.selectedNodeId; state.selectedEdgeKey = step.relationshipKey || null; state.view = "learn"; write(false); render(); }
    function renderLearn() {
      var restoreControl = detail.contains(document.activeElement) ? document.activeElement.id : null;
      detail.replaceChildren();
      var tour = tourData(), steps = tour.steps || [], s = steps[Math.max(0, Math.min(state.tourStep, steps.length - 1))] || {};
      detail.appendChild(el("div", "LEARN \xB7 " + (tour.title || "GUIDED PATH"), "eyebrow"));
      if (state.tourId === "pilot") detail.appendChild(el("p", "AI-assisted source review draft \xB7 pending curator review", "opportunity-note"));
      var chooser = el("select"); chooser.setAttribute("aria-label", "Learning path"); var pilotOption = el("option", "Pilot: source review"); pilotOption.value = "pilot"; chooser.appendChild(pilotOption); (data.presentation && data.presentation.tours || []).forEach(function(t) { var option = el("option", t.title || t.slug); option.value = t.slug; option.selected = state.tourId === t.slug; chooser.appendChild(option); }); chooser.value = state.tourId; chooser.addEventListener("change", function() { state.tourId = chooser.value; selectTourStep(0); }); detail.appendChild(chooser);
      detail.appendChild(el("p", "Step " + (steps.length ? state.tourStep + 1 : 0) + " of " + steps.length, "record-kicker"));
      detail.appendChild(el("h2", s.title || (node(s.nodeId) || {}).title || "Guided path"));
      detail.appendChild(el("p", s.narration || s.explanation || ""));
      (s.sourceIds || []).forEach(function(id) { if (PS.has(id)) { var source = PS.get(id); detail.appendChild(link(source)); if (source.locator) detail.appendChild(el("p", "Locator: " + source.locator, "record-kicker")); } });
      if (s.nodeId && node(s.nodeId)) {
        renderMap();
      }
      var p = el("div"), prev = el("button", "Previous"), next = el("button", "Next");
      chooser.id = "learning-path"; prev.id = "learning-previous"; next.id = "learning-next";
      prev.type = next.type = "button";
      prev.disabled = state.tourStep === 0;
      next.disabled = state.tourStep >= steps.length - 1;
      var open = el("button", "Open record"); open.type = "button"; open.addEventListener("click", function() { state.view = "explore"; state.selectedEdgeKey = null; write(false); render(); }); p.appendChild(open);
      prev.onclick = function() {
        selectTourStep(state.tourStep - 1);
      };
      next.onclick = function() {
        selectTourStep(state.tourStep + 1);
      };
      p.appendChild(prev);
      p.appendChild(next);
      detail.appendChild(p);
      if (restoreControl && restoreControl.indexOf("learning-") === 0) {
        var restored = document.getElementById(restoreControl);
        if (restored && !restored.disabled) restored.focus({ preventScroll: true });
        else if (!prev.disabled) prev.focus({ preventScroll: true });
      }
    }
    function renderOpportunity() {
      var restoreControl = document.activeElement && document.activeElement.id;
      document.getElementById("map-title").textContent = "Diffusion model opportunities";
      document.getElementById("map-count").textContent = "60 records · 94 relationships · 8 hypotheses";
      document.querySelector(".workspace-grid").hidden = false;
      document.getElementById("map-stage").hidden = true;
      document.getElementById("opportunity-browser").hidden = false;
      detail.replaceChildren();
      detail.appendChild(el("div", "OPPORTUNITY \xB7 IMPORTED RESEARCH", "eyebrow"));
      var collections = {
        hypotheses: { label: "Hypotheses", records: opp.openOpportunities || [] },
        records: { label: "Records", records: opp.nodes || [] },
        constraints: { label: "Constraints", records: opp.constraints || [] },
        relationships: { label: "Relationships", records: opp.relationships || [] }
      }, collectionFor = function(id) {
        if (id && String(id).indexOf("card-") === 0) return "hypotheses";
        if (id && String(id).indexOf("constraint-") === 0) return "constraints";
        if (collections.relationships.records.some(function(record) { return record.id === id; })) return "relationships";
        if (collections.constraints.records.some(function(record) { return record.id === id; })) return "constraints";
        if (collections.hypotheses.records.some(function(record) { return record.id === id; })) return "hypotheses";
        return "records";
      }, recordTitle = function(record) {
        if (!record) return "";
        if (record.title) return record.title;
        if (record.sourceNodeId || record.targetNodeId) {
          var source = (opp.nodes || []).find(function(item) { return item.id === record.sourceNodeId; }), target = (opp.nodes || []).find(function(item) { return item.id === record.targetNodeId; });
          if (source || target) return (source && source.title || record.sourceNodeId || "Unknown source") + " → " + (target && target.title || record.targetNodeId || "Unknown target");
        }
        return record.label || record.name || record.id;
      }, selectTypedRecord = function(id) {
        if (!id) return;
        state.opportunityCardId = id;
        state.view = "opportunity";
        write(false);
        renderOpportunity();
      }, collection = collectionFor(state.opportunityCardId), current = collections[collection], records = current.records;
      if (!records.some(function(record) { return record.id === state.opportunityCardId; })) {
        state.opportunityCardId = records[0] ? records[0].id : null;
      }
      detail.appendChild(el("p", "Imported, unreviewed corpus; reported source grades are distinct from this collection status."));
      var browser = document.getElementById("opportunity-browser");
      browser.replaceChildren();
      var collectionLabel = el("label", "Opportunity collection");
      var collectionSelect = el("select");
      collectionSelect.id = "opportunity-collection";
      collectionSelect.setAttribute("aria-label", "Opportunity collection");
      Object.keys(collections).forEach(function(key) {
        var option = el("option", collections[key].label + " (" + collections[key].records.length + ")");
        option.value = key;
        option.selected = key === collection;
        collectionSelect.appendChild(option);
      });
      collectionSelect.addEventListener("change", function() {
        collection = collectionSelect.value;
        state.opportunityCardId = collections[collection].records[0] ? collections[collection].records[0].id : null;
        write(false);
        renderOpportunity();
      });
      collectionLabel.appendChild(collectionSelect);
      browser.appendChild(collectionLabel);
      var chooser = el("div", null, "list-grid");
      records.forEach(function(record) {
        var b = el("button", recordTitle(record), "list-card");
        b.type = "button";
        b.id = "opportunity-record-" + record.id;
        b.setAttribute("aria-pressed", String(record.id === state.opportunityCardId));
        if (record.id === state.opportunityCardId) b.classList.add("selected");
        b.addEventListener("click", function() { selectTypedRecord(record.id); });
        chooser.appendChild(b);
      });
      browser.appendChild(chooser);
      var download = el("a", "Download complete opportunity corpus", "source-link");
      download.href = "./data/opportunities/diffusion-models.alpha.json";
      browser.appendChild(download);
      var selected = records.find(function(record) { return record.id === state.opportunityCardId; });
      if (!selected) return;
      detail.appendChild(el("h2", recordTitle(selected)));
      var humanize = function(value) { return String(value || "").replace(/_/g, " ").replace(/\b\w/g, function(ch) { return ch.toUpperCase(); }); }, valueText = function(value) {
        if (value === null || value === undefined || value === "") return "";
        if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join("; ");
        if (typeof value === "object") return value.title || value.label || value.name || value.state || value.id || "";
        return String(value);
      }, band = (opp.metadata && opp.metadata.visualBands || []).find(function(item) { return item.id === selected.bandId; }), yearText = selected.year !== undefined ? String(selected.year) : "";
      if (selected.yearEnd !== undefined && selected.yearEnd !== selected.year) yearText += "–" + selected.yearEnd;
      var kicker = [selected.type && humanize(selected.type), yearText, selected.yearPrecision && humanize(selected.yearPrecision), selected.domain && humanize(selected.domain), selected.category && humanize(selected.category), band && band.label, selected.id && "ID " + selected.id].filter(Boolean);
      if (kicker.length) detail.appendChild(el("div", kicker.join(" · "), "record-kicker"));
      var sourceIds = [], addSourceIds = function(ids) { (Array.isArray(ids) ? ids : []).forEach(function(id) { if (id && sourceIds.indexOf(id) < 0) sourceIds.push(id); }); };
      var sourceContexts = new Map(), addSourceContext = function(id, note) {
        var context = valueText(note);
        if (!id || !context) return;
        if (!sourceContexts.has(id)) sourceContexts.set(id, []);
        if (sourceContexts.get(id).indexOf(context) < 0) sourceContexts.get(id).push(context);
      };
      addSourceIds(selected.sourceIds);
      addSourceIds(selected.status && selected.status.sourceIds);
      var evidence = Array.isArray(selected.evidence) ? selected.evidence : selected.evidence ? [selected.evidence] : [];
      evidence.forEach(function(item) { if (!item || typeof item !== "object") return; addSourceIds(item.sourceIds); (item.sourceIds || []).forEach(function(id) { addSourceContext(id, item.note); }); });
      addSourceIds(selected.noveltySearch && selected.noveltySearch.sourceIds);
      var c = el("div", null, "evidence-card");
      c.appendChild(el("span", "Imported, unreviewed", "badge"));
      var status = selected.status && typeof selected.status === "object" ? selected.status : null;
      if (typeof selected.status === "string") c.appendChild(el("p", "Status: " + selected.status));
      if (status && status.state) c.appendChild(el("p", "Status: " + status.state));
      var reportedGrade = selected.evidenceGrade || (evidence[0] && evidence[0].grade);
      if (reportedGrade) c.appendChild(el("p", "Reported grade: " + reportedGrade));
      if (status && status.scope) c.appendChild(el("p", "Scope: " + status.scope));
      if (selected.summary) c.appendChild(el("p", selected.summary));
      if (selected.falsifiableQuestion) c.appendChild(el("p", "Question: " + selected.falsifiableQuestion));
      ["unmetNeed", "baselines", "resources", "failureReasons", "crowdedness", "tractability"].forEach(function(key) {
        if (selected[key] !== undefined) c.appendChild(el("p", key.replace(/([A-Z])/g, " $1") + ": " + valueText(selected[key])));
      });
      if (selected.noveltySearch) c.appendChild(el("p", "Novelty review: " + [selected.noveltySearch.status, selected.noveltySearch.asOf, selected.noveltySearch.scope, selected.noveltySearch.result].filter(Boolean).join(" \xB7 ")));
      if (selected.proposedMechanism) c.appendChild(el("p", "Mechanism: " + selected.proposedMechanism));
      if (selected.adjacentWorkSummary) c.appendChild(el("p", "Adjacent work: " + selected.adjacentWorkSummary));
      if (selected.minimalExperiment) c.appendChild(el("p", "Test: " + selected.minimalExperiment));
      if (selected.disconfirmingResult) c.appendChild(el("p", "Disconfirming result: " + selected.disconfirmingResult));
      var addRecordLinks = function(ids, collectionKey, label) {
        (Array.isArray(ids) ? ids : []).forEach(function(id) {
          var found = (collections[collectionKey] && collections[collectionKey].records || []).find(function(item) { return item.id === id; });
          if (!found) return;
          var button = el("button", label + ": " + recordTitle(found), "source-link");
          button.type = "button";
          button.addEventListener("click", function() { selectTypedRecord(id); });
          c.appendChild(button);
        });
      };
      addRecordLinks(selected.blockerConstraintIds, "constraints", "Blocker");
      addRecordLinks(selected.requiredComplementNodeIds, "records", "Complement");
      addRecordLinks(selected.affectsNodeIds, "records", "Affects");
      addRecordLinks(selected.mitigatedByNodeIds, "records", "Mitigated by");
      addRecordLinks(selected.relationshipIds, "relationships", "Relationship");
      if (selected.evidence) evidence.forEach(function(item) { if (item.claim) c.appendChild(el("p", "Evidence claim: " + item.claim)); });
      if (selected.sourceNodeId || selected.targetNodeId) {
        var sourceNode = (opp.nodes || []).find(function(item) { return item.id === selected.sourceNodeId; }), targetNode = (opp.nodes || []).find(function(item) { return item.id === selected.targetNodeId; }), endpointText = "Endpoints: ";
        endpointText += sourceNode ? sourceNode.title : "Unknown source";
        endpointText += " → ";
        endpointText += targetNode ? targetNode.title : "Unknown target";
        if (selected.type) endpointText += " · " + humanize(selected.type);
        c.appendChild(el("p", endpointText));
        if (sourceNode) addRecordLinks([sourceNode.id], "records", "Open source");
        if (targetNode) addRecordLinks([targetNode.id], "records", "Open target");
      }
      if (selected.claim) c.appendChild(el("p", "Claim: " + selected.claim));
      if (selected.atlasLinks) selected.atlasLinks.forEach(function(atlasLink) { if (N.has(atlasLink.atlasNodeId)) { var atlasButton = el("button", "Open atlas: " + (node(atlasLink.atlasNodeId).title || atlasLink.atlasNodeId), "source-link"); atlasButton.type = "button"; atlasButton.addEventListener("click", function() { selectNode(atlasLink.atlasNodeId); }); c.appendChild(atlasButton); } });
      sourceIds.forEach(function(id) { if (OS.has(id)) { var source = OS.get(id); c.appendChild(link(source)); (Array.isArray(source.notes) ? source.notes : source.notes ? [source.notes] : []).forEach(function(note) { addSourceContext(id, note); }); (sourceContexts.get(id) || []).forEach(function(context) { c.appendChild(el("p", "Note: " + context, "record-kicker")); }); } });
      detail.appendChild(c);
      detail.scrollTop = 0;
      if (restoreControl && restoreControl.indexOf("opportunity-") === 0) {
        var restored = document.getElementById(restoreControl);
        if (restored) restored.focus({ preventScroll: true });
      }
    }
    function render() {
      document.querySelectorAll("[data-scope]").forEach(function(b) { b.setAttribute("aria-pressed", String(b.dataset.scope === state.scope)); });
      if (scopeFilter) { scopeFilter.value = state.highlight; scopeFilter.parentElement.hidden = state.scope !== "full"; }
      document.querySelector(".map-scope").hidden = state.view === "opportunity";
      document.getElementById("classification-legend").hidden = state.view === "opportunity" || state.scope !== "full";
      document.querySelector(".map-hint").textContent = state.scope === "full" ? "Years spaced for readability · select an idea · scroll to zoom" : "Select a line for evidence · drag to pan · scroll to zoom";
      document.querySelectorAll("[data-view]").forEach(function(b) {
        b.setAttribute("aria-pressed", b.dataset.view === state.view);
      });
      list.hidden = state.view !== "list";
      document.getElementById("map-stage").hidden = state.view === "opportunity";
      document.getElementById("opportunity-browser").hidden = state.view !== "opportunity";
      document.querySelector(".workspace-grid").hidden = state.view === "list";
      if (state.view === "list") return renderList();
      if (state.view === "learn") return renderLearn();
      if (state.view === "opportunity") return renderOpportunity();
      renderMap();
      state.selectedEdgeKey ? renderEdge() : renderNode();
    }
    search.addEventListener("input", function() {
      state.query = search.value;
      if (state.view === "list") renderList();
      results.replaceChildren();
      var q = state.query.trim().toLowerCase(), m = logic.searchNodes(data, q).map(function(node, index) { return { node: node, index: index }; }).sort(function(a, b) {
        var rank = function(item) {
          var id = String(item.node.id || "").toLowerCase(), title = String(item.node.title || "").toLowerCase(), description = String(item.node.description || "").toLowerCase();
          if (id === q) return 0;
          if (title === q) return 1;
          if (title.indexOf(q) === 0) return 2;
          if (title.indexOf(q) >= 0) return 3;
          if (description.indexOf(q) >= 0) return 4;
          return 5;
        };
        return rank(a) - rank(b) || (a.node.ordinal || a.index) - (b.node.ordinal || b.index);
      }).map(function(item) { return item.node; }).slice(0, 8);
      results.hidden = !q || !m.length;
      search.setAttribute("aria-expanded", String(!results.hidden));
      m.forEach(function(n, i) {
        var b = el("button");
        b.type = "button";
        b.setAttribute("role", "option");
        b.id = "search-option-" + i;
        b.setAttribute("aria-selected", i === 0);
        b.appendChild(el("span", n.title));
        b.appendChild(el("small", n.year + " \xB7 " + n.laneId));
        b.onclick = function() {
          search.value = n.title;
          results.hidden = true;
          selectNode(n.id, true);
        };
        results.appendChild(b);
      });
    });
    search.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        closeSearch();
        search.focus();
      }
      if (e.key === "Enter") {
        var b = results.querySelector("button[aria-selected=true]") || results.querySelector("button");
        if (b) b.click();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        var a = Array.from(results.querySelectorAll("button"));
        if (!a.length) return;
        e.preventDefault();
        var i = a.findIndex(function(x) {
          return x.getAttribute("aria-selected") === "true";
        }), j = (i + (e.key === "ArrowDown" ? 1 : -1) + a.length) % a.length;
        a.forEach(function(x, k) {
          x.setAttribute("aria-selected", k === j);
        });
        search.setAttribute("aria-activedescendant", a[j].id);
      }
    });
    document.addEventListener("keydown", function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.focus();
      }
    });
    document.querySelectorAll("[data-view]").forEach(function(b) {
      b.onclick = function() {
        if (b.dataset.view === "learn") {
          state.tourId = "pilot";
          selectTourStep(0);
          return;
        }
        state.view = b.dataset.view;
        state.selectedEdgeKey = null;
        write(false);
        render();
      };
    });
    var scopeButtons = document.querySelectorAll("[data-scope]"), scopeFilter = document.getElementById("classification-filter");
    scopeButtons.forEach(function(b) { b.onclick = function() { state.scope = b.dataset.scope === "focus" ? "focus" : "full"; state.camera = { x: 0, y: 0, scale: 1 }; state.view = "explore"; scopeButtons.forEach(function(x) { x.setAttribute("aria-pressed", String(x === b)); }); write(false); render(); }; });
    if (scopeFilter) { scopeFilter.value = state.highlight; scopeFilter.onchange = function() { state.highlight = scopeFilter.value; write(false); render(); }; }
    document.querySelector("[data-action=fit]").onclick = function() {
      state.camera = { x: 0, y: 0, scale: 1 };
      renderMap();
    };
    document.querySelector("[data-action=reset]").onclick = function() {
      state.camera = { x: 0, y: 0, scale: 1 };
      state.showAllConnections = false;
      state.scope = "full";
      state.view = "explore";
      state.highlight = "all";
      state.query = "";
      search.value = "";
      closeSearch();
      write(false);
      render();
    };
    function svgPoint(clientX, clientY) {
      var ctm = svg.getScreenCTM();
      if (ctm && typeof DOMPoint === "function") return new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      var rect = svg.getBoundingClientRect();
      return { x: (clientX - rect.left) / rect.width * 1000, y: (clientY - rect.top) / rect.height * 650 };
    }
    function zoomAt(clientX, clientY, amount) {
      var point = svgPoint(clientX, clientY), oldScale = state.camera.scale, nextScale = Math.max(0.55, Math.min(state.scope === "full" ? 8 : 2.4, oldScale + amount));
      if (nextScale === oldScale) return;
      var worldX = (point.x - state.camera.x) / oldScale, worldY = (point.y - state.camera.y) / oldScale;
      state.camera.scale = nextScale;
      state.camera.x = point.x - worldX * nextScale;
      state.camera.y = point.y - worldY * nextScale;
      renderMap();
    }
    document.querySelector("[data-action=zoom-in]").onclick = function() {
      var rect = svg.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, state.scope === "full" ? state.camera.scale * 0.3 : 0.1);
    };
    document.querySelector("[data-action=zoom-out]").onclick = function() {
      var rect = svg.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, state.scope === "full" ? -state.camera.scale * 0.3 : -0.1);
    };
    document.querySelector("[data-action=share]").onclick = function() {
      var h = location.href;
      var status = document.getElementById("share-status");
      status.hidden = false;
      var shareLink = el("a", "Open this shareable view"); shareLink.href = h; status.replaceChildren(shareLink);
      if (navigator.clipboard) navigator.clipboard.writeText(h).then(function() { status.textContent = "Share link copied"; }).catch(function() {});
    };
    document.querySelector("[data-action=help]").onclick = function() {
      var help = document.getElementById("help-dialog");
      if (help && typeof help.showModal === "function") help.showModal();
    };
    document.querySelector("[data-action=theme]").onclick = function() {
      var d2 = !document.documentElement.classList.contains("dark");
      document.documentElement.classList.toggle("dark", d2);
      try {
        localStorage.setItem("atlas-theme", d2 ? "dark" : "light");
      } catch (_) {
      }
    };
    var dragging = false, dragStart = null, dragPointerId = null;
    svg.addEventListener("pointerdown", function(event) {
      if (event.button !== 0 || event.target.closest && event.target.closest(".node, .edge-hit")) return;
      svg.focus();
      dragging = false;
      dragPointerId = event.pointerId;
      var point = svgPoint(event.clientX, event.clientY);
      dragStart = { x: point.x, y: point.y, cx: state.camera.x, cy: state.camera.y };
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointermove", function(event) {
      if (dragPointerId !== event.pointerId || !dragStart) return;
      var point = svgPoint(event.clientX, event.clientY);
      if (!dragging && Math.hypot(point.x - dragStart.x, point.y - dragStart.y) < 4) return;
      dragging = true;
      state.camera.x = dragStart.cx + point.x - dragStart.x;
      state.camera.y = dragStart.cy + point.y - dragStart.y;
      content.setAttribute("transform", "translate(" + state.camera.x + " " + state.camera.y + ") scale(" + state.camera.scale + ")");
    });
    svg.addEventListener("pointerup", function(event) {
      if (dragPointerId !== event.pointerId) return;
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      dragging = false;
      dragStart = null;
      dragPointerId = null;
      if (state.scope === "full") renderMap();
    });
    svg.addEventListener("pointercancel", function(event) {
      if (dragPointerId !== event.pointerId) return;
      dragging = false;
      dragStart = null;
      dragPointerId = null;
    });
    svg.addEventListener("wheel", function(event) {
      if (!svg.contains(event.target)) return;
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, (event.deltaY < 0 ? 1 : -1) * (state.scope === "full" ? state.camera.scale * 0.15 : 0.1));
    }, { passive: false });
    document.addEventListener("click", function(event) { if (!event.target.closest(".search")) closeSearch(); });
    window.addEventListener("popstate", function() {
      parse();
      render();
    });
    window.addEventListener("hashchange", function() {
      parse();
      render();
    });
    window.addEventListener("resize", function() {
      if (state.view === "explore" || state.view === "learn") renderMap();
    });
    parse();
    try {
      var d = localStorage.getItem("atlas-theme");
      document.documentElement.classList.toggle("dark", d ? d === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (_) {
    }
      document.getElementById("dataset-status").textContent = data.nodes.length + " records \xB7 " + data.relationships.length + " relationships";
    render();
  })();
})();
