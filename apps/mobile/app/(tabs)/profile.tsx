import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useAuthStore } from '@/stores/auth';

export default function ProfileScreen() {
  const { session, signOut } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      {session ? (
        <>
          <Text style={styles.email}>{session.user.email}</Text>
          <Pressable style={styles.button} onPress={signOut}>
            <Text style={styles.buttonText}>Sign Out</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.subtitle}>Not signed in</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  email: { fontSize: 16, color: '#666', marginBottom: 24 },
  subtitle: { fontSize: 16, color: '#666' },
  button: { backgroundColor: '#0a7ea4', padding: 14, borderRadius: 8, marginTop: 24, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
