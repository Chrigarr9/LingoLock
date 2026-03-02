import { View, Text, StyleSheet, Button } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LingoLock 🔒</Text>
      <Text style={styles.subtitle}>Vocabulary learning, integrated into your day</Text>
      <Text style={styles.status}>Phase 1: Shortcuts Integration</Text>

      <View style={styles.buttonContainer}>
        <Button
          title="Setup Tutorial"
          onPress={() => router.push('/tutorial')}
        />
      </View>

      <Text style={styles.hint}>
        Configure iOS Shortcuts to trigger vocabulary challenges when unlocking your device or opening apps.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
  },
  status: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 32,
  },
  buttonContainer: {
    marginVertical: 20,
  },
  hint: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 40,
  },
});
