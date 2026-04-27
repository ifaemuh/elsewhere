import { useState, useEffect } from 'react';
import { View, Text, Switch, StyleSheet, ActivityIndicator } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { useAuthStore } from '@/stores/auth';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const isDevMode = !SUPABASE_URL;

export default function AssistSettingsScreen() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const token = useAuthStore((s) => s.session?.access_token);
  const [autoRebook, setAutoRebook] = useState(false);
  const [creditProtection, setCreditProtection] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDevMode) {
      setLoading(false);
      return;
    }
    if (!userId || !token) return;
    const client = createClient(
      SUPABASE_URL!,
      SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    client
      .from('profiles')
      .select('is_auto_rebook_enabled, is_credit_protection_enabled')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setAutoRebook(data.is_auto_rebook_enabled);
          setCreditProtection(data.is_credit_protection_enabled);
        }
        setLoading(false);
      });
  }, [userId, token]);

  const updatePref = async (field: string, value: boolean) => {
    if (isDevMode || !userId || !token) return;
    const client = createClient(
      SUPABASE_URL!,
      SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    await client
      .from('profiles')
      .update({ [field]: value })
      .eq('id', userId);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Protection Settings</Text>
      <Text style={styles.description}>
        Control how Elsewhere responds to travel disruptions on your behalf.
      </Text>

      <View style={styles.setting}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingTitle}>Auto-Rebook</Text>
          <Text style={styles.settingDesc}>
            Automatically rebook flights when delays or cancellations are detected.
            We'll find the best alternative and confirm it for you.
          </Text>
        </View>
        <Switch
          value={autoRebook}
          onValueChange={(v) => {
            setAutoRebook(v);
            updatePref('is_auto_rebook_enabled', v);
          }}
          trackColor={{ true: '#0a7ea4' }}
        />
      </View>

      <View style={styles.setting}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingTitle}>Credit Protection</Text>
          <Text style={styles.settingDesc}>
            Automatically secure airline and hotel credits when cancellations occur.
            Ensures no value is lost from disrupted bookings.
          </Text>
        </View>
        <Switch
          value={creditProtection}
          onValueChange={(v) => {
            setCreditProtection(v);
            updatePref('is_credit_protection_enabled', v);
          }}
          trackColor={{ true: '#0a7ea4' }}
        />
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>How it works</Text>
        <Text style={styles.infoText}>
          When a disruption is detected, our system evaluates it against protection policies.
          If auto-rebook or credit protection is enabled, we act immediately.
          Otherwise, you'll see the incident and can choose how to respond.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  description: { fontSize: 15, color: '#666', marginBottom: 32, lineHeight: 22 },
  setting: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  settingInfo: { flex: 1 },
  settingTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  settingDesc: { fontSize: 13, color: '#999', lineHeight: 18 },
  infoBox: { backgroundColor: '#f8f9fa', borderRadius: 12, padding: 20, marginTop: 32 },
  infoTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  infoText: { fontSize: 13, color: '#666', lineHeight: 20 },
});
