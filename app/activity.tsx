import React from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import Animated, { FadeInDown } from "react-native-reanimated";

const C = Colors.light;

interface ActivityItem {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, any>;
  createdAt: string;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getActionDescription(
  action: string,
  metadata: Record<string, any>
): string {
  const name = metadata?.name || "Item";

  switch (action) {
    case "added_to_watchlist":
      return `Added ${name} to watchlist`;
    case "removed_from_watchlist":
      return `Removed ${name} from watchlist`;
    case "saved_search":
      return `Saved search for ${name}`;
    case "added_case_note":
      return `Added case note to ${name}`;
    case "shared_finding":
      return `Shared finding about ${name}`;
    case "updated_settings":
      return `Updated settings`;
    case "ran_scan":
      return `Ran anomaly scan`;
    default:
      return action;
  }
}

function getActionIcon(action: string): { icon: string; color: string } {
  switch (action) {
    case "added_to_watchlist":
      return { icon: "eye", color: C.tint };
    case "removed_from_watchlist":
      return { icon: "eye-off", color: C.tint };
    case "saved_search":
      return { icon: "search", color: C.accent };
    case "added_case_note":
      return { icon: "document-text", color: C.warning };
    case "shared_finding":
      return { icon: "share-social", color: C.success };
    case "updated_settings":
      return { icon: "settings", color: C.tint };
    case "ran_scan":
      return { icon: "shield-checkmark", color: C.danger };
    default:
      return { icon: "checkmark-circle", color: C.tint };
  }
}

function ActivityCard({
  item,
  index,
}: {
  item: ActivityItem;
  index: number;
}) {
  const { icon, color } = getActionIcon(item.action);
  const description = getActionDescription(item.action, item.metadata);
  const timeAgo = formatTimeAgo(item.createdAt);

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).duration(350).springify()}
    >
      <Pressable
        style={({ pressed }) => [
          styles.cardContainer,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        }}
      >
        <View style={styles.timelineLeft}>
          <View style={[styles.timelineDot, { backgroundColor: color }]}>
            <Ionicons name={icon as any} size={12} color={C.background} />
          </View>
          {index !== 0 && <View style={styles.timelineLine} />}
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.description}>{description}</Text>
          <Text style={styles.timeAgo}>{timeAgo}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const activityQuery = useQuery<ActivityItem[]>({
    queryKey: ["/api/activity"],
  });

  const activities = activityQuery.data || [];

  const renderActivity = ({
    item,
    index,
  }: {
    item: ActivityItem;
    index: number;
  }) => <ActivityCard item={item} index={index} />;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset }]}>
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => {
            if (Platform.OS !== "web") {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            router.back();
          }}
        >
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Activity</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={activities}
        renderItem={renderActivity}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="time" size={44} color={C.textMuted} />
            <Text style={styles.emptyTitle}>No activity yet</Text>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 24,
    color: C.text,
    letterSpacing: -0.5,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
  },
  cardContainer: {
    flexDirection: "row",
    marginBottom: 16,
  },
  timelineLeft: {
    alignItems: "center",
    marginRight: 16,
    width: 24,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  timelineLine: {
    position: "absolute",
    width: 2,
    top: 24,
    bottom: -16,
    backgroundColor: C.border,
  },
  cardContent: {
    flex: 1,
    paddingVertical: 4,
  },
  description: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: C.text,
    marginBottom: 4,
  },
  timeAgo: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.textMuted,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "DMSans_500Medium",
    fontSize: 16,
    color: C.textMuted,
  },
});
