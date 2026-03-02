import React from 'react';
import { View, Image, StyleSheet, ImageSourcePropType } from 'react-native';
import { List, Text } from 'react-native-paper';
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
    <View style={styles.container}>
      <List.Item
        title={title}
        titleStyle={styles.title}
        description={description}
        descriptionStyle={styles.description}
        descriptionNumberOfLines={10}
        left={() => (
          <View
            style={[
              styles.badge,
              { backgroundColor: theme.colors.primary },
            ]}
          >
            <Text variant="labelMedium" style={{ color: theme.colors.onPrimary }}>
              {stepNumber}
            </Text>
          </View>
        )}
      />
      <View style={styles.imageContainer}>
        <Image source={image} style={styles.image} resizeMode="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    alignSelf: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  imageContainer: {
    marginHorizontal: 16,
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
