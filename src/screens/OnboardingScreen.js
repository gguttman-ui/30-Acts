import React, { useRef, useState } from 'react';
import {
  View, Text, Image, FlatList, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants';
import { TOUR_PAGES, isLastPage, showSkip } from '../lib/tourPages';

// First-run tour (items 101 + 102). Five swipeable pages with Skip, progress
// dots and a Next / "Let's get started" button. onDone runs for both Skip and
// the last button (first launch -> sign-in; after sign-up -> the app;
// from Help -> back).
const TREES = [
  require('../assets/tree/tree-sapling.png'),
  require('../assets/tree/tree-young.png'),
  require('../assets/tree/tree-full.png'),
];

export default function OnboardingScreen({ onDone }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  const goNext = () => {
    if (isLastPage(index)) { onDone && onDone(); return; }
    const next = index + 1;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  };

  const onScrollEnd = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (i !== index) setIndex(i);
  };

  const page = TOUR_PAGES[index];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.topBar}>
        {showSkip(index) ? (
          <TouchableOpacity onPress={() => onDone && onDone()} hitSlop={12} accessibilityRole="button">
            <Text style={s.skip}>Skip</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={TOUR_PAGES}
        keyExtractor={(p) => p.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={[s.page, { width }]}>
            <PageBody item={item} />
          </View>
        )}
      />

      <View style={s.footer}>
        <View style={s.dots}>
          {TOUR_PAGES.map((p, i) => (
            <View key={p.key} style={[s.dot, i === index && s.dotOn]} />
          ))}
        </View>
        <TouchableOpacity onPress={goNext} style={s.btn} accessibilityRole="button">
          <Text style={s.btnText}>{page.button}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function PageBody({ item }) {
  return (
    <View style={s.body}>
      {item.kind === 'welcome' ? (
        <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
      ) : null}
      <Text style={s.title}>{item.title}</Text>
      <Text style={s.text}>{item.body}</Text>

      {item.kind === 'pick' ? (
        <>
          <View style={s.list}>
            {item.examples.map((ex, i) => (
              <View key={ex} style={s.example}>
                <View style={[s.radio, i === 0 && s.radioOn]} />
                <Text style={s.exampleText}>{ex}</Text>
              </View>
            ))}
          </View>
          <Text style={s.text}>{item.body2}</Text>
          <View style={s.sample}>
            <Text style={s.sampleText}>{item.sample}</Text>
            <View style={s.mic}><Text style={s.micText}>🎤</Text></View>
          </View>
        </>
      ) : null}

      {item.kind === 'days' ? (
        <>
          <View style={s.grid}>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
              <View
                key={d}
                style={[s.cell, d <= 12 && s.cellDone, d === 13 && s.cellToday, d > 13 && s.cellFuture]}
              >
                <Text style={[s.cellText, d <= 12 && s.cellTextDone]}>{d <= 12 ? '✓' : d}</Text>
              </View>
            ))}
          </View>
          <Text style={s.textStrong}>{item.body2}</Text>
        </>
      ) : null}

      {item.kind === 'tree' ? (
        <View style={s.trees}>
          {item.stages.map((st, i) => (
            <View key={st.label} style={s.treeCol}>
              <Image source={TREES[i]} style={s.treeImg} resizeMode="contain" />
              <Text style={s.treeLabel}>{st.label}</Text>
              <Text style={s.treeRange}>{st.range}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {item.kind === 'invite' ? (
        <View style={s.shareRow}>
          {[['📲', 'Invite'], ['🎯', 'Group'], ['💬', 'Share']].map(([e, l]) => (
            <View key={l} style={s.shareBox}>
              <Text style={{ fontSize: 22 }}>{e}</Text>
              <Text style={s.shareLabel}>{l}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {item.note ? (
        item.kind === 'welcome' || item.kind === 'tree'
          ? <View style={s.noteCard}><Text style={s.noteCardText}>{item.note}</Text></View>
          : <Text style={s.note}>{item.note}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  topBar:  { height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 20 },
  skip:    { color: C.sub, fontSize: 15, fontWeight: '700' },
  page:    { flex: 1, justifyContent: 'center' },
  body:    { paddingHorizontal: 28, alignItems: 'center' },
  logo:    { width: 112, height: 112, borderRadius: 22, marginBottom: 16 },
  title:   { color: C.text, fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 12, lineHeight: 32 },
  text:    { color: C.sub, fontSize: 16, textAlign: 'center', lineHeight: 23, marginBottom: 12 },
  textStrong: { color: C.text, fontSize: 15, textAlign: 'center', lineHeight: 22, marginTop: 4, marginBottom: 8, fontWeight: '600' },
  note:    { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 4 },
  noteCard: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 8, alignSelf: 'stretch' },
  noteCardText: { color: C.text, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  list:    { alignSelf: 'stretch', gap: 8, marginBottom: 14 },
  example: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 12 },
  radio:   { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.muted },
  radioOn: { backgroundColor: C.primary, borderColor: C.primary },
  exampleText: { color: C.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  sample:  { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card2, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 6 },
  sampleText: { flex: 1, color: C.text, fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  mic:     { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  micText: { fontSize: 18 },
  grid:    { flexDirection: 'row', flexWrap: 'wrap', width: 6 * 40 + 5 * 8, gap: 8, marginVertical: 8 },
  cell:    { width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  cellDone:   { backgroundColor: C.doneBg },
  cellToday:  { borderWidth: 2, borderColor: C.primary },
  cellFuture: { opacity: 0.55 },
  cellText:   { color: C.text, fontSize: 11, fontWeight: '700' },
  cellTextDone: { color: C.doneText, fontSize: 16, fontWeight: '900' },
  trees:   { flexDirection: 'row', alignItems: 'flex-end', alignSelf: 'stretch', marginVertical: 8 },
  treeCol: { flex: 1, alignItems: 'center' },
  treeImg: { width: 92, height: 92 },
  treeLabel: { color: C.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
  treeRange: { color: C.sub, fontSize: 11 },
  shareRow:  { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginVertical: 8 },
  shareBox:  { flex: 1, backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', gap: 4 },
  shareLabel: { color: C.text, fontSize: 12, fontWeight: '700' },
  footer:  { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, gap: 14 },
  dots:    { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  dotOn:   { width: 18, backgroundColor: C.primary },
  btn:     { backgroundColor: C.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnText: { color: C.onPrimary, fontWeight: '800', fontSize: 16 },
});
