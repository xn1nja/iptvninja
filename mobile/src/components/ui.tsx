import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { branding } from '../theme/branding';
import { Focusable } from './Focusable';

const { colors, radii, spacing, typography } = branding;

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Caption({ children }: { children: React.ReactNode }) {
  return <Text style={styles.caption}>{children}</Text>;
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={styles.centeredText}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.centeredText}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.emptyAction}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.centeredText}>{message}</Text>
      {onRetry ? (
        <View style={styles.emptyAction}>
          <Button label="Try again" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = Boolean(disabled || busy);
  return (
    <Focusable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy }}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.text} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant !== 'primary' && styles.buttonLabelOnDark,
          ]}
        >
          {label}
        </Text>
      )}
    </Focusable>
  );
}

export function Field({
  label,
  hint,
  ...inputProps
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        style={[styles.input, inputProps.multiline && styles.inputMultiline]}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.primary}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** Horizontal segmented control. Used for Live / Movies / Series. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Focusable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
              {option.label}
            </Text>
          </Focusable>
        );
      })}
    </View>
  );
}

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'positive' && { backgroundColor: colors.success },
        tone === 'warning' && { backgroundColor: colors.warning },
        tone === 'danger' && { backgroundColor: colors.danger },
      ]}
    >
      <Text style={[styles.badgeLabel, tone !== 'neutral' && { color: colors.onPrimary }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(3),
    gap: spacing(1),
  },
  centeredText: {
    color: colors.textMuted,
    fontSize: typography.body,
    textAlign: 'center',
    lineHeight: typography.body * 1.5,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  emptyAction: {
    marginTop: spacing(2),
  },
  errorTitle: {
    color: colors.danger,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: spacing(2),
    paddingTop: spacing(2),
    paddingBottom: spacing(1),
  },
  caption: {
    color: colors.textFaint,
    fontSize: typography.caption,
  },
  button: {
    minHeight: 46,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.5),
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceRaised,
  },
  buttonDanger: {
    backgroundColor: 'transparent',
    borderColor: colors.danger,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: colors.onPrimary,
    fontSize: typography.body,
    fontWeight: '700',
  },
  buttonLabelOnDark: {
    color: colors.text,
  },
  field: {
    marginBottom: spacing(2),
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: '600',
    marginBottom: spacing(0.75),
  },
  fieldHint: {
    color: colors.textFaint,
    fontSize: typography.caption,
    marginTop: spacing(0.5),
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.text,
    fontSize: typography.body,
    paddingHorizontal: spacing(1.5),
    paddingVertical: spacing(1.5),
    minHeight: 46,
  },
  inputMultiline: {
    minHeight: 130,
    textAlignVertical: 'top',
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing(1),
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
  },
  segment: {
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  segmentSelected: {
    backgroundColor: colors.primaryMuted,
  },
  segmentLabel: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: '600',
  },
  segmentLabelSelected: {
    color: colors.primary,
  },
  badge: {
    paddingHorizontal: spacing(1),
    paddingVertical: spacing(0.25),
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceRaised,
    alignSelf: 'flex-start',
  },
  badgeLabel: {
    color: colors.textMuted,
    fontSize: typography.caption,
    fontWeight: '700',
  },
});
