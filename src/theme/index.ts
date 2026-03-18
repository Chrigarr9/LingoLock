import {
  MD3LightTheme,
  MD3DarkTheme,
  configureFonts,
  useTheme,
} from 'react-native-paper';

const blueColors = {
  light: {
    primary: '#5B8EC4',
    onPrimary: '#FFFFFF',
    primaryContainer: 'rgba(91,142,196,0.15)',
    onPrimaryContainer: '#1C2E4A',
    secondary: '#7A9BBF',
    onSecondary: '#FFFFFF',
    background: '#EEF3F9',
    onBackground: '#1C2E4A',
    surface: '#FFFFFF',
    onSurface: '#1C2E4A',
    surfaceVariant: '#DCE8F4',
    onSurfaceVariant: '#4A6B8A',
    surfaceDisabled: 'rgba(28,46,74,0.12)',
    outline: 'rgba(91,142,196,0.20)',
    outlineVariant: 'rgba(91,142,196,0.10)',
    error: '#FF3B30',
    onError: '#FFFFFF',
    errorContainer: '#FFE5E3',
    onErrorContainer: '#410002',
    elevation: {
      level0: 'transparent',
      level1: '#FFFFFF',
      level2: '#FFFFFF',
      level3: '#FFFFFF',
      level4: '#FFFFFF',
      level5: '#FFFFFF',
    },
  },
  dark: {
    primary: '#7AADD8',
    onPrimary: '#0F1929',
    primaryContainer: 'rgba(91,142,196,0.25)',
    onPrimaryContainer: '#B8D4EE',
    secondary: '#5B8EC4',
    onSecondary: '#FFFFFF',
    background: '#0F1929',
    onBackground: '#DCE8F4',
    surface: '#1A2B3D',
    onSurface: '#DCE8F4',
    surfaceVariant: '#1E3450',
    onSurfaceVariant: '#90AFCC',
    surfaceDisabled: 'rgba(220,232,244,0.12)',
    outline: 'rgba(122,173,216,0.25)',
    outlineVariant: 'rgba(122,173,216,0.10)',
    error: '#FF453A',
    onError: '#FFFFFF',
    errorContainer: '#3A1214',
    onErrorContainer: '#FFB4AB',
    elevation: {
      level0: 'transparent',
      level1: '#1A2B3D',
      level2: '#1E3450',
      level3: '#243D5E',
      level4: '#243D5E',
      level5: '#2A4568',
    },
  },
};

const fontConfig = {
  fontFamily: 'System',
};

export const lightTheme = {
  ...MD3LightTheme,
  roundness: 20,
  colors: {
    ...MD3LightTheme.colors,
    ...blueColors.light,
  },
  fonts: configureFonts({ config: fontConfig }),
  custom: {
    success: '#34C759',
    successDark: '#30D158',
    brandBlue: '#5B8EC4',
    brandOrange: '#FFA056',
    navy: '#1C2E4A',
    cardBackground: '#FFFFFF',
    cardBorder: 'rgba(91,142,196,0.12)',
    separator: 'rgba(91,142,196,0.12)',
    glassBackground: 'rgba(255,255,255,0.50)',
    glassBorder: 'rgba(91,142,196,0.25)',
    glassBlur: 20,
    labelMuted: 'rgba(74,107,138,0.80)',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  roundness: 20,
  colors: {
    ...MD3DarkTheme.colors,
    ...blueColors.dark,
  },
  fonts: configureFonts({ config: fontConfig }),
  custom: {
    success: '#30D158',
    successDark: '#30D158',
    brandBlue: '#7AADD8',
    brandOrange: '#FFA056',
    navy: '#DCE8F4',
    cardBackground: '#1A2B3D',
    cardBorder: 'rgba(122,173,216,0.12)',
    separator: 'rgba(122,173,216,0.15)',
    glassBackground: 'rgba(26,43,61,0.60)',
    glassBorder: 'rgba(122,173,216,0.15)',
    glassBlur: 20,
    labelMuted: 'rgba(144,175,204,0.80)',
  },
};

export type AppTheme = typeof lightTheme;

export const useAppTheme = () => useTheme<AppTheme>();

// ---------------------------------------------------------------------------
// Shared style utilities — single-source-of-truth for repeated visual tokens
// ---------------------------------------------------------------------------

import { Platform, StyleSheet } from 'react-native';

/** Glass surface: translucent background + border + backdrop blur (web only). */
export function getGlassStyle(theme: AppTheme) {
  return {
    backgroundColor: theme.custom.glassBackground,
    borderColor: theme.custom.glassBorder,
    ...Platform.select({
      web: { backdropFilter: `blur(${theme.custom.glassBlur}px)` } as any,
      default: {},
    }),
  };
}

/** Standard card surface: opaque background + subtle border. */
export function getCardStyle(theme: AppTheme) {
  return {
    backgroundColor: theme.custom.cardBackground,
    borderColor: theme.custom.cardBorder,
  };
}

/** Overline label typography used for section headers across the app. */
export const labelOverlineStyle = StyleSheet.create({
  label: {
    fontWeight: '700' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    fontSize: 10,
  },
});
