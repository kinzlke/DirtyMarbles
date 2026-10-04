window.renderBoard = function renderBoard(svg, layout, state, highlights) {
  const seats = layout.seats;
  const points = [
    ...layout.track,
    ...seats.flatMap((s) => [...s.home, ...s.bank, s.start]),
  ];
  const maxR = Math.max(...points.map((p) => Math.hypot(p.x, p.y))) + 2.4;
  const size = 1000;
  const scale = 430 / maxR;
  const cx = size / 2;
  const cy = size / 2;
  const xy = (p) => [cx + p.x * scale, cy + p.y * scale];
  const gap = minGap(layout.track);
  const holeR = Math.max(8, Math.min(16, gap * scale * 0.36));
  const at = new Map();
  layout.track.forEach((hole, index) => at.set(`track-${index}`, hole));
  seats.forEach((seat) => {
    at.set(seat.start.id, layout.track[seat.start.trackIndex]);
    seat.home.forEach((hole) => at.set(hole.id, hole));
    seat.bank.forEach((hole) => at.set(hole.id, hole));
  });

  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.replaceChildren();
  const boardR = maxR * scale;
  svg.append(el("circle", { cx, cy, r: boardR, fill: "#b7b9bd", stroke: "#6e7074", "stroke-width": 8 }));
  svg.append(el("circle", { cx, cy, r: boardR - 10, fill: "none", stroke: "#e4e5e7", "stroke-width": 2 }));

  const entrance = new Set(seats.map((s) => s.homeEntranceTrackIndex));
  const startAt = new Map(seats.map((s) => [s.start.trackIndex, s.color]));
  layout.track.forEach((hole, index) => {
    const [x, y] = xy(hole);
    const color = startAt.get(index);
    svg.append(holeNode(x, y, holeR, {
      id: `track-${index}`,
      kind: color ? "start" : entrance.has(index) ? "entrance" : "track",
      color,
      label: color ? "S" : "",
      hot: highlights && highlights.has(`track-${index}`),
    }));
  });

  seats.forEach((seat) => {
    seat.home.forEach((hole, i) => {
      const [x, y] = xy(hole);
      svg.append(holeNode(x, y, holeR, {
        id: hole.id, kind: "home", color: seat.color, label: String(i + 1),
        hot: highlights && highlights.has(hole.id),
      }));
    });
    seat.bank.forEach((hole) => {
      const [x, y] = xy(hole);
      svg.append(holeNode(x, y, holeR, {
        id: hole.id, kind: "bank", color: seat.color,
        hot: highlights && highlights.has(hole.id),
      }));
    });
    const angle = seat.angleDeg * Math.PI / 180;
    svg.append(el("text", {
      x: cx + Math.cos(angle) * (boardR - 36),
      y: cy + Math.sin(angle) * (boardR - 36),
      "text-anchor": "middle", fill: window.COLORS[seat.color],
      "font-size": 22, "font-weight": 700, "font-family": "sans-serif",
    }, seat.color.toUpperCase()));
  });

  if (!state) return;
  state.colors.forEach((color) => {
    state.marbles[color].forEach((holeId, index) => {
      const pos = at.get(holeId);
      if (!pos) return;
      const [x, y] = xy(pos);
      svg.append(marble(x, y, holeR * 0.72, color, holeId, index));
    });
  });
};

function holeNode(x, y, holeR, meta) {
  const g = el("g", {
    class: meta.hot ? "hole hot" : "hole",
    "data-id": meta.id,
    "data-kind": meta.kind,
    "data-color": meta.color || "",
    role: "button",
  });
  g.append(el("circle", {
    cx: x, cy: y, r: holeR, fill: meta.hot ? "#f4e2a8" : "#6e7074",
    stroke: meta.color ? window.COLORS[meta.color] : "#4e5054",
    "stroke-width": meta.hot ? 3 : meta.color ? Math.max(2, holeR * 0.18) : 1,
  }));
  if (meta.label) {
    g.append(el("text", {
      x, y: y + holeR * 0.28, "text-anchor": "middle",
      fill: meta.color === "Yellow" || meta.color === "White" ? "#3a2e04" : "#fff",
      "font-size": Math.max(9, holeR * 0.85), "font-weight": 700, "font-family": "sans-serif",
    }, meta.label));
  }
  return g;
}

function marble(x, y, r, color, holeId, index) {
  return el("circle", {
    class: "marble",
    cx: x, cy: y, r,
    fill: window.COLORS[color],
    stroke: color === "White" ? "#222" : "#fff",
    "stroke-width": 1.5,
    "data-color": color,
    "data-hole": holeId,
    "data-index": index,
  });
}

function minGap(track) {
  let gap = Infinity;
  for (let i = 0; i < track.length; i += 1) {
    const a = track[i];
    const b = track[(i + 1) % track.length];
    gap = Math.min(gap, Math.hypot(a.x - b.x, a.y - b.y));
  }
  return gap;
}

function el(name, attrs, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}
