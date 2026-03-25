import React, { useEffect } from 'react';
import { View, StyleSheet, Pressable, AppState } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme, getGlassStyle } from '../src/theme';

export default function GraceScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const glassStyle = getGlassStyle(theme);

  // Auto-dismiss when app returns from background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') router.dismissAll();
    });
    return () => sub.remove();
  }, [router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.card, glassStyle]}>
        <Icon source="check-circle" size={56} color={theme.colors.primary} />
        <Text
          variant="headlineSmall"
          style={[styles.title, { color: theme.colors.onSurface }]}
        >
          Practice complete!
        </Text>
      </View>

      <View style={[styles.tipCard, glassStyle]}>
        <Icon source="alert-circle-outline" size={22} color={theme.colors.primary} />
        <Text
          variant="bodySmall"
          style={[styles.tipText, { color: theme.colors.onSurfaceVariant }]}
        >
          Your app isn't in our list, so we can't redirect you automatically. To fix this, add the "Practice Needed" cooldown action before "Start Practice" in your Shortcuts automation. This prevents LingoLock from opening again after you've practiced. See the setup tutorial for details.
        </Text>
      </View>

      <Pressable
        onPress={() => router.dismissAll()}
        style={[styles.dismissButton, { backgroundColor: theme.colors.surfaceVariant }]}
      >
        <Text style={[styles.dismissText, { color: theme.colors.onSurface }]}>Dismiss</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  card: {
    padding: 32,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
  },
  tipCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tipText: {
    flex: 1,
    lineHeight: 18,
  },
  dismissButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 20,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  dismissText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
