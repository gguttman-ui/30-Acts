import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { AppInput, Btn, Card, ScreenHeader } from '../components';
import { C } from '../constants';
import { supabase } from '../lib/supabase';

export default function FeedbackScreen({ navigation }) {
  const [msg,       setMsg]       = useState('');
  const [rating,    setRating]    = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    // Validated HERE rather than by greying out the button. A disabled button
    // gives no reason for itself: when it stuck, it was indistinguishable from
    // the app being broken, and there was no way to tell a too-short message
    // from a failed save. Now every tap either submits or says why not.
    if (msg.trim().length < 10) {
      setError('Please write at least 10 characters so we know what you mean.');
      return;
    }
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: insertError } = await supabase
        .from('feedback')
        .insert({
          message:      msg,
          rating:       rating > 0 ? rating : null,
          user_email:   user?.email || null,
          submitted_at: new Date().toISOString(),
        });
      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (e) {
      console.error('Feedback error:', e);
      // Include the Postgres code/details: if something server-side is capping
      // submissions, the code (23505 = unique violation, 42501 = RLS refusal)
      // names the cause instead of hiding behind "please try again".
      const parts = [e.message || 'Failed to submit. Please try again.'];
      if (e.code)    parts.push(`(${e.code})`);
      if (e.details) parts.push(e.details);
      setError(parts.join(' '));
    } finally {
      setLoading(false);
    }
  };

  // Send another without leaving the screen. The success screen used to bounce
  // back to Settings after 3 seconds, so sending a second thought meant
  // navigating in again -- enough friction that one submission felt like the
  // limit. Nothing here caps you to one a day.
  const startAnother = () => {
    setMsg('');
    setRating(0);
    setError('');
    setSubmitted(false);
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <View style={s.successWrap}>
        <Text style={{ fontSize: 72, marginBottom: 20 }}>💚</Text>
        <Text style={s.successTitle}>Thank You!</Text>
        <Text style={s.successMsg}>
          Thank you for your feedback and being part of the 30 Acts of Kindness™ Community.
        </Text>
        <TouchableOpacity onPress={startAnother} style={s.successBtn}>
          <Text style={s.successBtnText}>Send more feedback</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.successBtnAlt}>
          <Text style={s.successBtnAltText}>Back to Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Feedback" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        <View style={s.hero}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>💬</Text>
          <Text style={s.heroTitle}>Share Your Thoughts</Text>
          <Text style={s.heroSub}>We read every piece of feedback and use it to improve.</Text>
        </View>

        {error ? (
          <View style={s.errorBanner}>
            <Text style={{ color: C.error, fontWeight: '600', textAlign: 'center' }}>{error}</Text>
          </View>
        ) : null}

        <Card style={s.mb}>
          <Text style={s.ratingQ}>How are you finding the app?</Text>
          <View style={s.stars}>
            {[1, 2, 3, 4, 5].map(star => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[s.star, rating >= star && { color: C.primary }]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && (
            <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
              {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][rating]}
            </Text>
          )}
        </Card>

        <Card style={s.mb}>
          <Text style={s.msgLabel}>Your Message *</Text>
          <AppInput
            value={msg}
            onChangeText={setMsg}
            placeholder="What's working well? What could be better?"
            multiline
          />
          <Text style={{ color: C.muted, fontSize: 11, marginTop: 6, textAlign: 'right' }}>
            {msg.trim().length < 10
              ? `${10 - msg.trim().length} more characters`
              : '✓ Ready to submit'}
          </Text>
        </Card>

        <Btn
          label="Submit Feedback"
          onPress={handleSubmit}
          loading={loading}
        />

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll:    { padding: 16, paddingBottom: 40 },
  mb:        { marginBottom: 14 },
  hero:      { alignItems: 'center', marginBottom: 24 },
  heroTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  heroSub:   { color: C.sub, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 18 },
  errorBanner: {
    backgroundColor: C.error + '22', borderWidth: 1, borderColor: C.error + '44',
    borderRadius: 12, padding: 14, marginBottom: 16,
  },
  ratingQ:  { color: C.text, fontWeight: '600', fontSize: 15, textAlign: 'center', marginBottom: 14 },
  stars:    { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  star:     { fontSize: 36, color: C.border },
  msgLabel: { color: C.text, fontWeight: '700', marginBottom: 12 },

  // Success screen
  successWrap: {
    flex: 1, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  successTitle: {
    color: C.text, fontSize: 28, fontWeight: '900', marginBottom: 16,
  },
  successMsg: {
    color: C.sub, fontSize: 16, textAlign: 'center', lineHeight: 26, marginBottom: 32,
  },
  successBtn: {
    backgroundColor: C.primary, borderRadius: 14,
    paddingHorizontal: 28, paddingVertical: 14,
  },
  successBtnText: {
    color: C.bg, fontWeight: '700', fontSize: 15,
  },
  successBtnAlt: {
    marginTop: 14, paddingHorizontal: 20, paddingVertical: 10,
  },
  successBtnAltText: {
    color: C.sub, fontWeight: '700', fontSize: 14, textDecorationLine: 'underline',
  },
});