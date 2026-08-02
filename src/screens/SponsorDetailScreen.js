import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Share, Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Btn, Card, ScreenHeader } from '../components';
import { C } from '../constants';
import { getChallengeDetail } from '../lib/streak';
import { fileReport, blockUser, getBlockedIds, REPORT_REASONS } from '../lib/safety';

// Formats an ISO timestamp as e.g. "May 12" or "May 12, 2025" if not current year.
function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

// Days between two ISO timestamps (or today if `to` omitted), floor to whole days.
function daysBetween(fromIso, toIso) {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  const to = toIso ? new Date(toIso) : new Date();
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
  return Math.max(0, Math.floor((to - from) / (1000 * 60 * 60 * 24)));
}

// Escapes a single CSV cell value.
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function SponsorDetailScreen({ route, navigation }) {
  const challengeId = route?.params?.challengeId;

  const [authUserId, setAuthUserId] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(null);
  const [detail,     setDetail]     = useState(null);
  const [blockedIds, setBlockedIds] = useState(new Set());

  const load = useCallback(async () => {
    try {
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not signed in.');
        setLoading(false);
        return;
      }
      setAuthUserId(user.id);

      if (!challengeId) {
        setError('Missing group ID.');
        setLoading(false);
        return;
      }

      const result = await getChallengeDetail(challengeId, user.id);
      setDetail(result);

      // Hide anyone this user has blocked (Apple Guideline 1.2).
      setBlockedIds(await getBlockedIds());
    } catch (e) {
      console.warn('SponsorDetailScreen load failed:', e.message);
      setError(e.message || 'Could not load group.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [challengeId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleShareInvite = async () => {
    if (!detail?.challenge?.join_code) return;
    const code = detail.challenge.join_code;
    const name = detail.challenge.name;
    try {
      await Share.share({
        message:
          `Join me in the "${name}" kindness group on 30 Acts of Kindness™!\n\n` +
          `Use invite code: ${code}\n\n` +
          `https://apps.apple.com/app/id6762151038`,
      });
    } catch (e) {
      console.warn('Share invite failed:', e.message);
    }
  };

  const handleExportCsv = async () => {
    if (!detail) return;
    const { challenge, leaderboard } = detail;
    const header = ['Name','Acts','First Act','Last Act','Joined','Days Since Joined'];
    const rows = leaderboard.map(p => [
      p.displayName,
      p.count,
      formatShortDate(p.firstActAt),
      formatShortDate(p.lastActAt),
      formatShortDate(p.joinedAt),
      daysBetween(p.joinedAt) ?? '',
    ]);
    const csv = [header, ...rows]
      .map(r => r.map(csvCell).join(','))
      .join('\n');

    const fileLabel = `${challenge.name.replace(/[^\w-]/g, '_')}_participants.csv`;
    try {
      await Share.share({
        message: csv,
        title: fileLabel,
      });
    } catch (e) {
      Alert.alert('Export failed', e.message);
    }
  };

  // -- Report / Block (Apple Guideline 1.2) --------------------------------
  const askReason = (label, onPick) => {
    Alert.alert(label, 'Why are you reporting this?', [
      ...REPORT_REASONS.map(r => ({ text: r, onPress: () => onPick(r) })),
      { text: 'Cancel', style: 'cancel' },
    ], { cancelable: true });
  };

  const submitReport = async (payload, reason) => {
    const res = await fileReport({ ...payload, reason });
    if (res.ok) {
      Alert.alert('Report received', 'Thank you. Our team will review this within 24 hours.');
    } else {
      Alert.alert('Could not send report', res.error || 'Please try again.');
    }
  };

  const handleReportChallenge = () => {
    askReason('Report this group',
      (reason) => submitReport({ challengeId: detail.challenge.id }, reason));
  };

  const doBlock = (p) => {
    Alert.alert(
      'Block ' + p.displayName + '?',
      'They will be hidden from your leaderboards.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: async () => {
            const res = await blockUser(p.userId);
            if (res.ok) setBlockedIds(prev => new Set([...prev, p.userId]));
            else Alert.alert('Could not block', res.error || 'Please try again.');
          } },
      ]
    );
  };

  const handleReportUser = (p) => {
    Alert.alert(p.displayName, 'Report or block this participant?', [
      { text: 'Report', onPress: () => askReason('Report participant',
          (reason) => submitReport({ challengeId: detail.challenge.id, reportedUserId: p.userId }, reason)) },
      { text: 'Block', style: 'destructive', onPress: () => doBlock(p) },
      { text: 'Cancel', style: 'cancel' },
    ], { cancelable: true });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader title="Group"  />
        <View style={s.centerWrap}>
          <ActivityIndicator color={C.primary} />
          <Text style={s.loadingText}>Loading group…</Text>
        </View>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader title="Group" onBack={() => navigation.goBack()} />
        <View style={s.centerWrap}>
          <Text style={s.errorText}>{error || 'Group unavailable.'}</Text>
          <Btn label="Try again" onPress={load} style={{ marginTop: 14 }} />
        </View>
      </View>
    );
  }

  const { challenge, sponsor, isSponsor, isParticipant, me, leaderboard, totalActs } = detail;
  const visibleLeaderboard = leaderboard.filter(p => !blockedIds.has(p.userId));
  const daysSinceStart = daysBetween(challenge.start_date);
  const daysRemaining =
    typeof daysSinceStart === 'number'
      ? Math.max(0, (challenge.length_days || 0) - daysSinceStart)
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={challenge.name} />
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >

        {/* HEADER CARD */}
        <Card style={s.mb}>
          <View style={s.headerRow}>
            <Text style={s.typePill}>{challenge.type}</Text>
            <Text style={s.lengthPill}>{challenge.length_days} days</Text>
          </View>
          <Text style={s.challengeName}>{challenge.name}</Text>
          {sponsor && (
            <Text style={s.sponsorLine}>Sponsored by {sponsor.displayName}</Text>
          )}
{/* Two big totals: Your contribution + Group total */}
<View style={s.totalsRow}>
  <View style={[s.totalCard, isParticipant && s.totalCardMine]}>
    <Text style={s.totalLabel}>Your contribution</Text>
    <Text style={s.totalNum}>{me?.count ?? 0}</Text>
    <Text style={s.totalSub}>acts of kindness</Text>
  </View>
  <View style={s.totalCard}>
    <Text style={s.totalLabel}>Group total</Text>
    <Text style={s.totalNum}>{totalActs}</Text>
    <Text style={s.totalSub}>acts of kindness</Text>
  </View>
</View>

{/* Secondary stats */}
{/* Two big totals: Your contribution + Group total */}
<View style={s.totalsRow}>
  <View style={[s.totalCard, isParticipant && s.totalCardMine]}>
    <Text style={s.totalLabel}>Your contribution</Text>
    <Text style={s.totalNum}>{me?.count ?? 0}</Text>
    <Text style={s.totalSub}>acts of kindness</Text>
  </View>
  <View style={s.totalCard}>
    <Text style={s.totalLabel}>Group total</Text>
    <Text style={s.totalNum}>{totalActs}</Text>
    <Text style={s.totalSub}>acts of kindness</Text>
  </View>
</View>

{/* Secondary stats */}
<View style={s.statsRow}>
  <View style={s.statBlock}>
    <Text style={s.statValue}>{leaderboard.length}</Text>
    <Text style={s.statLabel}>Participants</Text>
  </View>
  {daysRemaining !== null && (
    <View style={s.statBlock}>
      <Text style={s.statValue}>{daysRemaining}</Text>
      <Text style={s.statLabel}>Days left</Text>
    </View>
  )}
</View>
          <TouchableOpacity onPress={handleShareInvite} style={s.inviteRow}>
            <Text style={s.inviteLabel}>INVITE CODE</Text>
            <Text style={s.inviteCode}>{challenge.join_code}</Text>
            <Text style={s.inviteShare}>Share →</Text>
          </TouchableOpacity>
        </Card>

        {/* YOUR PROGRESS (only if participant) */}
        {isParticipant && me && (
          <Card style={s.mb}>
            <Text style={s.cardTitle}>Your progress</Text>
            <View style={s.statsRow}>
              <View style={s.statBlock}>
                <Text style={s.statValue}>{me.count}</Text>
                <Text style={s.statLabel}>Your acts</Text>
              </View>
              <View style={s.statBlock}>
                <Text style={s.statValueSm}>{formatShortDate(me.firstActAt) || '—'}</Text>
                <Text style={s.statLabel}>First act</Text>
              </View>
              <View style={s.statBlock}>
                <Text style={s.statValueSm}>{formatShortDate(me.lastActAt) || '—'}</Text>
                <Text style={s.statLabel}>Last act</Text>
              </View>
            </View>
            {me.count === 0 && (
              <Text style={s.cheerText}>
                You're in! Tap below to log your first act and get on the board.
              </Text>
            )}
            <Btn
              label={me.count === 0 ? "Log Today's Act →" : "Log Another Act →"}
              onPress={() => navigation.navigate('Main', { screen: 'Home' })}
              style={{ marginTop: 14 }}
            />
          </Card>
        )}

        {/* LEADERBOARD */}
        <Card style={s.mb}>
          <View style={s.leaderHeader}>
            <Text style={s.cardTitle}>Leaderboard</Text>
            {isSponsor && (
              <TouchableOpacity onPress={handleExportCsv}>
                <Text style={s.exportLink}>Export CSV</Text>
              </TouchableOpacity>
            )}
          </View>
          {visibleLeaderboard.length === 0 ? (
            <Text style={s.emptyText}>No participants yet.</Text>
          ) : (
            visibleLeaderboard.map((p, idx) => {
              const isMe = p.userId === authUserId;
              const noActs = p.count === 0;
              return (
                <TouchableOpacity
                  key={p.userId}
                  activeOpacity={isMe ? 1 : 0.6}
                  onLongPress={isMe ? undefined : () => handleReportUser(p)}
                  delayLongPress={400}
                  style={[
                    s.leaderRow,
                    isMe && s.leaderRowMe,
                    idx === visibleLeaderboard.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <Text style={s.leaderRank}>{idx + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.leaderName, isMe && { color: C.primary, fontWeight: '800' }]}>
                      {p.displayName}{isMe ? ' (you)' : ''}
                    </Text>
                    {noActs ? (
                      <Text style={s.leaderSubMuted}>
                        Hasn't logged their first act yet — cheer them on!
                      </Text>
                    ) : (
                      <Text style={s.leaderSub}>
                        First: {formatShortDate(p.firstActAt)}
                        {isSponsor && p.lastActAt
                          ? `  •  Last: ${formatShortDate(p.lastActAt)}`
                          : ''}
                        {isSponsor && p.joinedAt
                          ? `  •  ${daysBetween(p.joinedAt)}d since joining`
                          : ''}
                      </Text>
                    )}
                  </View>
                  <Text style={s.leaderCount}>{p.count}</Text>
                </TouchableOpacity>
              );
            })
          )}

          {visibleLeaderboard.length > 1 && (
            <Text style={s.safetyHint}>
              Press and hold a participant to report or block them.
            </Text>
          )}
        </Card>

        {/* SAFETY - required by Apple Guideline 1.2 */}
        <TouchableOpacity onPress={handleReportChallenge} style={s.reportWrap}>
          <Text style={s.reportLink}>Report this group</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },

  safetyHint: {
    color: C.muted, fontSize: 11, textAlign: 'center',
    marginTop: 12, fontStyle: 'italic',
  },
  reportWrap: { alignItems: 'center', paddingVertical: 10 },
  reportLink: {
    color: C.muted, fontSize: 12, fontWeight: '700',
    textDecorationLine: 'underline',
  },
  mb: { marginBottom: 14 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: C.muted, marginTop: 12, fontSize: 13 },
  errorText:   { color: C.error, textAlign: 'center', fontSize: 14 },

  cardTitle: { color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  headerRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typePill: {
    color: C.primary, backgroundColor: C.primary + '22',
    fontSize: 11, fontWeight: '800', letterSpacing: 0.5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    textTransform: 'uppercase',
  },
  lengthPill: {
    color: C.sub, backgroundColor: C.card2,
    fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  challengeName: { color: C.text, fontSize: 22, fontWeight: '900', marginBottom: 14 },
  sponsorLine: { color: C.sub, fontSize: 12, fontWeight: '600', marginTop: -10, marginBottom: 14, fontStyle: 'italic' },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  statBlock: {
    flex: 1, backgroundColor: C.card2, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center',
  },
  statValue:   { color: C.primary, fontSize: 22, fontWeight: '900' },
  statValueSm: { color: C.primary, fontSize: 13, fontWeight: '800', marginBottom: 2 },
  statLabel:   { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2 },
  totalsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  totalCard: {
    flex: 1, backgroundColor: C.card2, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center',
    borderWidth: 1, borderColor: C.primary + '44',
  },
  totalCardMine: {
    borderColor: C.primary,
    backgroundColor: C.primary + '15',
  },
  totalLabel: {
    color: C.muted, fontSize: 10, fontWeight: '800',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6,
  },
  totalNum: { color: C.primary, fontSize: 32, fontWeight: '900', lineHeight: 34, marginBottom: 4 },
  totalSub: { color: C.muted, fontSize: 11 },
  inviteRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 1, borderColor: C.primary + '44',
    padding: 12, gap: 10,
  },
  inviteLabel: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  inviteCode:  { color: C.primary, fontSize: 16, fontWeight: '900', flex: 1, letterSpacing: 1 },
  inviteShare: { color: C.primary, fontSize: 13, fontWeight: '700' },

  cheerText: { color: C.sub, fontSize: 13, lineHeight: 18, fontStyle: 'italic' },

  leaderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  exportLink: { color: C.primary, fontSize: 13, fontWeight: '700' },

  leaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border + '55',
  },
  leaderRowMe: { backgroundColor: C.primary + '11', borderRadius: 8, paddingHorizontal: 8 },
  leaderRank:  { color: C.muted, fontSize: 13, fontWeight: '800', width: 22 },
  leaderName:  { color: C.text,  fontSize: 14, fontWeight: '700' },
  leaderSub:   { color: C.sub,   fontSize: 11, marginTop: 2 },
  leaderSubMuted: { color: C.muted, fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  leaderCount: { color: C.primary, fontSize: 18, fontWeight: '900', minWidth: 32, textAlign: 'right' },

  emptyText: { color: C.muted, fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 },
});