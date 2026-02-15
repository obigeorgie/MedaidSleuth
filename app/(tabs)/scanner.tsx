import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Platform,
  FlatList,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const C = Colors.light;

interface FraudAlert {
  provider_id: string;
  provider_name: string;
  state_code: string;
  state_name: string;
  procedure_code: string;
  procedure_desc: string;
  month: string;
  monthly_total: number;
  prev_month_total: number;
  growth_percent: number;
  severity: "critical" | "high" | "medium";
}

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatMonth(m: string): string {
  const d = new Date(m + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function SeverityBadge({ severity }: { severity: string }) {
  const config = {
    critical: { bg: C.dangerBg, color: C.danger, label: "CRITICAL" },
    high: { bg: C.warningBg, color: C.warning, label: "HIGH" },
    medium: { bg: "rgba(59,130,246,0.12)", color: C.accent, label: "MEDIUM" },
  }[severity] || { bg: C.successBg, color: C.success, label: "LOW" };

  return (
    <View style={[styles.severityBadge, { backgroundColor: config.bg }]}>
      <Text style={[styles.severityText, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
}

function AlertCard({ alert }: { alert: FraudAlert }) {
  const severityColor =
    alert.severity === "critical"
      ? C.danger
      : alert.severity === "high"
        ? C.warning
        : C.accent;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.alertCard,
        { opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={() => {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        router.push({
          pathname: "/provider/[id]",
          params: { id: alert.provider_id },
        });
      }}
    >
      <View style={styles.alertCardHeader}>
        <View
          style={[styles.alertIndicator, { backgroundColor: severityColor }]}
        />
        <View style={styles.alertCardInfo}>
          <Text style={styles.alertCardName} numberOfLines={1}>
            {alert.provider_name}
          </Text>
          <View style={styles.alertCardMeta}>
            <Text style={styles.alertCardMetaText}>
              {alert.state_name}
            </Text>
            <Text style={styles.alertCardDot}>|</Text>
            <Text style={styles.alertCardMetaText}>
              {alert.procedure_desc}
            </Text>
          </View>
        </View>
        <SeverityBadge severity={alert.severity} />
      </View>

      <View style={styles.alertCardBody}>
        <View style={styles.alertStat}>
          <Text style={styles.alertStatLabel}>Month</Text>
          <Text style={styles.alertStatValue}>{formatMonth(alert.month)}</Text>
        </View>
        <View style={styles.alertStat}>
          <Text style={styles.alertStatLabel}>Previous</Text>
          <Text style={styles.alertStatValue}>
            {formatCurrency(alert.prev_month_total)}
          </Text>
        </View>
        <View style={styles.alertStat}>
          <Text style={styles.alertStatLabel}>Current</Text>
          <Text style={[styles.alertStatValue, { color: severityColor }]}>
            {formatCurrency(alert.monthly_total)}
          </Text>
        </View>
        <View style={styles.alertStat}>
          <Text style={styles.alertStatLabel}>Growth</Text>
          <View style={styles.growthRow}>
            <Ionicons name="trending-up" size={13} color={severityColor} />
            <Text style={[styles.alertStatValue, { color: severityColor }]}>
              {alert.growth_percent.toFixed(0)}%
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ScanButton({ onPress, scanning }: { onPress: () => void; scanning: boolean }) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1, { damping: 10, stiffness: 200 })
    );
    onPress();
  };

  return (
    <Pressable onPress={handlePress} disabled={scanning}>
      <Animated.View style={[styles.scanButton, animStyle]}>
        {scanning ? (
          <ActivityIndicator size="small" color={C.background} />
        ) : (
          <Ionicons name="shield-checkmark" size={20} color={C.background} />
        )}
        <Text style={styles.scanButtonText}>
          {scanning ? "Scanning..." : "Run Anomaly Scan"}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [hasScanned, setHasScanned] = useState(false);
  const [scanning, setScanning] = useState(false);

  const scanQuery = useQuery<FraudAlert[]>({
    queryKey: ["/api/scan"],
    enabled: hasScanned,
  });

  const alerts = scanQuery.data || [];
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;
  const mediumCount = alerts.filter((a) => a.severity === "medium").length;

  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);

  const filteredAlerts = filterSeverity
    ? alerts.filter((a) => a.severity === filterSeverity)
    : alerts;

  const handleScan = async () => {
    setScanning(true);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    await new Promise((r) => setTimeout(r, 1200));
    setHasScanned(true);
    await scanQuery.refetch();
    setScanning(false);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const renderAlert = ({ item }: { item: FraudAlert }) => (
    <AlertCard alert={item} />
  );

  return (
    <View style={styles.container}>
      <View style={[styles.headerArea, { paddingTop: topInset + 16 }]}>
        <Text style={styles.headerLabel}>Fraud Detection</Text>
        <Text style={styles.headerTitle}>Anomaly Scanner</Text>
        <Text style={styles.headerDesc}>
          Detects month-over-month billing spikes exceeding 200% growth
          thresholds across all monitored providers.
        </Text>
        <ScanButton onPress={handleScan} scanning={scanning} />
      </View>

      {hasScanned && !scanning && alerts.length > 0 && (
        <View style={styles.summaryBar}>
          <Pressable
            style={[
              styles.summaryItem,
              filterSeverity === null && styles.summaryItemActive,
            ]}
            onPress={() => setFilterSeverity(null)}
          >
            <Text
              style={[
                styles.summaryCount,
                filterSeverity === null && { color: C.tint },
              ]}
            >
              {alerts.length}
            </Text>
            <Text style={styles.summaryLabel}>All</Text>
          </Pressable>
          <Pressable
            style={[
              styles.summaryItem,
              filterSeverity === "critical" && styles.summaryItemActive,
            ]}
            onPress={() =>
              setFilterSeverity(filterSeverity === "critical" ? null : "critical")
            }
          >
            <Text
              style={[
                styles.summaryCount,
                { color: C.danger },
              ]}
            >
              {criticalCount}
            </Text>
            <Text style={styles.summaryLabel}>Critical</Text>
          </Pressable>
          <Pressable
            style={[
              styles.summaryItem,
              filterSeverity === "high" && styles.summaryItemActive,
            ]}
            onPress={() =>
              setFilterSeverity(filterSeverity === "high" ? null : "high")
            }
          >
            <Text
              style={[
                styles.summaryCount,
                { color: C.warning },
              ]}
            >
              {highCount}
            </Text>
            <Text style={styles.summaryLabel}>High</Text>
          </Pressable>
          <Pressable
            style={[
              styles.summaryItem,
              filterSeverity === "medium" && styles.summaryItemActive,
            ]}
            onPress={() =>
              setFilterSeverity(filterSeverity === "medium" ? null : "medium")
            }
          >
            <Text
              style={[
                styles.summaryCount,
                { color: C.accent },
              ]}
            >
              {mediumCount}
            </Text>
            <Text style={styles.summaryLabel}>Medium</Text>
          </Pressable>
        </View>
      )}

      {!hasScanned && !scanning && (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="shield-search"
            size={56}
            color={C.textMuted}
          />
          <Text style={styles.emptyTitle}>Ready to Scan</Text>
          <Text style={styles.emptyDesc}>
            Tap the button above to analyze all provider billing data for
            suspicious activity patterns.
          </Text>
        </View>
      )}

      {scanning && (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={C.tint} />
          <Text style={styles.emptyTitle}>Analyzing Patterns</Text>
          <Text style={styles.emptyDesc}>
            Cross-referencing billing data across providers and procedure
            codes...
          </Text>
        </View>
      )}

      {hasScanned && !scanning && (
        <FlatList
          data={filteredAlerts}
          renderItem={renderAlert}
          keyExtractor={(item, i) =>
            `${item.provider_id}-${item.month}-${i}`
          }
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="checkmark-circle"
                size={40}
                color={C.success}
              />
              <Text style={styles.emptyTitle}>No Anomalies</Text>
              <Text style={styles.emptyDesc}>
                No billing anomalies match this filter.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  headerArea: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.danger,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
    color: C.text,
    marginBottom: 8,
  },
  headerDesc: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 19,
    marginBottom: 18,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.tint,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  scanButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: C.background,
  },
  summaryBar: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  summaryItemActive: {
    borderColor: C.tint,
  },
  summaryCount: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
    color: C.text,
  },
  summaryLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  alertCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  alertCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  alertIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: 12,
  },
  alertCardInfo: {
    flex: 1,
    marginRight: 8,
  },
  alertCardName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: C.text,
    marginBottom: 3,
  },
  alertCardMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  alertCardMetaText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },
  alertCardDot: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
    marginHorizontal: 6,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  severityText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  alertCardBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  alertStat: {
    alignItems: "center",
  },
  alertStatLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    color: C.textMuted,
    marginBottom: 3,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  alertStatValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: C.text,
  },
  growthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 18,
    color: C.text,
  },
  emptyDesc: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
