import React, { useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import Animated, { FadeInDown } from "react-native-reanimated";

const C = Colors.light;

interface FraudAlert {
  month: string;
  growth_percent: number;
  monthly_total: number;
  severity: "critical" | "high" | "medium";
}

interface WatchlistItem {
  id: string;
  userId: string;
  providerId: string;
  providerName: string;
  stateCode: string;
  procedureCode: string;
  addedAt: string;
  isFlagged: boolean;
  alerts: FraudAlert[];
}

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function WatchlistCard({
  item,
  index,
  onDelete,
}: {
  item: WatchlistItem;
  index: number;
  onDelete: (providerId: string) => void;
}) {
  const latestAlert = item.alerts && item.alerts.length > 0 ? item.alerts[0] : null;
  const alertCount = item.alerts ? item.alerts.length : 0;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(350).springify()}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          item.isFlagged && styles.cardFlagged,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          router.push({
            pathname: "/provider/[id]",
            params: { id: item.providerId },
          });
        }}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.providerInfo}>
              <View style={styles.providerAvatarWrap}>
                <View
                  style={[
                    styles.providerAvatar,
                    item.isFlagged && styles.providerAvatarFlagged,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="hospital-building"
                    size={18}
                    color={item.isFlagged ? C.danger : C.tint}
                  />
                </View>
                {item.isFlagged && <View style={styles.flagDot} />}
              </View>

              <View style={styles.providerDetails}>
                <Text style={styles.providerName} numberOfLines={1}>
                  {item.providerName}
                </Text>
                <View style={styles.tagRow}>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{item.stateCode}</Text>
                  </View>
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>{item.procedureCode}</Text>
                  </View>
                  {item.isFlagged && (
                    <View style={styles.flagTag}>
                      <Text style={styles.flagTagText}>FLAGGED</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <Pressable
              style={styles.deleteButton}
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                onDelete(item.providerId);
              }}
              hitSlop={12}
            >
              <Ionicons name="trash" size={18} color={C.danger} />
            </Pressable>
          </View>

          {alertCount > 0 && (
            <View style={styles.alertSection}>
              <View style={styles.alertBadge}>
                <Ionicons name="warning" size={12} color={C.danger} />
                <Text style={styles.alertCount}>{alertCount}</Text>
              </View>

              {latestAlert && (
                <View style={styles.latestAlertInfo}>
                  <Text style={styles.latestAlertMonth}>
                    Latest: {new Date(latestAlert.month + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </Text>
                  <Text style={styles.latestAlertGrowth}>
                    +{latestAlert.growth_percent.toFixed(0)}% growth
                  </Text>
                </View>
              )}
            </View>
          )}

          <Text style={styles.addedDate}>Added {formatDate(item.addedAt)}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function WatchlistScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const watchlistQuery = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const res = await apiRequest("DELETE", `/api/watchlist/${providerId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
    },
  });

  const handleDelete = useCallback((providerId: string) => {
    deleteMutation.mutate(providerId);
  }, [deleteMutation]);

  const data = watchlistQuery.data || [];
  const isLoading = watchlistQuery.isLoading;

  const renderItem = useCallback(
    ({ item, index }: { item: WatchlistItem; index: number }) => (
      <WatchlistCard item={item} index={index} onDelete={handleDelete} />
    ),
    [handleDelete]
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={C.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Watchlist</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{data.length}</Text>
        </View>
      </View>

      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
        }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={data.length > 0}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="eye-outline" size={48} color={C.textMuted} />
            <Text style={styles.emptyTitle}>No providers watched yet</Text>
            <Text style={styles.emptyText}>
              Add providers from the Explorer to track them here
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
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  topBarTitle: {
    flex: 1,
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.text,
    textAlign: "center",
  },
  countBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.tint,
    justifyContent: "center",
    alignItems: "center",
  },
  countBadgeText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 13,
    color: C.textInverse,
  },

  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardFlagged: {
    borderColor: C.danger + "30",
  },
  cardContent: {
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  providerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  providerAvatarWrap: {
    position: "relative",
  },
  providerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.tintBg,
    justifyContent: "center",
    alignItems: "center",
  },
  providerAvatarFlagged: {
    backgroundColor: C.dangerBg,
  },
  flagDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.danger,
    borderWidth: 2,
    borderColor: C.surface,
  },
  providerDetails: {
    flex: 1,
  },
  providerName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: C.text,
    marginBottom: 6,
  },
  tagRow: {
    flexDirection: "row",
    gap: 5,
    flexWrap: "wrap",
  },
  tag: {
    backgroundColor: C.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 10,
    color: C.textSecondary,
    letterSpacing: 0.3,
  },
  flagTag: {
    backgroundColor: C.dangerBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  flagTagText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    color: C.danger,
    letterSpacing: 0.5,
  },
  deleteButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },

  alertSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  alertBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.dangerBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  alertCount: {
    fontFamily: "DMSans_700Bold",
    fontSize: 12,
    color: C.danger,
  },
  latestAlertInfo: {
    flex: 1,
  },
  latestAlertMonth: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.textSecondary,
  },
  latestAlertGrowth: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 11,
    color: C.danger,
  },

  addedDate: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },

  emptyState: {
    alignItems: "center",
    paddingVertical: 80,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 17,
    color: C.text,
    marginTop: 8,
  },
  emptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: C.textSecondary,
    textAlign: "center",
    maxWidth: 250,
  },
});
