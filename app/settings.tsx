import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text, Switch, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import {
  loadAudioMuted,
  saveAudioMuted,
  loadAudioSpeed,
  saveAudioSpeed,
  loadNewWordsPerDay,
  saveNewWordsPerDay,
} from '../src/services/storage';

const SPEED_OPTIONS: { label: string; value: number }[] = [
  { label: '0.75×', value: 0.75 },
  { label: '1×', value: 1.0 },
  { label: '1.25×', value: 1.25 },
];

export default function SettingsScreen() {
  const theme = useAppTheme();

  const [isMuted, setIsMuted] = useState(() => loadAudioMuted());
  const [audioSpeed, setAudioSpeed] = useState(() => loadAudioSpeed());
  const [newWordsPerDay, setNewWordsPerDay] = useState(() => loadNewWordsPerDay());

  function handleMuteToggle(value: boolean) {
    setIsMuted(value);
    saveAudioMuted(value);
  }

  function handleSpeedSelect(speed: number) {
    setAudioSpeed(speed);
    saveAudioSpeed(speed);
  }

  function handleDecrement() {
    const next = Math.max(1, newWordsPerDay - 1);
    setNewWordsPerDay(next);
    saveNewWordsPerDay(next);
  }

  function handleIncrement() {
    const next = Math.min(50, newWordsPerDay + 1);
    setNewWordsPerDay(next);
    saveNewWordsPerDay(next);
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <View style={styles.content}>
        {/* Settings card group */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.custom.glassBackground,
              borderColor: theme.custom.glassBorder,
            },
          ]}
        >
          {/* Audio Mute Toggle */}
          <View style={styles.settingRow}>
            <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
              Mute Audio
            </Text>
            <Switch
              value={isMuted}
              onValueChange={handleMuteToggle}
              color={theme.custom.brandOrange}
            />
          </View>

          {/* Separator */}
          <View style={[styles.separator, { backgroundColor: theme.custom.glassBorder }]} />

          {/* Audio Playback Speed */}
          <View style={styles.settingColumn}>
            <View style={[styles.settingRow, { marginBottom: 8 }]}>
              <View style={styles.settingLabelGroup}>
                <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
                  Playback Speed
                </Text>
                <Text
                  variant="bodySmall"
                  style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
                >
                  Speed of sentence audio during review
                </Text>
              </View>
            </View>
            <View style={styles.speedRow}>
              {SPEED_OPTIONS.map((opt) => {
                const isActive = audioSpeed === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => handleSpeedSelect(opt.value)}
                    style={[
                      styles.speedButton,
                      {
                        backgroundColor: isActive ? theme.custom.brandOrange : 'transparent',
                        borderColor: isActive ? theme.custom.brandOrange : theme.custom.glassBorder,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${opt.label} playback speed`}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text
                      variant="labelMedium"
                      style={[
                        styles.speedButtonText,
                        { color: isActive ? '#FFFFFF' : theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Separator */}
          <View style={[styles.separator, { backgroundColor: theme.custom.glassBorder }]} />

          {/* New Words Per Day Stepper */}
          <View style={styles.settingColumn}>
            <View style={styles.settingRow}>
              <View style={styles.settingLabelGroup}>
                <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
                  New Words Per Day
                </Text>
                <Text
                  variant="bodySmall"
                  style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
                >
                  Maximum new vocabulary introduced each day
                </Text>
              </View>
              <View style={styles.stepper}>
                <IconButton
                  icon="minus"
                  size={20}
                  iconColor={theme.custom.brandOrange}
                  onPress={handleDecrement}
                  disabled={newWordsPerDay <= 1}
                  style={styles.stepperButton}
                />
                <Text
                  variant="titleMedium"
                  style={[styles.stepperValue, { color: theme.colors.onSurface }]}
                >
                  {newWordsPerDay}
                </Text>
                <IconButton
                  icon="plus"
                  size={20}
                  iconColor={theme.custom.brandOrange}
                  onPress={handleIncrement}
                  disabled={newWordsPerDay >= 50}
                  style={styles.stepperButton}
                />
              </View>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingColumn: {
    paddingVertical: 4,
  },
  settingLabelGroup: {
    flex: 1,
    paddingRight: 8,
  },
  settingLabel: {
    fontWeight: '600',
  },
  settingSubtitle: {
    marginTop: 2,
  },
  separator: {
    height: 1,
    marginVertical: 4,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    margin: 0,
  },
  stepperValue: {
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'center',
  },
  speedRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  speedButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  speedButtonText: {
    fontWeight: '600',
  },
});
