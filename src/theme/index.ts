import {
  MD3LightTheme,
  MD3DarkTheme,
  configureFonts,
  useTheme,
} from 'react-native-paper';

const iOSColors = {
  light: {
    primary: '#007AFF',
    onPrimary: '#FFFFFF',
    primaryContainer: '#EBF2FF',
    onPrimaryContainer: '#001B3D',
    secondary: '#8E8E93',
    onSecondary: '#FFFFFF',
    background: '#F2F2F7',
    onBackground: '#000000',
    surface: '#FFFFFF',
    onSurface: '#1C1C1E',
    surfaceVariant: '#F2F2F7',
    onSurfaceVariant: '#6C6C70',
    surfaceDisabled: 'rgba(28,28,30,0.12)',
    outline: 'rgba(60,60,67,0.18)',
    outlineVariant: 'rgba(60,60,67,0.08)',
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
    primary: '#0A84FF',
    onPrimary: '#FFFFFF',
    primaryContainer: '#1A3A5C',
    onPrimaryContainer: '#D6E4FF',
    secondary: '#636366',
    onSecondary: '#FFFFFF',
    background: '#000000',
    onBackground: '#F2F2F7',
    surface: '#1C1C1E',
    onSurface: '#F2F2F7',
    surfaceVariant: '#2C2C2E',
    onSurfaceVariant: '#AEAEB2',
    surfaceDisabled: 'rgba(242,242,247,0.12)',
    outline: 'rgba(235,235,245,0.2)',
    outlineVariant: 'rgba(235,235,245,0.08)',
    error: '#FF453A',
    onError: '#FFFFFF',
    errorContainer: '#3A1214',
    onErrorContainer: '#FFB4AB',
    elevation: {
      level0: 'transparent',
      level1: '#1C1C1E',
      level2: '#2C2C2E',
      level3: '#3A3A3C',
      level4: '#3A3A3C',
      level5: '#48484A',
    },
  },
};

const fontConfig = {
  fontFamily: 'System',
};

export const lightTheme = {
  ...MD3LightTheme,
  roundness: 14,
  colors: {
    ...MD3LightTheme.colors,
    ...iOSColors.light,
  },
  fonts: configureFonts({ config: fontConfig }),
  custom: {
    success: '#34C759',
    successDark: '#30D158',
    cardBackground: '#FFFFFF',
    cardBorder: 'rgba(60,60,67,0.1)',
    separator: 'rgba(60,60,67,0.12)',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  roundness: 14,
  colors: {
    ...MD3DarkTheme.colors,
    ...iOSColors.dark,
  },
  fonts: configureFonts({ config: fontConfig }),
  custom: {
    success: '#30D158',
    successDark: '#30D158',
    cardBackground: '#1C1C1E',
    cardBorder: 'rgba(235,235,245,0.08)',
    separator: 'rgba(235,235,245,0.15)',
  },
};

export type AppTheme = typeof lightTheme;

export const useAppTheme = () => useTheme<AppTheme>();
