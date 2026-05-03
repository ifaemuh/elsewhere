import { ScrollView, Text, Pressable, StyleSheet, Linking, View } from 'react-native';
import { AppHeader, BRAND_TAGLINE, SOCIAL_POP } from '@/components/AppHeader';
import { useHorizontalTabSwipe } from '@/hooks/useHorizontalTabSwipe';
import { useAuthStore } from '@/stores/auth';

export default function ProfileScreen() {
  const { session, signOut } = useAuthStore();
  const tabSwipeHandlers = useHorizontalTabSwipe('profile');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} {...tabSwipeHandlers}>
      <AppHeader pageLabel="profile" tagline="identity, wallet, documents, media" />
      {session ? (
        <>
          <Text style={styles.email}>{session.user.email}</Text>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Wallet</Text>
            <Text style={styles.sectionText}>Payment methods, 0% plans, travel credits, refunds, and saved travelers.</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Travel Admin</Text>
            <Text style={styles.sectionText}>Passport, TSA PreCheck, Global Entry, document reminders, and GovSwift partner handoffs.</Text>
            <Pressable
              style={styles.partnerButton}
              onPress={() => Linking.openURL('https://govswift.com/services/passport/?utm_source=elsewhere&utm_medium=app&utm_campaign=travel_admin')}
            >
              <Text style={styles.partnerButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                Explore passport help with GovSwift
              </Text>
            </Pressable>
            <Text style={styles.disclaimerText}>
              GovSwift is not a government agency. Elsewhere should use this as a partner handoff after document-risk checks.
            </Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reference Photos</Text>
            <Text style={styles.sectionText}>Reusable selfie, half-body, and full-body references for personalized previews.</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Integrations</Text>
            <Text style={styles.sectionText}>Calendar, photo library, social sharing, and trip notification preferences.</Text>
          </View>
          <Pressable style={styles.button} onPress={signOut}>
            <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              Sign Out
            </Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.subtitle}>Not signed in</Text>
      )}
      <View style={styles.brandFooter}>
        <Text style={styles.brandFooterText}>{BRAND_TAGLINE}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SOCIAL_POP.background },
  content: { padding: 16, paddingBottom: 104 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  email: { fontSize: 16, color: '#666', marginBottom: 24 },
  subtitle: { fontSize: 16, color: '#666' },
  section: {
    padding: 15,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
  },
  sectionTitle: { fontSize: 16, color: '#111', fontWeight: '800' },
  sectionText: { color: '#666', fontSize: 13, lineHeight: 19, marginTop: 5 },
  partnerButton: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: SOCIAL_POP.coral,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  partnerButtonText: { color: '#fff', fontSize: 12, lineHeight: 14, fontWeight: '900', textAlign: 'center' },
  disclaimerText: { color: '#777', fontSize: 11, lineHeight: 16, marginTop: 8 },
  button: { backgroundColor: SOCIAL_POP.text, minHeight: 48, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, marginTop: 24, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16, lineHeight: 19, textAlign: 'center' },
  brandFooter: {
    marginTop: 30,
    marginBottom: 10,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: SOCIAL_POP.border,
  },
  brandFooterText: {
    color: SOCIAL_POP.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
});
