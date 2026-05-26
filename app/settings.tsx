import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Platform, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { Text, Switch, IconButton } from 'react-native-paper';
import { Picker } from '@react-native-picker/picker';
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
  loadScreenTimeEnabled,
  saveScreenTimeEnabled,
  loadUnlockCount,
  loadBlocklistJson,
  saveBlocklistJson,
  resetUnlockState,
  loadKeepBlockingAfterDueCleared,
  saveKeepBlockingAfterDueCleared,
} from '../src/services/storage';
import {
  isScreenTimeAvailable,
  getScreenTimeAuthStatus,
  requestScreenTimeAuth,
  configureShield,
  applyBlocklist,
  disableBlocking,
} from '../src/services/screenTimeService';
import {
  setNotificationInterval,
  scheduleNotificationBatch,
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

const INTERVAL_OPTIONS = [
  { seconds: 60, label: '1 minute' },
  { seconds: 300, label: '5 minutes' },
  { seconds: 600, label: '10 minutes' },
  { seconds: 900, label: '15 minutes' },
  { seconds: 1800, label: '30 minutes' },
  { seconds: 3600, label: '1 hour' },
  { seconds: 7200, label: '2 hours' },
  { seconds: 14400, label: '4 hours' },
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

  // Screen Time state
  const screenTimeAvailable = isScreenTimeAvailable();
  const [screenTimeEnabled, setScreenTimeEnabled] = useState(() => loadScreenTimeEnabled());
  const [screenTimeAuthorized, setScreenTimeAuthorized] = useState(
    () => screenTimeAvailable && getScreenTimeAuthStatus() === 2,
  );
  const [showAppPicker, setShowAppPicker] = useState(false);
  // Blocklist — explicit FamilyActivitySelection of apps the user picked to
  // block. Inverted from the build #4 whitelist model. Empty/null = nothing
  // shielded even when the master toggle is on.
  const [blocklistJson, setBlocklistJsonState] = useState<string | null>(() => loadBlocklistJson());
  // True when the user flipped the toggle ON with an empty blocklist — we
  // auto-open the picker so they can choose apps to block. Block engages
  // when the picker is dismissed with a non-empty selection.
  const [pendingEnable, setPendingEnable] = useState(false);
  // Bump to force re-evaluation of loadUnlockCount() display after Reset
  const [, setUnlockResetTick] = useState(0);
  const [keepBlocking, setKeepBlocking] = useState(() => loadKeepBlockingAfterDueCleared());

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
      const granted = await requestNotificationPermissions();
      if (granted) {
        setNotificationsEnabled(true);
        saveNotificationsEnabled(true);
        setupNotifications();
      } else {
        setNotificationsEnabled(false);
        saveNotificationsEnabled(false);
      }
    } else {
      setNotificationsEnabled(false);
      saveNotificationsEnabled(false);
      await cancelAllNotifications();
    }
  }

  async function handleIntervalChange(seconds: number) {
    setNotificationIntervalState(seconds);
    await setNotificationInterval(seconds);
  }

  async function handleActiveHoursStartChange(hour: number) {
    if (hour >= activeHours.endHour) return;
    const updated = { startHour: hour, endHour: activeHours.endHour };
    setActiveHours(updated);
    saveNotificationActiveHours(updated.startHour, updated.endHour);
    await scheduleNotificationBatch();
  }

  async function handleActiveHoursEndChange(hour: number) {
    if (hour <= activeHours.startHour) return;
    const updated = { startHour: activeHours.startHour, endHour: hour };
    setActiveHours(updated);
    saveNotificationActiveHours(updated.startHour, updated.endHour);
    await scheduleNotificationBatch();
  }

  async function handleScreenTimeToggle(value: boolean) {
    if (value) {
      if (!screenTimeAuthorized) {
        try {
          await requestScreenTimeAuth();
          setScreenTimeAuthorized(true);
        } catch (error) {
          console.warn('[Settings] Screen Time authorization denied or failed:', error);
          Alert.alert(
            'Screen Time permission required',
            'LingoLock needs Screen Time access to block apps. Enable it in Settings → Screen Time → Lock Apps & Website Activity, then try again.',
            [
              { text: 'OK', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openURL('app-settings:') },
            ],
          );
          return;
        }
      }
      configureShield();
      // First-enable: if no apps are blocked yet, auto-open the picker so the
      // user can choose. Block engages when picker dismisses with non-empty
      // selection. This is *less* misleading than the build-#4 behavior —
      // there, the picker said "Allowed Apps" but we needed it to actually
      // populate a whitelist exception. Here, "Blocked Apps" matches intent.
      if (!blocklistJson) {
        setPendingEnable(true);
        setShowAppPicker(true);
        return;
      }
      applyBlocklist(blocklistJson);
      setScreenTimeEnabled(true);
      saveScreenTimeEnabled(true);
    } else {
      disableBlocking();
      setScreenTimeEnabled(false);
      saveScreenTimeEnabled(false);
    }
  }

  function handleBlocklistChange(newJson: string | null) {
    setBlocklistJsonState(newJson);
    saveBlocklistJson(newJson);
    if (screenTimeEnabled) {
      applyBlocklist(newJson);
    }
  }

  function handlePickerDismiss() {
    setShowAppPicker(false);
    if (!pendingEnable) return;
    // The native side debounces selection-change events 100ms, so a tap on
    // Done can fire onDismissRequest BEFORE onSelectionChange flushes. Wait
    // 300ms (3× the debounce + bridge headroom) then read the freshest
    // value from MMKV — synchronous, doesn't lag React state.
    setTimeout(() => {
      const latest = loadBlocklistJson();
      setPendingEnable(false);
      if (!latest) {
        Alert.alert(
          'No apps selected',
          'Pick at least one app to block. Blocking was not enabled.',
        );
        return;
      }
      applyBlocklist(latest);
      setScreenTimeEnabled(true);
      saveScreenTimeEnabled(true);
    }, 300);
  }

  const glassStyle = getGlassStyle(theme);
  const pickerColor = theme.colors.onSurface;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['bottom']}
    >
      {/* Blocked Apps picker — mounted at the root (outside ScrollView) so the
          native sheet anchor is stable. The Swift Prop expects a non-optional
          String, so we pass "" when the blocklist is empty. The 1×1 absolute
          style follows the library README's example for the sheet variant. */}
      {showAppPicker && (() => {
        const { DeviceActivitySelectionSheetView } = require('react-native-device-activity');
        return (
          <DeviceActivitySelectionSheetView
            style={{ width: 1, height: 1, position: 'absolute' }}
            familyActivitySelection={blocklistJson ?? ''}
            includeEntireCategory={true}
            headerText="Blocked apps"
            footerText="Pick the apps to block. Selecting a whole category blocks every app in it."
            onSelectionChange={(event: { nativeEvent: { familyActivitySelection: string | null } }) => {
              handleBlocklistChange(event.nativeEvent.familyActivitySelection ?? null);
            }}
            onDismissRequest={handlePickerDismiss}
          />
        );
      })()}

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>

        {/* ── Audio Settings ── */}
        <View style={[styles.card, glassStyle]}>
          <Text
            variant="titleSmall"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            Audio
          </Text>

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

          <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />

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
        </View>

        {/* ── Learning Settings ── */}
        <View style={[styles.card, glassStyle]}>
          <Text
            variant="titleSmall"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            Learning
          </Text>

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

        {/* ── App Blocking (iOS with Screen Time) ── */}
        {screenTimeAvailable && (
          <View style={[styles.card, glassStyle]}>
            <Text
              variant="titleSmall"
              style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
            >
              App Blocking
            </Text>

            <View style={styles.settingRow}>
              <View style={styles.settingLabelGroup}>
                <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
                  Block Distracting Apps
                </Text>
                <Text
                  variant="bodySmall"
                  style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
                >
                  Complete vocabulary cards to unlock blocked apps
                </Text>
              </View>
              <Switch
                value={screenTimeEnabled}
                onValueChange={handleScreenTimeToggle}
                color={theme.custom.brandBlue}
              />
            </View>

            {screenTimeEnabled && (
              <>
                <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
                <Pressable
                  onPress={() => setShowAppPicker(true)}
                  style={styles.settingRow}
                >
                  <View style={styles.settingLabelGroup}>
                    <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
                      Blocked Apps
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
                    >
                      Apps that require vocabulary practice to unlock
                    </Text>
                  </View>
                  <IconButton
                    icon="chevron-right"
                    size={20}
                    iconColor={theme.colors.onSurfaceVariant}
                  />
                </Pressable>

                <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
                <View style={styles.settingRow}>
                  <View style={styles.settingLabelGroup}>
                    <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>Prompt after reviews cleared</Text>
                    <Text
                      variant="bodySmall"
                      style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
                    >
                      Off: apps stay unblocked after today’s reviews are done. On: still ask for 3 new-word cards.
                    </Text>
                  </View>
                  <Switch
                    value={keepBlocking}
                    onValueChange={(value) => {
                      setKeepBlocking(value);
                      saveKeepBlockingAfterDueCleared(value);
                      if (screenTimeEnabled && blocklistJson) applyBlocklist(blocklistJson);
                    }}
                    color={theme.custom.brandBlue}
                  />
                </View>

                <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />
                <View style={styles.settingRow}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Today: {loadUnlockCount()} unlocks
                  </Text>
                  <Pressable
                    onPress={() => {
                      Alert.alert(
                        'Reset today’s unlocks?',
                        'Resets the unlock counter so the next practice gate uses the starting card count again. Useful for testing.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Reset',
                            style: 'destructive',
                            onPress: () => {
                              resetUnlockState();
                              // Force re-render so the "Today: N unlocks" label updates
                              setUnlockResetTick(t => t + 1);
                            },
                          },
                        ],
                      );
                    }}
                    accessibilityLabel="Reset today's unlocks"
                    accessibilityRole="button"
                  >
                    <Text variant="bodySmall" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                      Reset
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Notification Settings (native only) ── */}
        {Platform.OS !== 'web' && (
          <View style={[styles.card, glassStyle]}>
            <Text
              variant="titleSmall"
              style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
            >
              Notifications
            </Text>

            <View style={styles.settingRow}>
              <View style={styles.settingLabelGroup}>
                <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
                  Vocabulary Card Notifications
                </Text>
                <Text
                  variant="bodySmall"
                  style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
                >
                  Periodic vocabulary cards delivered as notifications
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                color={theme.custom.brandBlue}
              />
            </View>

            {notificationsEnabled && (
              <>
                <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />

                <View style={styles.settingColumn}>
                  <View style={styles.settingLabelGroup}>
                    <Text variant="bodyLarge" style={[styles.settingLabel, { color: theme.colors.onSurface }]}>
                      Interval
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={[styles.settingSubtitle, { color: theme.colors.onSurfaceVariant }]}
                    >
                      How often to send vocabulary cards
                    </Text>
                  </View>
                  <View style={[styles.pickerContainer, { borderColor: theme.custom.separator }]}>
                    <Picker
                      selectedValue={notificationInterval}
                      onValueChange={(value) => handleIntervalChange(value as number)}
                      style={{ color: pickerColor }}
                      itemStyle={{ color: pickerColor, fontSize: 16, height: 120 }}
                    >
                      {INTERVAL_OPTIONS.map((opt) => (
                        <Picker.Item key={opt.seconds} label={opt.label} value={opt.seconds} />
                      ))}
                    </Picker>
                  </View>
                </View>

                <View style={[styles.separator, { backgroundColor: theme.custom.separator }]} />

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
                      <View style={[styles.pickerContainer, { borderColor: theme.custom.separator }]}>
                        <Picker
                          selectedValue={activeHours.startHour}
                          onValueChange={(value) => handleActiveHoursStartChange(value as number)}
                          style={{ color: pickerColor }}
                          itemStyle={{ color: pickerColor, fontSize: 16, height: 120 }}
                        >
                          {HOUR_OPTIONS.filter(opt => opt.hour < activeHours.endHour).map((opt) => (
                            <Picker.Item key={opt.hour} label={opt.label} value={opt.hour} />
                          ))}
                        </Picker>
                      </View>
                    </View>
                    <View style={styles.activeHourPicker}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                        Until
                      </Text>
                      <View style={[styles.pickerContainer, { borderColor: theme.custom.separator }]}>
                        <Picker
                          selectedValue={activeHours.endHour}
                          onValueChange={(value) => handleActiveHoursEndChange(value as number)}
                          style={{ color: pickerColor }}
                          itemStyle={{ color: pickerColor, fontSize: 16, height: 120 }}
                        >
                          {HOUR_OPTIONS.filter(opt => opt.hour > activeHours.startHour).map((opt) => (
                            <Picker.Item key={opt.hour} label={opt.label} value={opt.hour} />
                          ))}
                        </Picker>
                      </View>
                    </View>
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Decks ── */}
        <View style={[styles.card, glassStyle]}>
          <Text
            variant="titleSmall"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
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
    gap: 16,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 12,
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
  pickerContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 8,
    height: 120,
  },
  activeHoursRow: {
    marginTop: 8,
    gap: 8,
  },
  activeHourPicker: {},
  deckActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    margin: 0,
    marginLeft: -4,
  },
});
