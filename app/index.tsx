import { View, Text, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>LingoLock 🔒</Text>
      <Text style={styles.subtitle}>Vocabulary learning, integrated into your day</Text>
      <Text style={styles.status}>Phase 1: Shortcuts Integration — Coming Soon</Text>
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
  },
});
