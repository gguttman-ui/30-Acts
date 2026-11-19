// KindnessTree.js - David's fix 9 (19 Nov 2026): the tree drawn from real data.
//   dark green leaf  = one of your acts (newest in gold)
//   branch           = one person who joined through you
//   light green leaf = an act by that person or the people they brought in
// Tapping one of your leaves calls onOwnLeaf(act); a friend's leaf calls
// onFriendLeaf() - their stories stay private.
import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Line, Ellipse, G, Text as SvgText } from 'react-native-svg';
import {
  VIEW_W, VIEW_H, TRUNK, ownLeafPositions, branchShape, branchLeafPositions, visibleBranches,
} from '../lib/treeLayout';

const OWN    = '#114E33';
const FRIEND = '#5FAE7C';
const GOLD   = '#EABA4B';
const BARK   = '#7A5A3C';

function Leaf({ x, y, angle, fill, stroke, onPress }) {
  return (
    <G onPress={onPress}>
      {/* bigger invisible circle so the leaf is easy to tap */}
      <Ellipse cx={x} cy={y} rx={11} ry={11} fill="transparent" />
      <Ellipse
        cx={x} cy={y} rx={8} ry={5}
        fill={fill} stroke={stroke} strokeWidth={stroke ? 1.5 : 0}
        transform={`rotate(${angle % 180} ${x} ${y})`}
      />
    </G>
  );
}

export default function KindnessTree({ ownActs = [], branches = [], onOwnLeaf, onFriendLeaf }) {
  const own = ownLeafPositions(ownActs.length);
  const { shown, hidden } = visibleBranches(branches);
  const newest = own.length - 1;

  return (
    <View style={{ width: '100%', aspectRatio: VIEW_W / VIEW_H }}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
      {/* ground */}
      <Ellipse cx={TRUNK.x} cy={TRUNK.bottom + 2} rx={110} ry={7} fill="#E3F1E8" />
      {/* trunk */}
      <Path
        d={`M ${TRUNK.x - 12} ${TRUNK.bottom} C ${TRUNK.x - 8} 260, ${TRUNK.x - 6} 210, ${TRUNK.x - 4} ${TRUNK.top - 20}
            L ${TRUNK.x + 4} ${TRUNK.top - 20} C ${TRUNK.x + 6} 210, ${TRUNK.x + 8} 260, ${TRUNK.x + 12} ${TRUNK.bottom} Z`}
        fill={BARK}
      />
      {/* one branch per person you inspired */}
      {shown.map((acts, k) => {
        const b = branchShape(k);
        return (
          <G key={`b${k}`}>
            <Line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={BARK} strokeWidth={5} strokeLinecap="round" />
            {branchLeafPositions(k, acts).map((p, i) => (
              <Leaf key={`b${k}l${i}`} {...p} fill={FRIEND} onPress={onFriendLeaf} />
            ))}
          </G>
        );
      })}
      {hidden > 0 && (
        <SvgText x={TRUNK.x} y={VIEW_H - 4} fontSize={12} fill="#4E6458" textAnchor="middle">
          {`+${hidden} more ${hidden === 1 ? 'person' : 'people'}`}
        </SvgText>
      )}
      {/* your leaves, oldest first; the newest one is gold */}
      {own.map((p, i) => (
        <Leaf
          key={`o${i}`}
          {...p}
          fill={i === newest ? GOLD : OWN}
          stroke={i === newest ? '#8A5A00' : undefined}
          onPress={() => onOwnLeaf && onOwnLeaf(ownActs[i])}
        />
      ))}
    </Svg>
    </View>
  );
}
