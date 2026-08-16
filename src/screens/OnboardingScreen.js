import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants';

export default function OnboardingScreen({ onDone }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        {/* Heart logo replaces the dove emoji at the top */}
        <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
        <Text style={s.title}>30 Acts of Kindness™</Text>
        <Text style={s.body}>
          We are building a movement to inspire a kinder world that
          creates positive change for all—through simple, everyday acts.
        </Text>

        <View style={s.divider} />

        <Text style={s.emoji}>💚</Text>
        <Text style={s.sectionTitle}>One Act at a Time</Text>
        <Text style={s.body}>
          A simple, daily practice that helps people build a real habit of kindness — one
          meaningful act at a time. Pick a good deed that fits your day, complete it, and log
          proof with a photo, video, or short description.
        </Text>

        <View style={s.divider} />

        <Text style={s.emoji}>🌍</Text>
        <Text style={s.sectionTitle}>Our Mission</Text>
        <Text style={s.body}>
          To spark a kinder world by making it easy for anyone to complete 30 meaningful acts
          of compassion — turning good intentions into consistent action and measurable impact.
        </Text>
      </ScrollView>

      {/* Pinned footer so "Get Started" is always visible without scrolling */}
      <View style={s.footer}>
        <TouchableOpacity onPress={onDone} style={s.btn}>
          <Text style={s.btnText}>Let's Get Started 🕊️</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 32,
    paddingBottom: 48,
  },
  logo: {
    width: 110,
    height: 110,
    borderRadius: 22,
    marginBottom: 16,
    marginTop: 8,
  },
  emoji: { fontSize: 64, marginBottom: 12, marginTop: 8 },
  title: {
    color: C.text, fontSize: 26, fontWeight: '900',
    textAlign: 'center', marginBottom: 16, letterSpacing: -0.5,
  },
  sectionTitle: {
    color: C.text, fontSize: 20, fontWeight: '800',
    textAlign: 'center', marginBottom: 12, letterSpacing: -0.3,
  },
  body: {
    color: C.sub, fontSize: 15, textAlign: 'center',
    lineHeight: 24, marginBottom: 8,
  },
  divider: {
    width: 40, height: 2, backgroundColor: C.primary + '40',
    borderRadius: 99, marginVertical: 24,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: C.primary + '20',
    backgroundColor: C.bg,
  },
  btn: {
    backgroundColor: C.primary, borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 40,
    width: '100%', alignItems: 'center',
  },
  btnText: { color: C.bg, fontWeight: '800', fontSize: 16 },
});