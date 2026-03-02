import React from 'react';
import { View, Text, Image, StyleSheet, useColorScheme, ImageSourcePropType } from 'react-native';

interface TutorialStepProps {
  stepNumber: number;
  title: string;
  description: string;
  image: ImageSourcePropType;
}

export function TutorialStep({ stepNumber, title, description, image }: TutorialStepProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.container}>
      {/* Step number */}
      <View style={[
        styles.stepBadge,
        { backgroundColor: isDark ? '#0a84ff' : '#007aff' }
      ]}>
        <Text style={styles.stepNumber}>{stepNumber}</Text>
      </View>

      {/* Title */}
      <Text style={[
        styles.title,
        { color: isDark ? '#ffffff' : '#000000' }
      ]}>
        {title}
      </Text>

      {/* Screenshot */}
      <View style={styles.imageContainer}>
        <Image
          source={image}
          style={styles.image}
          resizeMode="contain"
        />
      </View>

      {/* Description */}
      <Text style={[
        styles.description,
        { color: isDark ? 'rgba(235, 235, 245, 0.6)' : 'rgba(60, 60, 67, 0.6)' }
      ]}>
        {description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  stepBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'System',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    fontFamily: 'System',
    textAlign: 'center',
    marginBottom: 20,
  },
  imageContainer: {
    width: '100%',
    height: 300,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  description: {
    fontSize: 15,
    fontFamily: 'System',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
});
