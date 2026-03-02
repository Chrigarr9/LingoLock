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
    primaryContainer: '#D6E4FF',
    onPrimaryContainer: '#001B3D',
    secondary: '#8E8E93',
    onSecondary: '#FFFFFF',
    background: '#FFFFFF',
    onBackground: '#000000',
    surface: '#FFFFFF',
    onSurface: '#000000',
    surfaceVariant: '#F2F2F7',
    onSurfaceVariant: '#8E8E93',
    outline: 'rgba(60,60,67,0.12)',
    error: '#FF3B30',
    onError: '#FFFFFF',
    errorContainer: '#FFE5E3',
    onErrorContainer: '#410002',
  },
  dark: {
    primary: '#0A84FF',
    onPrimary: '#FFFFFF',
    primaryContainer: '#003A70',
    onPrimaryContainer: '#D6E4FF',
    secondary: '#8E8E93',
    onSecondary: '#FFFFFF',
    background: '#000000',
    onBackground: '#FFFFFF',
    surface: '#1C1C1E',
    onSurface: '#FFFFFF',
    surfaceVariant: '#1C1C1E',
    onSurfaceVariant: '#8E8E93',
    outline: 'rgba(235,235,245,0.12)',
    error: '#FF453A',
    onError: '#FFFFFF',
    errorContainer: '#930006',
    onErrorContainer: '#FFE5E3',
  },
};

const fontConfig = {
  fontFamily: 'System',
};

export const lightTheme = {
  ...MD3LightTheme,
  roundness: 12,
  colors: {
    ...MD3LightTheme.colors,
    ...iOSColors.light,
  },
  fonts: configureFonts({ config: fontConfig }),
  custom: {
    success: '#34C759',
    successDark: '#30D158',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  roundness: 12,
  colors: {
    ...MD3DarkTheme.colors,
    ...iOSColors.dark,
  },
  fonts: configureFonts({ config: fontConfig }),
  custom: {
    success: '#30D158',
    successDark: '#30D158',
  },
};

export type AppTheme = typeof lightTheme;

export const useAppTheme = () => useTheme<AppTheme>();
