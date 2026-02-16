import React, { useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import Animated, { FadeInDown } from "react-native-reanimated";

const C = Colors.light;

interface HeatmapState {
  code: string;
  name: string;
  totalSpend: number;
  alertCount: number;
  providerCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
}

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function getRiskColor(
  criticalCount: number,
  highCount: number,
  mediumCount: number
): string {
  if (criticalCount > 0) return C.danger;
  if (highCount > 0) return C.warning;
  if (mediumCount > 0) return C.accent;
  return C.success;
}

function StateCard({
  state,
  maxAlerts,
  index,
}: {
  state: HeatmapState;
  maxAlerts: number;
  index: number;
}) {
  const riskColor = getRiskColor(
    state.criticalCount,
    state.highCount,
    state.mediumCount
  );
  const alertDensity =
    maxAlerts > 0 ? state.alertCount / maxAlerts : 0;
  const riskLabel =
    state.criticalCount > 0
      ? "CRITICAL"
      : state.highCount > 0
        ? "HIGH"
        : state.mediumCount > 0
          ? "MEDIUM"
          : "CLEAR";

  return (
    <Animated.View entering={FadeInDown.delay(100 + index * 70).duration(350)}>
      <Pressable
        style={({ pressed }) => [
          styles.stateCard,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          router.push({
            pathname: "/(tabs)/explorer",
            params: { state: state.code },
          });
        }}
      >
        <View style={[styles.cardStripe, { backgroundColor: riskColor }]} />
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.stateName}>{state.name}</Text>
              <Text style={styles.stateCode}>{state.code}</Text>
            </View>
            <View
              style={[
                styles.riskBadge,
                { backgroundColor: riskColor + "18" },
              ]}
            >
              <View
                style={[styles.riskDot, { backgroundColor: riskColor }]}
              />
              <Text style={[styles.riskText, { color: riskColor }]}>
                {riskLabel}
              </Text>
            </View>
          </View>

          <View style={styles.alertBreakdown}>
            {state.criticalCount > 0 && (
              <View style={styles.alertDot}>
                <View
                  style={[styles.dotIndicator, { backgroundColor: C.danger }]}
                />
                <Text style={styles.dotLabel}>{state.criticalCount}</Text>
              </View>
            )}
            {state.highCount > 0 && (
              <View style={styles.alertDot}>
                <View
                  style={[styles.dotIndicator, { backgroundColor: C.warning }]}
                />
                <Text style={styles.dotLabel}>{state.highCount}</Text>
              </View>
            )}
            {state.mediumCount > 0 && (
              <View style={styles.alertDot}>
                <View
                  style={[
                    styles.dotIndicator,
                    { backgroundColor: C.accent },
                  ]}
                />
                <Text style={styles.dotLabel}>{state.mediumCount}</Text>
              </View>
            )}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Spend</Text>
              <Text style={styles.statValue}>
                {formatCurrency(state.totalSpend)}
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Providers</Text>
              <Text style={styles.statValue}>{state.providerCount}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Alerts</Text>
              <Text style={[styles.statValue, { color: riskColor }]}>
                {state.alertCount}
              </Text>
            </View>
          </View>

          <View style={styles.densityContainer}>
            <View style={styles.densityTrack}>
              <View
                style={[
                  styles.densityFill,
                  {
                    width: `${alertDensity * 100}%` as unknown as number,
                    backgroundColor: riskColor,
                  },
                ]}
              />
            </View>
            <Text style={styles.densityLabel}>
              {Math.round(alertDensity * 100)}% density
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function HeatmapScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const heatmapQuery = useQuery<HeatmapState[]>({
    queryKey: ["/api/heatmap"],
  });

  const { sortedStates, totalAlerts, totalStates, maxAlerts } = useMemo(() => {
    const data = heatmapQuery.data || [];
    const sorted = [...data].sort(
      (a, b) => b.alertCount - a.alertCount
    );
    const total = sorted.reduce((sum, state) => sum + state.alertCount, 0);
    const max = sorted.length > 0 ? sorted[0].alertCount : 0;
    return {
      sortedStates: sorted,
      totalAlerts: total,
      totalStates: data.length,
      maxAlerts: max,
    };
  }, [heatmapQuery.data]);

  const handleBack = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  };

  const renderState = ({ item, index }: { item: HeatmapState; index: number }) => (
    <StateCard state={item} maxAlerts={maxAlerts} index={index} />
  );

  const ListHeader = () => (
    <View style={styles.headerSection}>
      <View style={[styles.statsCard, styles.summaryCard]}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>States</Text>
          <Text style={styles.summaryValue}>{totalStates}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Alerts</Text>
          <Text style={[styles.summaryValue, { color: C.danger }]}>
            {totalAlerts}
          </Text>
        </View>
      </View>
    </View>
  );

  const renderContent = () => {
    if (heatmapQuery.isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.tint} />
        </View>
      );
    }

    if (heatmapQuery.error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={44} color={C.danger} />
          <Text style={styles.errorTitle}>Unable to Load Data</Text>
          <Text style={styles.errorDesc}>
            {heatmapQuery.error instanceof Error
              ? heatmapQuery.error.message
              : "An error occurred"}
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={sortedStates}
        renderItem={renderState}
        keyExtractor={(item) => item.code}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
        }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={sortedStates.length > 0}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="map-outline" size={44} color={C.tint} />
            <Text style={styles.emptyTitle}>No Data Available</Text>
            <Text style={styles.emptyDesc}>
              Check back soon for heatmap data
            </Text>
          </View>
        }
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: topInset + 12 }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Fraud Heatmap</Text>
        <View style={styles.topBarSpacer} />
      </View>

      {renderContent()}
    </View>
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  topBarTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
    color: C.text,
    flex: 1,
    textAlign: "center",
  },
  topBarSpacer: {
    width: 40,
  },

  headerSection: {
    marginBottom: 20,
  },
  summaryCard: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  statsCard: {},
  summaryItem: {
    alignItems: "center",
    gap: 6,
  },
  summaryLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    color: C.text,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: C.border,
  },

  stateCard: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  cardStripe: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 14,
    gap: 12,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardHeaderLeft: {
    gap: 2,
  },
  stateName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: C.text,
  },
  stateCode: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },

  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  riskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  riskText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.5,
  },

  alertBreakdown: {
    flexDirection: "row",
    gap: 12,
  },
  alertDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dotIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dotLabel: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 10,
    color: C.text,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  statItem: {
    flex: 1,
    gap: 2,
  },
  statLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  statValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: C.text,
  },

  densityContainer: {
    gap: 6,
  },
  densityTrack: {
    height: 6,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  densityFill: {
    height: "100%",
    borderRadius: 3,
  },
  densityLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 9,
    color: C.textMuted,
    textAlign: "right",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
    gap: 12,
  },
  errorTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.text,
  },
  errorDesc: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
    gap: 12,
    minHeight: 300,
  },
  emptyTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.text,
  },
  emptyDesc: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    textAlign: "center",
  },
});
