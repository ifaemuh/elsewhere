import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { TripAddOnSuggestion, TripIntakeResult } from '@elsewhere/shared';

const EXAMPLES = [
  'I need to go to Atlanta for my cousin’s wedding in June, leaving from LA Friday to Monday.',
  'Find me flights to New York next weekend for a work trip.',
  'I need to get to Paris this summer with two friends, flexible dates.',
];

function readableKind(value: string): string {
  return value.replace(/_/g, ' ');
}

function AddOnCard({ item }: { item: TripAddOnSuggestion }) {
  return (
    <View style={styles.addOnCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.addOnKind}>{readableKind(item.kind)}</Text>
        <Text style={styles.sourceLabel}>{readableKind(item.sourceKind)}</Text>
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardDetail}>{item.summary}</Text>
      <Text style={styles.priceText}>Est. ${item.estimatedPriceAmount.toLocaleString()}</Text>
    </View>
  );
}

export function TripIntakeContent({
  initialText = '',
  contentStyle,
}: {
  initialText?: string;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const [text, setText] = useState(initialText);
  const [travelerCount, setTravelerCount] = useState('1');
  const [result, setResult] = useState<TripIntakeResult | null>(null);

  const intakeMutation = useMutation({
    mutationFn: () => api.intakeTrip({
      text,
      travelerCount: Number.parseInt(travelerCount, 10) || 1,
    }),
    onSuccess: setResult,
  });

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, contentStyle]}>
      <Text style={styles.title}>Where are you headed?</Text>
      <Text style={styles.subtitle}>
        Type it like a text. Elsewhere starts with flights, then adds stays, cars, and plans only when they help.
      </Text>

      <TextInput
        style={styles.textArea}
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        placeholder="I need to go to Atlanta for my cousin’s wedding in June, leaving from LA Friday to Monday."
        placeholderTextColor="#8a9499"
      />

      <View style={styles.controlsRow}>
        <View style={styles.travelersBox}>
          <Text style={styles.controlLabel}>Travelers</Text>
          <TextInput
            style={styles.travelerInput}
            value={travelerCount}
            onChangeText={setTravelerCount}
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.voiceBox}>
          <Text style={styles.controlLabel}>Voice</Text>
          <Text style={styles.voiceText}>Use keyboard dictation for now</Text>
        </View>
      </View>

      <Pressable
        style={[styles.submitButton, (!text.trim() || intakeMutation.isPending) && styles.buttonDisabled]}
        onPress={() => intakeMutation.mutate()}
        disabled={!text.trim() || intakeMutation.isPending}
      >
        {intakeMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
            Find options
          </Text>
        )}
      </Pressable>

      {intakeMutation.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{(intakeMutation.error as Error).message}</Text>
        </View>
      ) : null}

      {!result ? (
        <View style={styles.examples}>
          <Text style={styles.sectionTitle}>Try</Text>
          {EXAMPLES.map((example) => (
            <Pressable key={example} style={styles.exampleCard} onPress={() => setText(example)}>
              <Text style={styles.exampleText}>{example}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.results}>
          <Text style={styles.sectionTitle}>Here’s what I understood</Text>
          <View style={styles.intentCard}>
            <Text style={styles.intentLine}>From: {result.parsedIntent.origin ?? 'Assumed from profile'}</Text>
            <Text style={styles.intentLine}>To: {result.parsedIntent.destination ?? 'Needs confirmation'}</Text>
            <Text style={styles.intentLine}>When: {result.parsedIntent.dateWindow ?? 'Flexible'}</Text>
            <Text style={styles.intentLine}>Why: {result.parsedIntent.purpose ?? 'Trip purpose unknown'}</Text>
            <Text style={styles.intentMeta}>Confidence {Math.round(result.parsedIntent.confidence * 100)}%</Text>
          </View>

          {result.assumptions.length ? (
            <View style={styles.assumptionsCard}>
              <Text style={styles.assumptionsTitle}>Assumptions</Text>
              {result.assumptions.map((item) => (
                <Text key={item} style={styles.assumptionText}>- {item}</Text>
              ))}
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Flights first</Text>
          {result.flightOptions.map((option) => (
            <View key={option.id} style={styles.flightCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.cardTitle}>{option.label}</Text>
                <Text style={styles.priceText}>${option.priceAmount.toLocaleString()}</Text>
              </View>
              <Text style={styles.cardDetail}>{option.summary}</Text>
              <Text style={styles.intentMeta}>
                {option.departureWindow} → {option.returnWindow} · {option.stops} stop{option.stops === 1 ? '' : 's'}
              </Text>
              <Text style={styles.limitText}>{option.limitation}</Text>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Suggested add-ons</Text>
          {result.addOns.map((item) => <AddOnCard key={item.id} item={item} />)}

          <View style={styles.actionsRow}>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                Watch this trip
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
                Save draft
              </Text>
            </Pressable>
          </View>
          <Pressable style={styles.submitButton}>
            <Text style={styles.submitButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              Continue to booking
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36 },
  title: { color: '#111', fontSize: 28, fontWeight: '900', lineHeight: 34 },
  subtitle: { color: '#555', fontSize: 15, lineHeight: 22, marginTop: 8, marginBottom: 16 },
  textArea: {
    minHeight: 150,
    borderWidth: 1,
    borderColor: '#e3dbcf',
    borderRadius: 18,
    padding: 14,
    color: '#111',
    fontSize: 16,
    lineHeight: 22,
    backgroundColor: '#fff',
  },
  controlsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  travelersBox: { width: 110, borderWidth: 1, borderColor: '#e3dbcf', borderRadius: 16, padding: 12, backgroundColor: '#fff' },
  voiceBox: { flex: 1, borderWidth: 1, borderColor: '#e3dbcf', borderRadius: 16, padding: 12, backgroundColor: '#fff' },
  controlLabel: { color: '#667085', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  travelerInput: { color: '#111', fontSize: 22, fontWeight: '900', marginTop: 6 },
  voiceText: { color: '#555', fontSize: 13, lineHeight: 18, marginTop: 6 },
  submitButton: { backgroundColor: '#111', borderRadius: 14, minHeight: 50, paddingHorizontal: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  buttonDisabled: { opacity: 0.5 },
  submitButtonText: { color: '#fff', fontSize: 15, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  errorBox: { backgroundColor: '#fff5f5', borderColor: '#fed7d7', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 12 },
  errorText: { color: '#c53030', fontSize: 13, lineHeight: 18 },
  examples: { marginTop: 24 },
  sectionTitle: { color: '#111', fontSize: 18, fontWeight: '900', marginTop: 22, marginBottom: 10 },
  exampleCard: { backgroundColor: '#fff', borderRadius: 16, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(20, 20, 20, 0.08)' },
  exampleText: { color: '#333', fontSize: 14, lineHeight: 20 },
  results: { marginTop: 8 },
  intentCard: { borderWidth: 1, borderColor: '#e3dbcf', borderRadius: 16, padding: 14, backgroundColor: '#fff' },
  intentLine: { color: '#222', fontSize: 14, lineHeight: 22, fontWeight: '700' },
  intentMeta: { color: '#667085', fontSize: 12, lineHeight: 18, marginTop: 7 },
  assumptionsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#e3dbcf' },
  assumptionsTitle: { color: '#6f5428', fontSize: 13, fontWeight: '900' },
  assumptionText: { color: '#5a5145', fontSize: 12, lineHeight: 18, marginTop: 4 },
  flightCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(20, 20, 20, 0.08)', borderRadius: 16, padding: 14, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  cardTitle: { flex: 1, color: '#111', fontSize: 16, fontWeight: '900' },
  cardDetail: { color: '#555', fontSize: 13, lineHeight: 19, marginTop: 6 },
  priceText: { color: '#111', fontSize: 15, fontWeight: '900' },
  limitText: { color: '#8a6d3b', fontSize: 11, lineHeight: 16, marginTop: 7 },
  addOnCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(20, 20, 20, 0.08)' },
  addOnKind: { color: '#8b6b34', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  sourceLabel: { color: '#667085', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  secondaryButton: { flex: 1, minWidth: 138, minHeight: 46, borderWidth: 1, borderColor: '#111', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  secondaryButtonText: { color: '#111', fontSize: 14, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
});
