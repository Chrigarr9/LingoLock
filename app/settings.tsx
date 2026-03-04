import React, { useState } from 'react';
import { View, StyleSheet, Platform, Pressable } from 'react-native';
import { Text, Switch, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../src/theme';
import {
  loadAudioMuted,
  saveAudioMuted,
  loadNewWordsPerDay,
  saveNewWordsPerDay,
  loadNotificationsEnabled,
  saveNotificationsEnabled,
  loadNotificationInterval,
  saveNotificationInterval,
} from '../src/services/storage';
import {
  setNotificationInterval,
  pauseNotifications,
  resumeNotifications,
  cancelAllNotifications,
} from '../src/services/notificationScheduler';
import { requestNotificationPermissions } from '../src/services/notificationService';

export default function SettingsScreen() {
  const theme = useAppTheme();

  const [isMuted, setIsMuted] = useState(() => loadAudioMuted());
  const [newWordsPerDay, setNewWordsPerDay] = useState(() => loadNewWordsPerDay());
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => loadNotificationsEnabled());
  const [notificationInterval, setNotificationIntervalState] = useState(() => loadNotificationInterval());

  function handleMuteToggle(value: boolean) {
    setIsMuted(value);
    saveAudioMuted(value);
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
