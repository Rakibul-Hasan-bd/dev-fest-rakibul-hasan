/* routing.js — Smart Escape
 * Dijkstra over building.json (nodes / edges / initial_state).
 *
 * Route choice for a room, in order:
 *   1. lowest total cost
 *   2. lexicographically smallest exit ID (plain string compare)
 *   3. lexicographically smallest path (sequence of node IDs, then edge IDs)
 *
 * Assumptions: edges are undirected unless { directed: true } is passed to
 * buildGraph; costs are positive; exits are terminal (never walked through).
 */
(function (global) {
  'use strict';

  const EPS = 1e-9;
  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  function cmpSeq(a, b) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const c = cmpStr(a[i], b[i]);
      if (c) return c;
    }
    return a.length - b.length;
  }
  // Compare two equal-cost routes by node sequence, then by edge IDs.
  const cmpRoute = (a, b) => cmpSeq(a.path, b.path) || cmpSeq(a.edges, b.edges);

  /* ---------- min-heap keyed on (cost, id) ---------- */
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    less(x, y) { return x.cost < y.cost - EPS || (Math.abs(x.cost - y.cost) <= EPS && x.id < y.id); }
    push(item) {
      const a = this.a;
      a.push(item);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!this.less(a[i], a[p])) break;
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      }
    }
    pop() {
      const a = this.a;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && this.less(a[l], a[m])) m = l;
          if (r < a.length && this.less(a[r], a[m])) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]];
          i = m;
        }
      }
      return top;
    }
  }

  /* ---------- graph ---------- */
  function validate(building) {
    const errors = [];
    if (!building || !Array.isArray(building.nodes) || !Array.isArray(building.edges)) {
      return ['Expected "nodes" and "edges" arrays.'];
    }
    const ids = new Set();
    for (const n of building.nodes) {
      if (!n.id) errors.push('A node is missing "id".');
      else if (ids.has(n.id)) errors.push(`Duplicate node id "${n.id}".`);
      ids.add(n.id);
      if (!['room', 'junction', 'exit'].includes(n.type)) errors.push(`Node "${n.id}" has invalid type "${n.type}".`);
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) errors.push(`Node "${n.id}" needs numeric x and y.`);
    }
    const eids = new Set();
    for (const e of building.edges) {
      if (eids.has(e.id)) errors.push(`Duplicate edge id "${e.id}".`);
      eids.add(e.id);
      if (!ids.has(e.from) || !ids.has(e.to)) errors.push(`Edge "${e.id}" references an unknown node.`);
      if (!(e.cost > 0)) errors.push(`Edge "${e.id}" needs a positive cost.`);
    }
    return errors;
  }

  function buildGraph(building, opts) {
    const directed = !!(opts && opts.directed);
    const nodes = new Map(building.nodes.map(n => [n.id, n]));
    const edges = new Map(building.edges.map(e => [e.id, e]));
    const adj = new Map([...nodes.keys()].map(id => [id, []]));
    for (const e of building.edges) {
      if (!nodes.has(e.from) || !nodes.has(e.to)) continue;
      adj.get(e.from).push({ to: e.to, edge: e.id, cost: e.cost });
      if (!directed) adj.get(e.to).push({ to: e.from, edge: e.id, cost: e.cost });
    }
    return { nodes, edges, adj };
  }

  const normState = s => ({
    blockedNodes: new Set((s && (s.blockedNodes || s.blocked_nodes)) || []),
    blockedEdges: new Set((s && (s.blockedEdges || s.blocked_edges)) || []),
    closedExits: new Set((s && (s.closedExits || s.closed_exits)) || [])
  });

  function nodeUsable(graph, id, st) {
    const n = graph.nodes.get(id);
    if (!n || st.blockedNodes.has(id)) return false;
    return !(n.type === 'exit' && st.closedExits.has(id));
  }

  /* ---------- Dijkstra from one source ---------- */
  function dijkstra(graph, state, source) {
    const st = normState(state);
    const best = new Map(); // id -> { cost, path[], edges[] }
    if (!nodeUsable(graph, source, st)) return best;

    best.set(source, { cost: 0, path: [source], edges: [] });
    const heap = new Heap();
    const done = new Set();
    heap.push({ cost: 0, id: source });

    while (heap.size) {
      const { cost, id } = heap.pop();
      if (done.has(id) || cost > best.get(id).cost + EPS) continue;
      done.add(id);
      if (id !== source && graph.nodes.get(id).type === 'exit') continue; // exits are terminal

      const cur = best.get(id);
      for (const link of graph.adj.get(id)) {
        if (st.blockedEdges.has(link.edge) || !nodeUsable(graph, link.to, st)) continue;
        const cand = {
          cost: cur.cost + link.cost,
          path: cur.path.concat(link.to),
          edges: cur.edges.concat(link.edge)
        };
        const old = best.get(link.to);
        const better = !old || cand.cost < old.cost - EPS ||
          (Math.abs(cand.cost - old.cost) <= EPS && cmpRoute(cand, old) < 0);
        if (better) {
          best.set(link.to, cand);
          heap.push({ cost: cand.cost, id: link.to });
        }
      }
    }
    return best;
  }

  /* ---------- best exit for one source ---------- */
  function routeFrom(graph, state, source) {
    const reach = dijkstra(graph, state, source);
    const st = normState(state);
    let chosen = null;
    for (const [id, r] of reach) {
      const n = graph.nodes.get(id);
      if (n.type !== 'exit' || !nodeUsable(graph, id, st)) continue;
      if (!chosen || r.cost < chosen.cost - EPS ||
          (Math.abs(r.cost - chosen.cost) <= EPS && id < chosen.exitId)) {
        chosen = { exitId: id, cost: r.cost, path: r.path, edges: r.edges };
      }
    }
    return chosen; // null when no open exit is reachable
  }

  /* ---------- every room -> its route (or null) ---------- */
  function computeRoutes(graph, state) {
    const routes = new Map();
    for (const n of graph.nodes.values()) {
      if (n.type === 'room') routes.set(n.id, routeFrom(graph, state, n.id));
    }
    return routes;
  }

  const api = { validate, buildGraph, dijkstra, routeFrom, computeRoutes, normState };
  global.Routing = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
