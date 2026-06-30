// Font-scaling-locked Text / TextInput.
// allowFontScaling defaults to false (placed BEFORE {...props}, so any
// element can still opt back in with allowFontScaling={true}).
import React from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';

export function Text(props) {
  return <RNText allowFontScaling={false} {...props} />;
}

export function TextInput(props) {
  return <RNTextInput allowFontScaling={false} {...props} />;
}