import React from 'react';
import { View, Image, StyleSheet, ImageSourcePropType } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '../theme';

interface TutorialStepProps {
  stepNumber: number;
  title: string;
  description: string;
  image: ImageSourcePropType;
}

export function TutorialStep({ stepNumber, title, description, image }: TutorialStepProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.container, { borderTopColor: theme.custom.separator }]}>
      <View style={styles.header}>
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.colors.primary + '18' },
          ]}
        >
          <Text
            variant="labelMedium"
            style={{ color: theme.colors.primary, fontWeight: '700' }}
          >
            {stepNumber}
          </Text>
        </View>
        <View style={styles.textContent}>
          <Text
            variant="titleSmall"
            style={{ color: theme.colors.onSurface, fontWeight: '600' }}
          >
            {title}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18, marginTop: 2 }}
          >
            {description}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.imageContainer,
          { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.custom.cardBorder },
        ]}
      >
        <Image source={image} style={styles.image} resizeMode="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  textContent: {
    flex: 1,
  },
  imageContainer: {
    height: 180,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
