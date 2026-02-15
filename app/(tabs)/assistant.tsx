import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { fetch } from "expo/fetch";

const C = Colors.light;
const { width: SCREEN_W } = Dimensions.get("window");

interface Message {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: string;
}

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  messages?: Message[];
}

function MessageBubble({ item }: { item: Message | { id: string; role: string; content: string } }) {
  const isUser = item.role === "user";
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}
    >
      {!isUser && (
        <LinearGradient
          colors={[C.tint, C.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarGradient}
        >
          <Ionicons name="flash" size={14} color="#fff" />
        </LinearGradient>
      )}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant,
          ]}
          selectable
        >
          {item.content}
        </Text>
      </View>
    </Animated.View>
  );
}

const SUGGESTIONS = [
  "What are common Medicaid fraud schemes?",
  "Explain billing code 97153 (ABA therapy)",
  "How to investigate a provider with 1000%+ growth?",
  "What does a suspicious billing spike look like?",
];

export default function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [inputText, setInputText] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const conversationsQuery = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const activeConvoQuery = useQuery<Conversation>({
    queryKey: ["/api/conversations", String(activeConversationId)],
    enabled: !!activeConversationId,
  });

  const messages: Message[] = activeConvoQuery.data?.messages || [];

  const createConversation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", "/api/conversations", { title });
      return res.json();
    },
    onSuccess: (data: Conversation) => {
      setActiveConversationId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const deleteConversation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: () => {
      if (activeConversationId) {
        setActiveConversationId(null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isSending) return;

      const messageText = text.trim();
      setInputText("");
      setIsSending(true);
      setStreamingContent("");

      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      try {
        let convoId = activeConversationId;

        if (!convoId) {
          const shortTitle = messageText.slice(0, 40) + (messageText.length > 40 ? "..." : "");
          const res = await apiRequest("POST", "/api/conversations", { title: shortTitle });
          const newConvo: Conversation = await res.json();
          convoId = newConvo.id;
          setActiveConversationId(convoId);
          queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        }

        await queryClient.invalidateQueries({ queryKey: ["/api/conversations", String(convoId)] });

        const baseUrl = getApiUrl();
        const url = new URL(`/api/conversations/${convoId}/messages`, baseUrl);

        const response = await fetch(url.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: messageText }),
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader available");

        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  accumulated += data.content;
                  setStreamingContent(accumulated);
                }
                if (data.done) {
                  setStreamingContent("");
                  await queryClient.invalidateQueries({
                    queryKey: ["/api/conversations", String(convoId)],
                  });
                }
                if (data.error) {
                  console.error("Stream error:", data.error);
                }
              } catch {}
            }
          }
        }
      } catch (error) {
        console.error("Error sending message:", error);
      } finally {
        setIsSending(false);
        setStreamingContent("");
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      }
    },
    [activeConversationId, isSending]
  );

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setShowSidebar(false);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const displayMessages: (Message | { id: string; role: string; content: string })[] = [
    ...messages,
  ];
  if (streamingContent) {
    displayMessages.push({
      id: "streaming",
      role: "assistant",
      content: streamingContent,
    });
  }

  const reversedMessages = [...displayMessages].reverse();

  const hasConversation = activeConversationId !== null;
  const hasMessages = displayMessages.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      {showSidebar && (
        <Pressable style={styles.sidebarOverlay} onPress={() => setShowSidebar(false)}>
          <Animated.View entering={FadeIn.duration(150)} style={styles.sidebar}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={[styles.sidebarHeader, { paddingTop: topInset + 8 }]}>
                <Text style={styles.sidebarTitle}>Conversations</Text>
                <Pressable onPress={() => setShowSidebar(false)}>
                  <Ionicons name="close" size={22} color={C.textSecondary} />
                </Pressable>
              </View>
              <Pressable style={styles.sidebarNewBtn} onPress={handleNewChat}>
                <Ionicons name="add-circle-outline" size={18} color={C.tint} />
                <Text style={styles.sidebarNewText}>New Conversation</Text>
              </Pressable>
              <FlatList
                data={conversationsQuery.data || []}
                keyExtractor={(item) => String(item.id)}
                style={styles.sidebarList}
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.sidebarItem,
                      item.id === activeConversationId && styles.sidebarItemActive,
                    ]}
                    onPress={() => {
                      setActiveConversationId(item.id);
                      setShowSidebar(false);
                    }}
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={14}
                      color={item.id === activeConversationId ? C.tint : C.textMuted}
                    />
                    <Text
                      style={[
                        styles.sidebarItemText,
                        item.id === activeConversationId && styles.sidebarItemTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Pressable
                      hitSlop={10}
                      onPress={(e) => {
                        e.stopPropagation();
                        deleteConversation.mutate(item.id);
                      }}
                    >
                      <Ionicons name="trash-outline" size={14} color={C.textMuted} />
                    </Pressable>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <Text style={styles.sidebarEmptyText}>No conversations yet</Text>
                }
              />
            </Pressable>
          </Animated.View>
        </Pressable>
      )}

      <View style={[styles.topBar, { paddingTop: topInset + 4 }]}>
        <Pressable onPress={() => setShowSidebar(true)} hitSlop={10}>
          <Ionicons name="menu" size={22} color={C.textSecondary} />
        </Pressable>
        <View style={styles.topBarCenter}>
          <LinearGradient
            colors={[C.tint, C.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.topBarIcon}
          >
            <Ionicons name="flash" size={12} color="#fff" />
          </LinearGradient>
          <Text style={styles.topBarTitle}>Sleuth AI</Text>
        </View>
        <Pressable onPress={handleNewChat} hitSlop={10}>
          <Feather name="edit" size={20} color={C.textSecondary} />
        </Pressable>
      </View>

      {!hasMessages ? (
        <View style={styles.emptyState}>
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.emptyContent}>
            <LinearGradient
              colors={[C.tintBg2, "transparent"]}
              style={styles.emptyGlow}
            />
            <LinearGradient
              colors={[C.tint, C.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyIcon}
            >
              <Ionicons name="flash" size={32} color="#fff" />
            </LinearGradient>
            <Text style={styles.emptyTitle}>Sleuth AI</Text>
            <Text style={styles.emptySubtitle}>
              Your Medicaid fraud analysis assistant
            </Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.suggestionsContainer}>
            {SUGGESTIONS.map((suggestion, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.suggestionChip,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => sendMessage(suggestion)}
              >
                <Feather name="arrow-up-right" size={13} color={C.tint} />
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </Pressable>
            ))}
          </Animated.View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={reversedMessages}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <MessageBubble item={item} />}
          inverted
          contentContainerStyle={[
            styles.messagesList,
            { paddingBottom: 8 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            isSending && !streamingContent ? (
              <View style={styles.typingIndicator}>
                <LinearGradient
                  colors={[C.tint, C.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarGradient}
                >
                  <Ionicons name="flash" size={14} color="#fff" />
                </LinearGradient>
                <View style={styles.typingDots}>
                  <ActivityIndicator size="small" color={C.tint} />
                </View>
              </View>
            ) : null
          }
        />
      )}

      <View
        style={[
          styles.inputBar,
          { paddingBottom: Math.max(bottomInset, 12) },
        ]}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask about fraud patterns..."
            placeholderTextColor={C.textMuted}
            multiline
            maxLength={2000}
            editable={!isSending}
            onSubmitEditing={() => sendMessage(inputText)}
            blurOnSubmit={false}
            testID="chat-input"
          />
          <Pressable
            style={[
              styles.sendBtn,
              (!inputText.trim() || isSending) && styles.sendBtnDisabled,
            ]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isSending}
            testID="send-button"
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-up" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.background,
  },
  topBarCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topBarIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.text,
  },

  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 100,
  },
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: Math.min(300, SCREEN_W * 0.8),
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.border,
    zIndex: 101,
  },
  sidebarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sidebarTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.text,
  },
  sidebarNewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sidebarNewText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: C.tint,
  },
  sidebarList: {
    flex: 1,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSubtle,
  },
  sidebarItemActive: {
    backgroundColor: C.tintBg,
  },
  sidebarItemText: {
    flex: 1,
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
  },
  sidebarItemTextActive: {
    color: C.tint,
    fontFamily: "DMSans_500Medium",
  },
  sidebarEmptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textMuted,
    textAlign: "center",
    paddingVertical: 24,
  },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyContent: {
    alignItems: "center",
    marginBottom: 32,
  },
  emptyGlow: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -30,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 24,
    color: C.text,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: C.textSecondary,
    textAlign: "center",
  },
  suggestionsContainer: {
    gap: 8,
    width: "100%",
    maxWidth: 400,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: C.border,
  },
  suggestionText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    flex: 1,
  },

  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 8,
    maxWidth: "88%" as unknown as number,
  },
  bubbleRowUser: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  avatarGradient: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "90%" as unknown as number,
  },
  bubbleUser: {
    backgroundColor: C.tint,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: C.surfaceElevated,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextUser: {
    fontFamily: "DMSans_500Medium",
    color: C.textInverse,
  },
  bubbleTextAssistant: {
    fontFamily: "DMSans_400Regular",
    color: C.text,
  },

  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surfaceElevated,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
  },

  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.background,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
    minHeight: 44,
  },
  textInput: {
    flex: 1,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: C.text,
    maxHeight: 100,
    paddingVertical: 8,
    paddingRight: 8,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.tint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  sendBtnDisabled: {
    backgroundColor: C.border,
  },
});
