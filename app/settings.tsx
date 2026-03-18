import React, { useState } from 'react';
import { View, StyleSheet, Platform, Pressable, Switch as RNSwitch, Alert } from 'react-native';
import { Text, Switch, IconButton } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, getGlassStyle } from '../src/theme';
import {
  loadAudioMuted,
  saveAudioMuted,
  loadAudioSpeed,
  saveAudioSpeed,
  loadNewWordsPerDay,
  saveNewWordsPerDay,
  loadNotificationsEnabled,
  saveNotificationsEnabled,
  loadNotificationInterval,
  saveNotificationInterval,
  loadActiveBundle,
  loadEnabledBundles,
  saveEnabledBundles,
} from '../src/services/storage';
import {
  setNotificationInterval,
  pauseNotifications,
  resumeNotifications,
  cancelAllNotifications,
} from '../src/services/notificationScheduler';
import { requestNotificationPermissions } from '../src/services/notificationService';
import { getAvailableBundles, getBundle, registerImportedBundle } from '../src/content/bundles';
import { useActiveBundle } from '../src/content/activeBundleProvider';
import { getCardsDueCount } from '../src/services/statsService';
import { importApkg } from '../src/services/apkgImporter';
import { loadImportedDeckCards } from '../src/services/importedDeckStore';
import type { Bundle } from '../src/types/bundle';

const SPEED_OPTIONS: { label: string; value: number }[] = [
  { label: '0.75×', value: 0.75 },
  { label: '1×', value: 1.0 },
  { label: '1.25×', value: 1.25 },
];

export default function SettingsScreen() {
  const theme = useAppTheme();
  const { switchBundle } = useActiveBundle();

  const [activeBundleId, setActiveBundleId] = useState(() => loadActiveBundle());
  const [enabledBundles, setEnabledBundles] = useState(() => loadEnabledBundles());

  const toggleEnabled = (bundleId: string) => {
    const newEnabled = enabledBundles.includes(bundleId)
      ? enabledBundles.filter(id => id !== bundleId)
      : [...enabledBundles, bundleId];
    saveEnabledBundles(newEnabled);
    setEnabledBundles(newEnabled);
  };

  const setActive = (bundleId: string) => {
    switchBundle(bundleId);
    setActiveBundleId(bundleId);
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      if (!file.uri.toLowerCase().endsWith('.apkg')) {
        Alert.alert('Invalid file', 'Please select an .apkg file (Anki deck).');
        return;
      }
      const meta = await importApkg(file.uri);
      const cards = await loadImportedDeckCards(meta.id);
      const bundle: Bundle = {
        config: {
          id: meta.id, type: 'imported', nativeLanguage: '', targetLanguage: '',
          displayLabel: meta.name,
          greetings: { morning: '', afternoon: '', evening: '' },
          motivational: { perfect: '', great: '', good: '', encouragement: '' },
          spellCharacters: [], searchPlaceholder: '',
          cardCount: meta.cardCount, importedAt: meta.importedAt,
        },
        chapters: [], simpleCards: cards, cardImages: {}, cardAudios: {},
      };
      registerImportedBundle(meta.id, bundle);
      switchBundle(meta.id);
      setActiveBundleId(meta.id);
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'An unknown error occurred.');
    }
  };

  const [isMuted, setIsMuted] = useState(() => loadAudioMuted());
  const [audioSpeed, setAudioSpeed] = useState(() => loadAudioSpeed());
  const [newWordsPerDay, setNewWordsPerDay] = useState(() => loadNewWordsPerDay());
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => loadNotificationsEnabled());
  const [notificationInterval, setNotificationIntervalState] = useState(() => loadNotificationInterval());

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

  async function handleNotificationsToggle(value: boolean) {
    if (value) {
      // Enabling: request permissions
      const granted = await requestNotificationPermissions();
      if (granted) {
        setNotificationsEnabled(true);
        saveNotificationsEnabled(true);
        await resumeNotifications();
      } else {
        // Permissions not granted, keep disabled
        setNotificationsEnabled(false);
        saveNotificationsEnabled(false);
      }
    } else {
      // Disabling: pause and cancel all
      setNotificationsEnabled(false);
      saveNotificationsEnabled(false);
      await pauseNotifications();
      await cancelAllNotifications();
    }
  }

  async function handleIntervalChange(seconds: number) {
    setNotificationIntervalState(seconds);
    saveNotificationInterval(seconds);
    await setNotificationInterval(seconds);
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
            getGlassStyle(theme),
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
              color={theme.custom.brandBlue}
            />
          </View>

          {/* Separator */}
          <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />

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
                        backgroundColor: isActive ? theme.custom.brandBlue : 'transparent',
                        borderColor: isActive ? theme.custom.brandBlue : theme.colors.outline,
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
                        { color: isActive ? theme.colors.onPrimary : theme.colors.onSurfaceVariant },
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
          <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />

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
                  iconColor={theme.custom.brandBlue}
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
                  iconColor={theme.custom.brandBlue}
                  onPress={handleIncrement}
                  disabled={newWordsPerDay >= 50}
                  style={styles.stepperButton}
                />
              </View>
            </View>
          </View>

          {/* Notification Settings - Native Only */}
          {Platform.OS !== 'web' && (
            <>
              {/* Separator */}
              <View style={[styles.separator, { backgroundColor: theme.custom.glassBorder }]} />

              {/* Notifications Enable/Disable Toggle */}
              <View style={styles.settingColumn}>
                <View style={styles.settingRow}>
                  <View style={styles.settingLabelGroup}>
                    <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
                      Vocabulary Notifications
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
                    >
                      Receive reminders when screen is unlocked
                    </Text>
                  </View>
                  <Switch
                    value={notificationsEnabled}
                    onValueChange={handleNotificationsToggle}
                    color={theme.custom.brandOrange}
                  />
                </View>
              </View>

              {/* Notification Interval Selector - Only visible when enabled */}
              {notificationsEnabled && (
                <>
                  {/* Separator */}
                  <View style={[styles.separator, { backgroundColor: theme.custom.glassBorder }]} />

                  <View style={styles.settingColumn}>
                    <View style={styles.settingLabelGroup}>
                      <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
                        Notification Interval
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
                      >
                        How often to send vocabulary reminders
                      </Text>
                    </View>
                    <View style={styles.intervalSelector}>
                      {[
                        { seconds: 180, label: '3 min' },
                        { seconds: 300, label: '5 min' },
                        { seconds: 600, label: '10 min' },
                      ].map((option) => (
                        <Pressable
                          key={option.seconds}
                          style={[
                            styles.intervalButton,
                            {
                              backgroundColor:
                                notificationInterval === option.seconds
                                  ? theme.custom.brandOrange
                                  : theme.custom.glassBackground,
                              borderColor:
                                notificationInterval === option.seconds
                                  ? theme.custom.brandOrange
                                  : theme.custom.glassBorder,
                            },
                          ]}
                          onPress={() => handleIntervalChange(option.seconds)}
                        >
                          <Text
                            variant="bodyMedium"
                            style={[
                              styles.intervalButtonText,
                              {
                                color:
                                  notificationInterval === option.seconds
                                    ? '#FFFFFF'
                                    : theme.colors.onSurface,
                              },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </>
              )}
            </>
          )}
        </View>

        {/* Decks card group */}
        <View
          style={[
            styles.card,
            styles.languagePairsCard,
            getGlassStyle(theme),
          ]}
        >
          <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface, marginBottom: 8 }]}>
            Decks
          </Text>

          {getAvailableBundles().map((bundle) => {
            const isActive = bundle.id === activeBundleId;
            const isEnabled = enabledBundles.includes(bundle.id);
            const isImported = bundle.type === 'imported';
            let dueCount = 0;
            try {
              if (!isImported) {
                dueCount = getCardsDueCount(getBundle(bundle.id).chapters);
              }
            } catch {}
            return (
              <React.Fragment key={bundle.id}>
                <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
                <Pressable
                  onPress={() => setActive(bundle.id)}
                  style={[
                    styles.settingRow,
                    isActive && { backgroundColor: theme.colors.primaryContainer, borderRadius: 10, paddingHorizontal: 8 },
                  ]}
                >
                  <View style={styles.settingLabelGroup}>
                    <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
                      {bundle.displayLabel}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
                    >
                      {isActive ? 'Active' : isImported ? `${bundle.cardCount ?? 0} cards` : `${dueCount} cards due`}
                    </Text>
                  </View>
                  <RNSwitch
                    value={isEnabled}
                    onValueChange={() => toggleEnabled(bundle.id)}
                    trackColor={{ true: theme.custom.brandBlue }}
                  />
                </Pressable>
              </React.Fragment>
            );
          })}

          <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
          <Pressable style={styles.settingRow} onPress={handleImport}>
            <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: '500' }}>
              + Import your own deck
            </Text>
          </Pressable>

          <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
          <View style={[styles.settingRow, { opacity: 0.4 }]}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              + Download more (coming soon)
            </Text>
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
  languagePairsCard: {
    marginTop: 16,
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
  intervalSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  intervalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intervalButtonText: {
    fontWeight: '600',
  },
});
