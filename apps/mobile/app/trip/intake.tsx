import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TripIntakeContent } from '@/components/TripIntakeContent';

export default function TripIntakeScreen() {
  const { initialText } = useLocalSearchParams<{ initialText?: string }>();

  return (
    <View style={styles.container}>
      <TripIntakeContent initialText={initialText ?? ''} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f4ef' },
});
