import { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import type { TripRoomMessage } from '@elsewhere/shared';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;
if (SUPABASE_URL) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY!);
}

export default function TripRoomScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);

  const { data: messages } = useQuery({
    queryKey: ['messages', tripId],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1/trips/messages?tripId=${tripId}`,
        {
          headers: {
            Authorization: `Bearer ${useAuthStore.getState().session?.access_token}`,
          },
        },
      );
      return res.json() as Promise<TripRoomMessage[]>;
    },
    enabled: !!tripId,
  });

  // Subscribe to realtime inserts (only when Supabase is available)
  useEffect(() => {
    if (!tripId || !supabase) return;

    const channel = supabase
      .channel(`room-${tripId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trip_room_messages', filter: `trip_id=eq.${tripId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', tripId] });
        },
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }, [tripId, queryClient]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1/trips/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${useAuthStore.getState().session?.access_token}`,
          },
          body: JSON.stringify({ tripId, text: text.trim() }),
        },
      );
      setText('');
      queryClient.invalidateQueries({ queryKey: ['messages', tripId] });
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        renderItem={({ item }) => {
          const isMe = item.authorId === userId;
          return (
            <View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
              {!isMe && <Text style={styles.authorName}>{item.authorName}</Text>}
              <Text style={[styles.messageText, isMe && styles.myText]}>{item.text}</Text>
              <Text style={styles.time}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No messages yet. Start planning!</Text>
          </View>
        }
        contentContainerStyle={styles.messageList}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Message your group..."
          placeholderTextColor="#999"
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Pressable
          style={[styles.sendButton, (!text.trim() || sending) && styles.sendDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  messageList: { padding: 16, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#999', fontSize: 16 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 8 },
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#0a7ea4' },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0' },
  authorName: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 2 },
  messageText: { fontSize: 15, color: '#333' },
  myText: { color: '#fff' },
  time: { fontSize: 11, color: '#99999980', marginTop: 4, alignSelf: 'flex-end' },
  inputRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#eee', gap: 8 },
  input: { flex: 1, backgroundColor: '#f8f9fa', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  sendButton: { backgroundColor: '#0a7ea4', borderRadius: 20, paddingHorizontal: 20, justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: '#fff', fontWeight: '600' },
});
