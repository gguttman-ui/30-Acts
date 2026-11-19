// treeLayout.js - David's fix 9 (19 Nov 2026): where each leaf goes.
// A fixed tree shape whose leaves fill preset positions in order (David:
// "a fixed tree shape whose leaves fill preset positions in order is fine").
// Pure maths, so it is tested without drawing anything.

export const VIEW_W = 320;
export const VIEW_H = 340;
export const CROWN = { cx: 160, cy: 125, r: 92 };   // your leaves
export const TRUNK = { x: 160, top: 175, bottom: 330 };
export const MAX_OWN_LEAVES    = 150;  // more acts than this: the crown is full
export const MAX_BRANCHES      = 8;
export const MAX_BRANCH_LEAVES = 24;

const GOLDEN = Math.PI * (3 - Math.sqrt(5));  // ~137.5 degrees

/** Leaf i of n spread evenly over a circle (sunflower pattern). */
function spiral(i, n, cx, cy, r) {
  const rr = r * Math.sqrt((i + 0.5) / n);
  const a = i * GOLDEN;
  return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a), angle: (a * 180) / Math.PI };
}

/** Your leaves: first act near the middle, later ones further out. */
export function ownLeafPositions(count) {
  const n = Math.min(count, MAX_OWN_LEAVES);
  return Array.from({ length: n }, (_, i) => spiral(i, MAX_OWN_LEAVES, CROWN.cx, CROWN.cy, CROWN.r));
}

/**
 * Branch k (0 = most acts) leaves the trunk alternately left and right,
 * lower each time, and its leaves cluster at the tip.
 */
export function branchShape(k) {
  const side = k % 2 === 0 ? -1 : 1;
  const level = Math.floor(k / 2);              // 0..3
  const startY = TRUNK.top + 22 + level * 30;
  const tipX = TRUNK.x + side * (78 + (level % 2) * 14);
  const tipY = startY - 34;
  return { x1: TRUNK.x, y1: startY, x2: tipX, y2: tipY, side };
}

export function branchLeafPositions(k, count) {
  const { x2, y2 } = branchShape(k);
  const n = Math.min(count, MAX_BRANCH_LEAVES);
  return Array.from({ length: n }, (_, i) => spiral(i, MAX_BRANCH_LEAVES, x2, y2, 26));
}

/** Branch act counts the drawing can show, and how many people did not fit. */
export function visibleBranches(branches) {
  const list = Array.isArray(branches) ? branches.map((n) => Math.max(0, Number(n) || 0)) : [];
  return { shown: list.slice(0, MAX_BRANCHES), hidden: Math.max(0, list.length - MAX_BRANCHES) };
}
