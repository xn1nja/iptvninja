import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { branding } from '../theme/branding';

export interface FocusableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Style merged in while the element is focused or pressed. */
  activeStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Every interactive element in the app goes through this component.
 *
 * A TV/remote build is planned, so nothing may depend on a touch-only gesture:
 * this is a plain tap target that also tracks `onFocus`/`onBlur` and draws a
 * focus ring. Adding d-pad navigation later means teaching *this* component
 * about `hasTVPreferredFocus` and `nextFocus*` rather than rewriting screens.
 */
export function Focusable({ style, activeStyle, children, ...rest }: FocusableProps) {
  const [active, setActive] = useState(false);

  return (
    <Pressable
      {...rest}
      onFocus={(event) => {
        setActive(true);
        rest.onFocus?.(event);
      }}
      onBlur={(event) => {
        setActive(false);
        rest.onBlur?.(event);
      }}
      style={({ pressed }) => [
        style,
        (pressed || active) && styles.active,
        (pressed || active) && activeStyle,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  active: {
    borderColor: branding.colors.focusRing,
    opacity: 0.92,
  },
});
