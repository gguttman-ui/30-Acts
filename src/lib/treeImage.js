// treeImage.js - which tree picture goes with how many acts. Shared by the
// Tree tab and the "Day N done" screen (David's fix 8, 19 Nov 2026).
const TREE_SAPLING = require('../assets/tree/tree-sapling.png');
const TREE_YOUNG   = require('../assets/tree/tree-young.png');
const TREE_FULL    = require('../assets/tree/tree-full.png');

export const treeForCount = (count) => {
  if (count <= 10) return TREE_SAPLING;
  if (count <= 20) return TREE_YOUNG;
  return TREE_FULL;
};

export const stageLabel = (count) => {
  if (count <= 10) return 'Sapling';
  if (count <= 20) return 'Young Tree';
  return 'Mature Tree';
};
