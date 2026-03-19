import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Platform, Pressable, ActivityIndicator } from 'react-native';
import { Text, Switch, IconButton } from 'react-native-paper';
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
  loadNotificationActiveHours,
  saveNotificationActiveHours,
  loadActiveBundle,
  loadEnabledBundles,
  saveEnabledBundles,
} from '../src/services/storage';
import {
  setNotificationInterval,
  cancelAllNotifications,
} from '../src/services/notificationScheduler';
import { requestNotificationPermissions, setupNotifications } from '../src/services/notificationService';
import { getAvailableBundles, getBundle } from '../src/content/bundles';
import { useActiveBundle } from '../src/content/activeBundleProvider';
import { getCardsDueCount } from '../src/services/statsService';
import { useApkgImport } from '../src/hooks/useApkgImport';

const SPEED_OPTIONS: { label: string; value: number }[] = [
  { label: '0.75×', value: 0.75 },
  { label: '1×', value: 1.0 },
  { label: '1.25×', value: 1.25 },
];

/** Available hour options for active hours picker (5 AM to 11 PM) */
const HOUR_OPTIONS = Array.from({ length: 19 }, (_, i) => {
  const hour = i + 5; // 5..23
  const label = hour === 0 ? '12:00 AM'
    : hour < 12 ? `${hour}:00 AM`
    : hour === 12 ? '12:00 PM'
    : `${hour - 12}:00 PM`;
  return { hour, label };
});

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

  const [deckRefreshKey, setDeckRefreshKey] = useState(0);
  const { importing, importProgress, handleImport, confirmDeleteDeck } = useApkgImport();

  const setActive = (bundleId: string) => {
    switchBundle(bundleId);
    setActiveBundleId(bundleId);
  };

  const onDeleteDeck = (bundleId: string, displayLabel: string) => {
    confirmDeleteDeck(bundleId, displayLabel, {
      activeBundleId,
      onDeleted: (fallbackId) => {
        // Remove from enabled list
        const newEnabled = enabledBundles.filter(id => id !== bundleId);
        saveEnabledBundles(newEnabled);
        setEnabledBundles(newEnabled);

        if (fallbackId) {
          switchBundle(fallbackId);
          setActiveBundleId(fallbackId);
        }
        setDeckRefreshKey(k => k + 1);
      },
    });
  };

  const onImport = () => {
    handleImport((deckId) => {
      switchBundle(deckId);
      setActiveBundleId(deckId);
    });
  };

  const [isMuted, setIsMuted] = useState(() => loadAudioMuted());
  const [audioSpeed, setAudioSpeed] = useState(() => loadAudioSpeed());
  const [newWordsPerDay, setNewWordsPerDay] = useState(() => loadNewWordsPerDay());
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => loadNotificationsEnabled());
  const [notificationInterval, setNotificationIntervalState] = useState(() => loadNotificationInterval());
  const [activeHours, setActiveHours] = useState(() => loadNotificationActiveHours());

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
        // Register AppState listener + scheduler so notifications fire on background
        setupNotifications();
      } else {
        // Permissions not granted, keep disabled
        setNotificationsEnabled(false);
        saveNotificationsEnabled(false);
      }
    } else {
      // Disabling: cancel all and tear down listeners
      setNotificationsEnabled(false);
      saveNotificationsEnabled(false);
      await cancelAllNotifications();
      // Next setupNotifications() call will skip setup due to disabled flag
    }
  }

  async function handleIntervalChange(seconds: number) {
    setNotificationIntervalState(seconds);
    await setNotificationInterval(seconds); // saves to storage + reschedules batch
  }

  async function handleActiveHoursStartChange(hour: number) {
    // Enforce start < end
    if (hour >= activeHours.endHour) return;
    const updated = { startHour: hour, endHour: activeHours.endHour };
    setActiveHours(updated);
    saveNotificationActiveHours(updated.startHour, updated.endHour);
    await scheduleNotificationBatch();
  }

  async function handleActiveHoursEndChange(hour: number) {
    // Enforce start < end
    if (hour <= activeHours.startHour) return;
    const updated = { startHour: activeHours.startHour, endHour: hour };
    setActiveHours(updated);
    saveNotificationActiveHours(updated.startHour, updated.endHour);
    await scheduleNotificationBatch();
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
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
                        { seconds: 900, label: '15 minutes' },
                        { seconds: 1800, label: '30 minutes' },
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

                  {/* Separator */}
                  <View style={[styles.separator, { backgroundColor: theme.custom.glassBorder }]} />

                  {/* Active Hours */}
                  <View style={styles.settingColumn}>
                    <View style={styles.settingLabelGroup}>
                      <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
                        Active Hours
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
                      >
                        Notifications only fire within this time window
                      </Text>
                    </View>
                    <View style={styles.activeHoursRow}>
                      <View style={styles.activeHourPicker}>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                          From
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.hourScrollContent}
                        >
                          {HOUR_OPTIONS.filter(opt => opt.hour < activeHours.endHour).map((opt) => (
                            <Pressable
                              key={opt.hour}
                              style={[
                                styles.hourChip,
                                {
                                  backgroundColor:
                                    activeHours.startHour === opt.hour
                                      ? theme.custom.brandOrange
                                      : theme.custom.glassBackground,
                                  borderColor:
                                    activeHours.startHour === opt.hour
                                      ? theme.custom.brandOrange
                                      : theme.custom.glassBorder,
                                },
                              ]}
                              onPress={() => handleActiveHoursStartChange(opt.hour)}
                            >
                              <Text
                                variant="labelSmall"
                                style={{
                                  color:
                                    activeHours.startHour === opt.hour
                                      ? '#FFFFFF'
                                      : theme.colors.onSurface,
                                  fontWeight: activeHours.startHour === opt.hour ? '700' : '500',
                                }}
                              >
                                {opt.label}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                      <View style={styles.activeHourPicker}>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                          Until
                        </Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.hourScrollContent}
                        >
                          {HOUR_OPTIONS.filter(opt => opt.hour > activeHours.startHour).map((opt) => (
                            <Pressable
                              key={opt.hour}
                              style={[
                                styles.hourChip,
                                {
                                  backgroundColor:
                                    activeHours.endHour === opt.hour
                                      ? theme.custom.brandOrange
                                      : theme.custom.glassBackground,
                                  borderColor:
                                    activeHours.endHour === opt.hour
                                      ? theme.custom.brandOrange
                                      : theme.custom.glassBorder,
                                },
                              ]}
                              onPress={() => handleActiveHoursEndChange(opt.hour)}
                            >
                              <Text
                                variant="labelSmall"
                                style={{
                                  color:
                                    activeHours.endHour === opt.hour
                                      ? '#FFFFFF'
                                      : theme.colors.onSurface,
                                  fontWeight: activeHours.endHour === opt.hour ? '700' : '500',
                                }}
                              >
                                {opt.label}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
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
                  <View style={styles.deckActions}>
                    <Switch
                      value={isEnabled}
                      onValueChange={() => toggleEnabled(bundle.id)}
                      color={theme.custom.brandBlue}
                    />
                    <IconButton
                      icon="trash-can-outline"
                      size={18}
                      iconColor={isImported ? theme.colors.error : theme.colors.onSurfaceVariant}
                      onPress={isImported ? () => onDeleteDeck(bundle.id, bundle.displayLabel) : undefined}
                      disabled={!isImported}
                      accessibilityLabel={`Delete ${bundle.displayLabel}`}
                      style={[styles.deleteButton, !isImported && { opacity: 0.25 }]}
                    />
                  </View>
                </Pressable>
              </React.Fragment>
            );
          })}

          <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
          {importing ? (
            <View style={[styles.settingRow, { gap: 12 }]}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {importProgress || 'Importing...'}
              </Text>
            </View>
          ) : (
            <Pressable style={styles.settingRow} onPress={onImport}>
              <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: '500' }}>
                + Import your own deck
              </Text>
            </Pressable>
          )}

          <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
          <View style={[styles.settingRow, { opacity: 0.4 }]}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              + Download more (coming soon)
            </Text>
          </View>
        </View>
      </ScrollView>
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
  },
  contentInner: {
    paddingTop: 16,
    paddingBottom: 24,
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
  deckActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    margin: 0,
    marginLeft: -4,
  },
  activeHoursRow: {
    marginTop: 8,
    gap: 8,
  },
  activeHourPicker: {
    // Each picker takes full width with horizontal scroll
  },
  hourScrollContent: {
    gap: 6,
    paddingVertical: 2,
  },
  hourChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
});
