import React, { useState, useEffect } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Image, Modal,
  Platform, InputAccessoryView, Keyboard,
} from 'react-native';
import { Text, TextInput } from './scaledText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../constants';

// ── Button ─────────────────────────────────────────────────────────
export function Btn({ label, onPress, variant = 'primary', disabled, loading, style }) {
  const vs = {
    primary:   { bg: disabled ? C.surface : C.primary, color: C.bg, borderWidth: 0 },
    secondary: { bg: 'transparent', color: C.primary, borderWidth: 1.5, borderColor: C.primary },
    ghost:     { bg: 'transparent', color: C.sub, borderWidth: 0 },
    danger:    { bg: 'transparent', color: C.error, borderWidth: 1.5, borderColor: C.error },
  };
  const v = vs[variant];
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={disabled || loading ? undefined : onPress}
      style={[
        styles.btn,
        { backgroundColor: v.bg, borderWidth: v.borderWidth || 0, borderColor: v.borderColor },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={v.color} size="small" />
        : <Text style={[styles.btnText, { color: v.color }]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

// ── Text Input ─────────────────────────────────────────────────────
// On iOS every input gets a keyboard "Done" bar so the user can always
// dismiss the keyboard -- essential for multiline fields (which have no
// return-key submit) and numeric pads (which have no return key at all).
// A caller can still pass its own inputAccessoryViewID to opt out and
// manage the accessory itself.
let _appInputAccessoryCounter = 0;
export function AppInput({ label, value, onChangeText, placeholder, secureTextEntry, error, multiline, maxLength, editable = true, keyboardType, autoCapitalize, inputAccessoryViewID }) {
  const idRef = React.useRef(null);
  if (idRef.current === null) {
    idRef.current = inputAccessoryViewID || `appinput-done-${++_appInputAccessoryCounter}`;
  }
  const accessoryId  = idRef.current;
  const ownAccessory = Platform.OS === 'ios' && !inputAccessoryViewID;

  return (
    <View style={{ marginBottom: 16 }}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        maxLength={maxLength}
        editable={editable}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        inputAccessoryViewID={Platform.OS === 'ios' ? accessoryId : undefined}
        style={[
          styles.input,
          multiline && { height: 110, textAlignVertical: 'top', paddingTop: 12 },
          error && { borderColor: C.error },
          !editable && { opacity: 0.6 },
        ]}
      />
      {error ? <Text style={styles.errorText}>⚠ {error}</Text> : null}

      {ownAccessory && (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.kbAccessory}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
              <Text style={styles.kbAccessoryDone}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
}

// ── Password Input with show/hide ──────────────────────────────────
export function PasswordInput({ label, value, onChangeText, placeholder, error }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <View style={{ position: 'relative' }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          secureTextEntry={!show}
          style={[styles.input, { paddingRight: 48 }, error && { borderColor: C.error }]}
        />
        <TouchableOpacity
          onPress={() => setShow(s => !s)}
          style={styles.eyeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ fontSize: 18 }}>{show ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.errorText}>⚠ {error}</Text> : null}
    </View>
  );
}

// ── Card ───────────────────────────────────────────────────────────
export function Card({ children, style, onPress }) {
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[styles.card, style]}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

// ── Badge ──────────────────────────────────────────────────────────
export function Badge({ status }) {
  const map = {
    NOT_SET:   { bg: C.surface,       color: C.muted,   label: 'Not Set' },
    PENDING:   { bg: C.warning + '33', color: C.warning, label: 'In Progress' },
    COMPLETED: { bg: C.success + '33', color: C.success, label: 'Completed' },
    MISSED:    { bg: C.error   + '33', color: C.error,   label: 'Missed' },
  };
  const s = map[status] || map.NOT_SET;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

// ── Screen Header ──────────────────────────────────────────────────
// Layout: [back arrow OR logo]  [centered title]  [right slot]
// On screens without onBack the left slot shows the heart logo,
// keeping brand visible on top-level tabs without crowding screens
// that already have a back button (DailyAct, DayDetail, etc).
//
// Top padding is driven by the device safe-area inset (insets.top)
// rather than a fixed value, so the back arrow always clears the
// status bar / notch on every device — iPhone 6 (20pt), notched
// phones (44–59pt), and card-sheet presentations (~0).
export function ScreenHeader({ title, onBack, right }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerSide}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: C.primary, fontSize: 24 }}>←</Text>
          </TouchableOpacity>
        ) : (
          <Image
            source={require('../../assets/logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        )}
      </View>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={[styles.headerSide, { alignItems: 'flex-end', minWidth: 60 }]}>{right}</View>
    </View>
  );
}

// ── Section Label ──────────────────────────────────────────────────
export function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  btn: {
    width: '100%', paddingVertical: 15, paddingHorizontal: 20,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

  inputLabel: {
    color: C.sub, fontSize: 12, fontWeight: '700',
    marginBottom: 7, letterSpacing: 0.5, textTransform: 'uppercase',
  },
  input: {
    backgroundColor: C.card2, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 13, fontSize: 15, color: C.text,
    borderWidth: 1.5, borderColor: C.border,
  },
  errorText: { color: C.error, fontSize: 11, marginTop: 5 },

  kbAccessory: {
    backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border,
    paddingHorizontal: 16, paddingVertical: 8, alignItems: 'flex-end',
  },
  kbAccessoryDone: { color: C.primary, fontSize: 16, fontWeight: '800' },

  eyeBtn: {
    position: 'absolute', right: 12, top: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },

  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: C.border,
  },

badge: {
  paddingHorizontal: 14, paddingVertical: 6,
  borderRadius: 14,
  minWidth: 100,
  alignItems: 'center',
},
  badgeText: { fontSize: 11, fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerSide: {
    width: 40,
    justifyContent: 'center',
  },
  headerLogo: {
    width: 32,
    height: 32,
    borderRadius: 7,
  },
  headerTitle: {
    flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 17, color: C.text,
  },

  sectionLabel: {
    color: C.sub, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8,
  },
});

// ── TypedConfirmModal ─────────────────────────────────────────────────────
// Destructive-action confirmation that requires the user to type a specific
// word (default: "DELETE") before the confirm button activates.
export function TypedConfirmModal({
  visible,
  title,
  body,
  confirmWord = 'DELETE',
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  loading = false,
}) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (visible) setTyped('');
  }, [visible]);

  const matches = typed.trim().toUpperCase() === confirmWord.toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={tcStyles.bg}>
        <View style={tcStyles.card}>
          <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 10 }}>⚠️</Text>
          <Text style={tcStyles.title}>{title}</Text>
          <Text style={tcStyles.body}>{body}</Text>
          <Text style={tcStyles.prompt}>
            Type <Text style={tcStyles.word}>{confirmWord}</Text> to confirm:
          </Text>
<TextInput
  value={typed}
  onChangeText={setTyped}
  autoCapitalize="characters"
  autoCorrect={false}
  editable={!loading}
  style={tcStyles.input}
  placeholder={confirmWord}
  placeholderTextColor={C.muted}
  inputAccessoryViewID={Platform.OS === 'ios' ? 'tcKbDone' : undefined}
/>

{Platform.OS === 'ios' && (
  <InputAccessoryView nativeID="tcKbDone">
    <View style={tcStyles.kbBar}>
      <TouchableOpacity onPress={() => Keyboard.dismiss()}>
        <Text style={tcStyles.kbDone}>Done</Text>
      </TouchableOpacity>
    </View>
  </InputAccessoryView>
)}
          <Btn
            label={confirmLabel}
            onPress={onConfirm}
            disabled={!matches || loading}
            loading={loading}
            style={{ backgroundColor: C.error, borderWidth: 0, marginTop: 14, marginBottom: 10, opacity: matches ? 1 : 0.4 }}
          />
          <Btn
            label="Cancel"
            onPress={onCancel}
            variant="secondary"
            disabled={loading}
          />
        </View>
      </View>
    </Modal>
  );
}

const tcStyles = StyleSheet.create({
  bg:     { flex: 1, backgroundColor: '#000000BB', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:   { backgroundColor: C.card, borderRadius: 22, padding: 28, borderWidth: 1.5, borderColor: C.error + '88', width: '100%' },
  title:  { color: C.text, fontSize: 19, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  body:   { color: C.sub, fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  prompt: { color: C.sub, fontSize: 13, marginBottom: 6 },
  word:   { color: C.error, fontWeight: '900', letterSpacing: 1 },
  input:  {
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 10,
    padding: 12,
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  kbBar: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: '#444',
  },
  kbDone: { color: '#0a84ff', fontSize: 16, fontWeight: '700' },
});