/* mapRenderer.js — Smart Escape
 * Renders building.json into the #map SVG.
 *   click room/junction -> toggle blocked_nodes
 *   click exit          -> toggle closed_exits
 *   click corridor      -> toggle blocked_edges
 * Every toggle recomputes all routes (Routing.computeRoutes) and redraws.
 *
 * const map = new MapRenderer(svgEl, { onChange, t, directed });
 * map.load(buildingJson);
 */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000, H = 640, PAD = 80;

  function el(name, attrs, cls) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (cls) e.setAttribute('class', cls);
    return e;
  }
  const clear = g => { while (g.firstChild) g.removeChild(g.firstChild); };

  class MapRenderer {
    constructor(svg, opts) {
      opts = opts || {};
      this.svg = svg;
      this.onChange = opts.onChange || (() => {});
      this.t = opts.t || (k => k);
      this.directed = !!opts.directed;
      this.tooltip = opts.tooltip || document.getElementById('tooltip');
      this.layers = {};
      ['floor', 'hazards', 'routes', 'exits', 'agents', 'labels'].forEach(n => {
        this.layers[n] = svg.querySelector('#layer-' + n);
      });
      this.layers.routes.style.pointerEvents = 'none';
      this.layers.hazards.style.pointerEvents = 'none';
      this.layers.labels.style.pointerEvents = 'none';
      this.view = { x: 0, y: 0, w: W, h: H };
      this.building = null;
      this.routes = new Map();
    }

    /* ---------- loading ---------- */
    load(building) {
      const errors = Routing.validate(building);
      if (errors.length) return errors;

      this.building = building;
      this.graph = Routing.buildGraph(building, { directed: this.directed });
      this.initial = Routing.normState(building.initial_state);
      this.state = this.cloneState(this.initial);
      this.computeLayout();
      this.drawStatic();
      this.fit();
      this.refresh({ kind: 'load' });
      return [];
    }

    cloneState(s) {
      return {
        blockedNodes: new Set(s.blockedNodes),
        blockedEdges: new Set(s.blockedEdges),
        closedExits: new Set(s.closedExits)
      };
    }

    computeLayout() {
      const ns = this.building.nodes;
      const xs = ns.map(n => n.x), ys = ns.map(n => n.y);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const w = Math.max(...xs) - minX || 1, h = Math.max(...ys) - minY || 1;
      const s = Math.min((W - 2 * PAD) / w, (H - 2 * PAD) / h);
      const ox = (W - w * s) / 2, oy = (H - h * s) / 2;
      this.pos = new Map(ns.map(n => [n.id, { x: ox + (n.x - minX) * s, y: oy + (n.y - minY) * s }]));
    }

    /* ---------- static DOM (built once per file) ---------- */
    drawStatic() {
      Object.values(this.layers).forEach(clear);
      this.edgeEls = new Map();
      this.nodeEls = new Map();

      for (const e of this.building.edges) {
        const a = this.pos.get(e.from), b = this.pos.get(e.to);
        if (!a || !b) continue;
        const g = el('g', { 'data-edge': e.id }, 'corridor-group');
        const line = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, 'corridor-line');
        const hit = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, 'corridor-hit');
        hit.setAttribute('tabindex', '0');
        hit.setAttribute('role', 'button');
        g.append(line, hit);
        this.layers.floor.appendChild(g);
        this.edgeEls.set(e.id, { g, line, hit });
        this.bind(hit, () => this.toggleEdge(e.id), () => this.edgeTip(e));

        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const lab = el('text', { x: mx, y: my - 6 }, 'label cost-label');
        lab.textContent = e.cost;
        this.layers.labels.appendChild(lab);
      }

      for (const n of this.building.nodes) {
        const p = this.pos.get(n.id);
        let shape, layer = this.layers.agents;
        if (n.type === 'exit') {
          shape = el('rect', { x: p.x - 15, y: p.y - 15, width: 30, height: 30, rx: 7 }, 'exit');
          layer = this.layers.exits;
        } else if (n.type === 'room') {
          shape = el('circle', { cx: p.x, cy: p.y, r: 16 }, 'room');
        } else {
          shape = el('circle', { cx: p.x, cy: p.y, r: 7 }, 'room junction');
        }
        shape.setAttribute('tabindex', '0');
        shape.setAttribute('role', 'button');
        shape.classList.add('node');
        layer.appendChild(shape);
        this.nodeEls.set(n.id, shape);
        this.bind(shape, () => this.toggleNode(n.id), () => this.nodeTip(n));

        if (n.type !== 'junction' || n.label) {
          const lab = el('text', { x: p.x, y: p.y + (n.type === 'junction' ? 22 : 34) }, 'label');
          lab.textContent = n.label || n.id;
          this.layers.labels.appendChild(lab);
        }
      }
    }

    bind(node, action, tipText) {
      node.addEventListener('click', action);
      node.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); action(); }
      });
      node.addEventListener('mousemove', ev => this.showTip(ev, tipText()));
      node.addEventListener('mouseleave', () => this.hideTip());
      node.addEventListener('blur', () => this.hideTip());
    }

    /* ---------- toggles ---------- */
    flip(set, id) {
      const now = !set.has(id);
      now ? set.add(id) : set.delete(id);
      return now;
    }
    toggleNode(id) {
      const n = this.graph.nodes.get(id);
      const set = n.type === 'exit' ? this.state.closedExits : this.state.blockedNodes;
      const on = this.flip(set, id);
      this.refresh({ kind: n.type === 'exit' ? 'exit' : 'node', id, active: on });
    }
    toggleEdge(id) {
      const on = this.flip(this.state.blockedEdges, id);
      this.refresh({ kind: 'edge', id, active: on });
    }
    reset() {
      if (!this.building) return;
      this.state = this.cloneState(this.initial);
      this.refresh({ kind: 'reset' });
    }
    exportState() {
      const s = x => [...x].sort();
      return {
        blocked_nodes: s(this.state.blockedNodes),
        blocked_edges: s(this.state.blockedEdges),
        closed_exits: s(this.state.closedExits)
      };
    }

    /* ---------- dynamic redraw + rerouting ---------- */
    refresh(event) {
      if (!this.building) return;
      const st = this.state;
      this.routes = Routing.computeRoutes(this.graph, st);

      // node / edge classes
      for (const n of this.building.nodes) {
        const e = this.nodeEls.get(n.id);
        const off = n.type === 'exit' ? st.closedExits.has(n.id) : st.blockedNodes.has(n.id);
        const stranded = n.type === 'room' && !off && !this.routes.get(n.id);
        e.classList.toggle('is-blocked', off);
        e.classList.toggle('is-stranded', stranded);
        e.setAttribute('aria-pressed', off);
        e.setAttribute('aria-label', this.nodeTip(n));
      }
      for (const [id, o] of this.edgeEls) {
        const off = st.blockedEdges.has(id);
        o.line.classList.toggle('is-blocked', off);
        o.hit.setAttribute('aria-pressed', off);
        o.hit.setAttribute('aria-label', this.edgeTip(this.graph.edges.get(id)));
      }

      this.drawHazards();
      this.drawRoutes();
      this.onChange({ event, routes: this.routes, stats: this.stats(), state: this.exportState() });
    }

    drawHazards() {
      const g = this.layers.hazards;
      clear(g);
      const cross = (x, y, r) => {
        const c = el('g', {}, 'cross');
        c.append(
          el('line', { x1: x - r, y1: y - r, x2: x + r, y2: y + r }),
          el('line', { x1: x - r, y1: y + r, x2: x + r, y2: y - r })
        );
        g.appendChild(c);
      };
      for (const id of this.state.blockedEdges) {
        const e = this.graph.edges.get(id);
        const a = e && this.pos.get(e.from), b = e && this.pos.get(e.to);
        if (a && b) cross((a.x + b.x) / 2, (a.y + b.y) / 2, 9);
      }
      for (const id of [...this.state.blockedNodes, ...this.state.closedExits]) {
        const p = this.pos.get(id);
        if (p) cross(p.x, p.y, 11);
      }
    }

    drawRoutes() {
      const g = this.layers.routes;
      clear(g);
      for (const r of this.routes.values()) {
        if (!r) continue;
        const pts = r.path.map(id => { const p = this.pos.get(id); return p.x + ',' + p.y; }).join(' ');
        const line = el('polyline', { points: pts }, 'route');
        line.setAttribute('data-exit', r.exitId);
        g.appendChild(line);
      }
    }

    stats() {
      const st = this.state;
      const nodes = this.building.nodes;
      const rooms = nodes.filter(n => n.type === 'room');
      const usableRooms = rooms.filter(n => !st.blockedNodes.has(n.id));
      const routed = usableRooms.filter(n => this.routes.get(n.id));
      const openExits = nodes.filter(n => n.type === 'exit' && !st.closedExits.has(n.id) && !st.blockedNodes.has(n.id));
      const costs = routed.map(n => this.routes.get(n.id).cost);
      return {
        rooms: rooms.length,
        routed: routed.length,
        stranded: usableRooms.length - routed.length,
        blockedRooms: rooms.length - usableRooms.length,
        openExits: openExits.length,
        blockedEdges: st.blockedEdges.size,
        blockedNodes: st.blockedNodes.size,
        maxCost: costs.length ? Math.max(...costs) : null
      };
    }

    /* ---------- tooltip ---------- */
    nodeTip(n) {
      const st = this.state;
      const off = n.type === 'exit' ? st.closedExits.has(n.id) : st.blockedNodes.has(n.id);
      let s = `${n.label || n.id} (${n.id}) — ${this.t(off ? (n.type === 'exit' ? 'closed' : 'blocked') : 'open')}`;
      const r = n.type === 'room' && this.routes.get(n.id);
      if (r) s += ` → ${r.exitId}, ${this.t('cost')} ${+r.cost.toFixed(2)}`;
      else if (n.type === 'room' && !off) s += ` — ${this.t('noRoute')}`;
      return s;
    }
    edgeTip(e) {
      const off = this.state.blockedEdges.has(e.id);
      return `${e.id}: ${e.from} ↔ ${e.to}, ${this.t('cost')} ${e.cost} — ${this.t(off ? 'blocked' : 'open')}`;
    }
    showTip(ev, text) {
      const tip = this.tooltip;
      if (!tip) return;
      const box = tip.offsetParent.getBoundingClientRect();
      tip.textContent = text;
      tip.hidden = false;
      tip.style.left = Math.min(ev.clientX - box.left + 14, box.width - tip.offsetWidth - 8) + 'px';
      tip.style.top = Math.max(ev.clientY - box.top - 34, 6) + 'px';
    }
    hideTip() { if (this.tooltip) this.tooltip.hidden = true; }

    /* ---------- view ---------- */
    applyView() {
      const v = this.view;
      this.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    }
    fit() { this.view = { x: 0, y: 0, w: W, h: H }; this.applyView(); }
    zoom(factor) {
      const v = this.view;
      const w = Math.min(W * 2, Math.max(W / 6, v.w / factor));
      const h = w * H / W;
      this.view = { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
      this.applyView();
    }
  }

  global.MapRenderer = MapRenderer;
})(window);
