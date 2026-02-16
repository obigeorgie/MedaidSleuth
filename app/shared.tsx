import React, { useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import Animated, { FadeInDown } from "react-native-reanimated";

const C = Colors.light;

interface SharedFinding {
  id: string;
  fromUserId: string;
  toUserId: string;
  providerId: string;
  providerName: string;
  message?: string;
  isRead: boolean;
  createdAt: string;
  fromUsername?: string;
  toUsername?: string;
}

interface SharedFindingsData {
  received: SharedFinding[];
  sent: SharedFinding[];
}

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function FindingCard({
  finding,
  isReceived,
  index,
  onPress,
}: {
  finding: SharedFinding;
  isReceived: boolean;
  index: number;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          isReceived && !finding.isRead && styles.cardUnread,
          pressed && { opacity: 0.7 },
        ]}
        onPress={onPress}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardHeader}>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName} numberOfLines={1}>
                {finding.providerName}
              </Text>
              <Text style={styles.username} numberOfLines={1}>
                {isReceived
                  ? `from ${finding.fromUsername}`
                  : `to ${finding.toUsername}`}
              </Text>
            </View>
            <Text style={styles.timestamp}>
              {getRelativeTime(finding.createdAt)}
            </Text>
          </View>
          {isReceived && !finding.isRead && (
            <View style={styles.unreadDot} />
          )}
        </View>

        {finding.message && (
          <Text style={styles.message} numberOfLines={2}>
            {finding.message}
          </Text>
        )}

        <View style={styles.cardFooter}>
          <Feather name="chevron-right" size={16} color={C.textMuted} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function SharedScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [activeTab, setActiveTab] = useState<"received" | "sent">("received");

  const findingsQuery = useQuery<SharedFindingsData>({
    queryKey: ["/api/shared-findings"],
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PUT", `/api/shared-findings/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shared-findings"] });
    },
  });

  const data = findingsQuery.data;
  const findings = activeTab === "received" ? data?.received : data?.sent;

  const handleCardPress = useCallback(
    (finding: SharedFinding) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      if (activeTab === "received" && !finding.isRead) {
        markAsReadMutation.mutate(finding.id);
      }

      router.push({
        pathname: "/provider/[id]",
        params: { id: finding.providerId },
      });
    },
    [activeTab, markAsReadMutation]
  );

  const renderFinding = useCallback(
    ({ item, index }: { item: SharedFinding; index: number }) => (
      <FindingCard
        finding={item}
        isReceived={activeTab === "received"}
        index={index}
        onPress={() => handleCardPress(item)}
      />
    ),
    [activeTab, handleCardPress]
  );

  if (findingsQuery.isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={C.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerTop}>
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              router.back();
            }}
            hitSlop={8}
          >
            <Feather name="chevron-left" size={24} color={C.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Shared Findings</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.tabsContainer}>
          <Pressable
            style={[
              styles.tab,
              activeTab === "received" && styles.tabActive,
            ]}
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.selectionAsync();
              }
              setActiveTab("received");
            }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "received" && styles.tabTextActive,
              ]}
            >
              Received
            </Text>
            {activeTab === "received" && <View style={styles.tabUnderline} />}
          </Pressable>

          <Pressable
            style={[styles.tab, activeTab === "sent" && styles.tabActive]}
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.selectionAsync();
              }
              setActiveTab("sent");
            }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "sent" && styles.tabTextActive,
              ]}
            >
              Sent
            </Text>
            {activeTab === "sent" && <View style={styles.tabUnderline} />}
          </Pressable>
        </View>
      </View>

      <FlatList
        data={findings}
        renderItem={renderFinding}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
        }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!findings && findings.length > 0}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="inbox-outline" size={44} color={C.textMuted} />
            <Text style={styles.emptyTitle}>
              {activeTab === "received"
                ? "No Findings Received"
                : "No Findings Sent"}
            </Text>
            <Text style={styles.emptyText}>
              {activeTab === "received"
                ? "Team members haven't shared any findings with you yet"
                : "You haven't shared any findings yet"}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 20,
    color: C.text,
    letterSpacing: -0.3,
  },
  tabsContainer: {
    flexDirection: "row",
    gap: 0,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    position: "relative",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: C.tint,
    marginBottom: -1,
  },
  tabText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: C.textSecondary,
  },
  tabTextActive: {
    color: C.tint,
    fontFamily: "DMSans_600SemiBold",
  },
  tabUnderline: {
    position: "absolute",
    bottom: -13,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: C.tint,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardUnread: {
    borderColor: C.tint,
    borderWidth: 1.5,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  cardHeader: {
    flex: 1,
    marginRight: 8,
  },
  providerInfo: {
    marginBottom: 6,
  },
  providerName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: C.text,
    marginBottom: 3,
  },
  username: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.textSecondary,
  },
  timestamp: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.tint,
  },
  message: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.text,
    marginTop: 4,
  },
  emptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});
