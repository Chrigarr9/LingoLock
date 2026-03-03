import {
  MD3LightTheme,
  MD3DarkTheme,
  configureFonts,
  useTheme,
} from 'react-native-paper';

const warmColors = {
  light: {
    primary: '#FFA056',
    onPrimary: '#FFFFFF',
    primaryContainer: 'rgba(255,160,86,0.15)',
    onPrimaryContainer: '#7C2D12',
    secondary: '#8d8478',
    onSecondary: '#FFFFFF',
    background: '#fffcf2',
    onBackground: '#403d39',
    surface: '#FFFFFF',
    onSurface: '#403d39',
    surfaceVariant: '#f5f0e8',
    onSurfaceVariant: '#8d8478',
    surfaceDisabled: 'rgba(64,61,57,0.12)',
    outline: 'rgba(141,132,120,0.18)',
    outlineVariant: 'rgba(141,132,120,0.08)',
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
    primary: '#FFA056',
    onPrimary: '#FFFFFF',
    primaryContainer: 'rgba(255,160,86,0.20)',
    onPrimaryContainer: '#FFD6B8',
    secondary: '#636366',
    onSecondary: '#FFFFFF',
    background: '#1a1918',
    onBackground: '#F2F0ED',
    surface: '#2C2C2A',
    onSurface: '#F2F0ED',
    surfaceVariant: '#3A3A37',
    onSurfaceVariant: '#AEAEB2',
    surfaceDisabled: 'rgba(242,240,237,0.12)',
    outline: 'rgba(235,235,245,0.2)',
    outlineVariant: 'rgba(235,235,245,0.08)',
    error: '#FF453A',
    onError: '#FFFFFF',
    errorContainer: '#3A1214',
    onErrorContainer: '#FFB4AB',
    elevation: {
      level0: 'transparent',
      level1: '#2C2C2A',
      level2: '#3A3A37',
      level3: '#48484A',
      level4: '#48484A',
      level5: '#545452',
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
    ...warmColors.light,
  },
  fonts: configureFonts({ config: fontConfig }),
  custom: {
    success: '#34C759',
    successDark: '#30D158',
    brandOrange: '#FFA056',
    cardBackground: '#FFFFFF',
    cardBorder: 'rgba(141,132,120,0.10)',
    separator: 'rgba(141,132,120,0.12)',
    glassBackground: 'rgba(255,255,255,0.40)',
    glassBorder: 'rgba(255,255,255,0.60)',
    glassBlur: 20,
    labelMuted: 'rgba(194,65,12,0.60)',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  roundness: 20,
  colors: {
    ...MD3DarkTheme.colors,
    ...warmColors.dark,
  },
  fonts: configureFonts({ config: fontConfig }),
  custom: {
    success: '#30D158',
    successDark: '#30D158',
    brandOrange: '#FFA056',
    cardBackground: '#2C2C2A',
    cardBorder: 'rgba(235,235,245,0.08)',
    separator: 'rgba(235,235,245,0.15)',
    glassBackground: 'rgba(44,44,42,0.50)',
    glassBorder: 'rgba(255,255,255,0.08)',
    glassBlur: 20,
    labelMuted: 'rgba(255,160,86,0.60)',
  },
};

export type AppTheme = typeof lightTheme;

export const useAppTheme = () => useTheme<AppTheme>();
