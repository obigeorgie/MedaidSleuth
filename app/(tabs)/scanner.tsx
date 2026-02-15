import React, { useState, useEffect } from "react";
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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
  FadeIn,
  FadeInDown,
  cancelAnimation,
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

function PulsingRing({ delay, size }: { delay: number; size: number }) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.out(Easing.cubic) }),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(0, { duration: 2000, easing: Easing.out(Easing.cubic) }),
        -1,
        false
      )
    );

    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: C.tint,
        },
        animStyle,
      ]}
    />
  );
}

function ScanAnimation() {
  return (
    <View style={scanStyles.container}>
      <PulsingRing delay={0} size={120} />
      <PulsingRing delay={600} size={120} />
      <PulsingRing delay={1200} size={120} />
      <View style={scanStyles.centerDot}>
        <Ionicons name="shield-checkmark" size={24} color={C.tint} />
      </View>
    </View>
  );
}

function ThreatMeter({ alerts }: { alerts: FraudAlert[] }) {
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;
  const total = alerts.length;
  const threatScore = total > 0
    ? Math.min(100, (criticalCount * 40 + highCount * 25 + (total - criticalCount - highCount) * 10))
    : 0;

  const threatLabel = threatScore >= 60 ? "HIGH RISK" : threatScore >= 30 ? "MODERATE" : "LOW";
  const threatColor = threatScore >= 60 ? C.danger : threatScore >= 30 ? C.warning : C.success;

  const barWidth = useSharedValue(0);

  useEffect(() => {
    barWidth.value = withDelay(
      200,
      withTiming(threatScore / 100, { duration: 1000, easing: Easing.out(Easing.cubic) })
    );
  }, [threatScore]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%` as unknown as number,
  }));

  return (
    <Animated.View entering={FadeIn.duration(400)} style={scanStyles.meterContainer}>
      <View style={scanStyles.meterHeader}>
        <Text style={scanStyles.meterTitle}>Threat Assessment</Text>
        <View style={[scanStyles.meterBadge, { backgroundColor: threatColor + "18" }]}>
          <Text style={[scanStyles.meterBadgeText, { color: threatColor }]}>
            {threatLabel}
          </Text>
        </View>
      </View>
      <View style={scanStyles.meterBarTrack}>
        <Animated.View
          style={[
            scanStyles.meterBarFill,
            barStyle,
            { backgroundColor: threatColor },
          ]}
        />
      </View>
      <View style={scanStyles.meterStats}>
        <View style={scanStyles.meterStat}>
          <View style={[scanStyles.meterStatDot, { backgroundColor: C.danger }]} />
          <Text style={scanStyles.meterStatText}>{criticalCount} Critical</Text>
        </View>
        <View style={scanStyles.meterStat}>
          <View style={[scanStyles.meterStatDot, { backgroundColor: C.warning }]} />
          <Text style={scanStyles.meterStatText}>{highCount} High</Text>
        </View>
        <View style={scanStyles.meterStat}>
          <View style={[scanStyles.meterStatDot, { backgroundColor: C.accent }]} />
          <Text style={scanStyles.meterStatText}>
            {total - criticalCount - highCount} Medium
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function AlertCard({ alert, index }: { alert: FraudAlert; index: number }) {
  const severityColor =
    alert.severity === "critical"
      ? C.danger
      : alert.severity === "high"
        ? C.warning
        : C.accent;

  const severityLabel =
    alert.severity === "critical"
      ? "CRITICAL"
      : alert.severity === "high"
        ? "HIGH"
        : "MEDIUM";

  return (
    <Animated.View entering={FadeInDown.delay(100 + index * 70).duration(350)}>
      <Pressable
        style={({ pressed }) => [
          styles.alertCard,
          pressed && { opacity: 0.7 },
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
        <View style={[styles.alertStripe, { backgroundColor: severityColor }]} />
        <View style={styles.alertBody}>
          <View style={styles.alertHeader}>
            <View style={styles.alertHeaderLeft}>
              <Text style={styles.alertName} numberOfLines={1}>
                {alert.provider_name}
              </Text>
              <Text style={styles.alertProcedure} numberOfLines={1}>
                {alert.procedure_desc}
              </Text>
            </View>
            <View
              style={[
                styles.severityBadge,
                { backgroundColor: severityColor + "18" },
              ]}
            >
              <Text style={[styles.severityText, { color: severityColor }]}>
                {severityLabel}
              </Text>
            </View>
          </View>

          <View style={styles.alertDataRow}>
            <View style={styles.alertDataItem}>
              <Text style={styles.alertDataLabel}>Location</Text>
              <Text style={styles.alertDataValue}>{alert.state_name}</Text>
            </View>
            <View style={styles.alertDataItem}>
              <Text style={styles.alertDataLabel}>Period</Text>
              <Text style={styles.alertDataValue}>
                {formatMonth(alert.month)}
              </Text>
            </View>
            <View style={styles.alertDataItem}>
              <Text style={styles.alertDataLabel}>Billed</Text>
              <Text style={[styles.alertDataValue, { color: severityColor }]}>
                {formatCurrency(alert.monthly_total)}
              </Text>
            </View>
            <View style={styles.alertDataItem}>
              <Text style={styles.alertDataLabel}>Growth</Text>
              <View style={styles.alertGrowthRow}>
                <Ionicons name="arrow-up" size={11} color={severityColor} />
                <Text
                  style={[styles.alertDataValue, { color: severityColor }]}
                >
                  {alert.growth_percent.toFixed(0)}%
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.alertCompare}>
            <Text style={styles.alertCompareText}>
              Previous: {formatCurrency(alert.prev_month_total)}
            </Text>
            <Ionicons name="arrow-forward" size={12} color={C.textMuted} />
            <Text style={[styles.alertCompareText, { color: severityColor }]}>
              Current: {formatCurrency(alert.monthly_total)}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function ScanButton({
  onPress,
  scanning,
}: {
  onPress: () => void;
  scanning: boolean;
}) {
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
      <Animated.View style={animStyle}>
        <LinearGradient
          colors={[C.tint, C.tintDim]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.scanButton}
        >
          {scanning ? (
            <ActivityIndicator size="small" color={C.textInverse} />
          ) : (
            <Ionicons
              name="shield-checkmark"
              size={20}
              color={C.textInverse}
            />
          )}
          <Text style={styles.scanButtonText}>
            {scanning ? "Scanning..." : "Run Anomaly Scan"}
          </Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

function SeverityFilter({
  filter,
  setFilter,
  alerts,
}: {
  filter: string | null;
  setFilter: (f: string | null) => void;
  alerts: FraudAlert[];
}) {
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const highCount = alerts.filter((a) => a.severity === "high").length;
  const mediumCount = alerts.filter((a) => a.severity === "medium").length;

  const items: { key: string | null; label: string; count: number; color: string }[] = [
    { key: null, label: "All", count: alerts.length, color: C.tint },
    { key: "critical", label: "Critical", count: criticalCount, color: C.danger },
    { key: "high", label: "High", count: highCount, color: C.warning },
    { key: "medium", label: "Medium", count: mediumCount, color: C.accent },
  ];

  return (
    <View style={styles.filterRow}>
      {items.map((item) => (
        <Pressable
          key={item.key ?? "all"}
          style={[
            styles.filterItem,
            filter === item.key && styles.filterItemActive,
            filter === item.key && { borderColor: item.color + "40" },
          ]}
          onPress={() => setFilter(filter === item.key ? null : item.key)}
        >
          <Text
            style={[
              styles.filterCount,
              { color: filter === item.key ? item.color : C.text },
            ]}
          >
            {item.count}
          </Text>
          <Text style={styles.filterLabel}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [hasScanned, setHasScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);

  const scanQuery = useQuery<FraudAlert[]>({
    queryKey: ["/api/scan"],
    enabled: hasScanned,
  });

  const alerts = scanQuery.data || [];
  const filteredAlerts = filterSeverity
    ? alerts.filter((a) => a.severity === filterSeverity)
    : alerts;

  const handleScan = async () => {
    setScanning(true);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    await new Promise((r) => setTimeout(r, 1800));
    setHasScanned(true);
    await scanQuery.refetch();
    setScanning(false);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const renderAlert = ({ item, index }: { item: FraudAlert; index: number }) => (
    <AlertCard alert={item} index={index} />
  );

  const ListHeader = () => (
    <>
      {hasScanned && !scanning && alerts.length > 0 && (
        <>
          <ThreatMeter alerts={alerts} />
          <SeverityFilter
            filter={filterSeverity}
            setFilter={setFilterSeverity}
            alerts={alerts}
          />
        </>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.headerArea, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerLabel}>Fraud Detection</Text>
            <Text style={styles.headerTitle}>Anomaly Scanner</Text>
          </View>
          {hasScanned && !scanning && alerts.length > 0 && (
            <View style={styles.alertCountBadge}>
              <Text style={styles.alertCountText}>{alerts.length}</Text>
            </View>
          )}
        </View>
        <Text style={styles.headerDesc}>
          Detects billing spikes exceeding 200% month-over-month growth across
          all monitored providers.
        </Text>
        <ScanButton onPress={handleScan} scanning={scanning} />
      </View>

      {!hasScanned && !scanning && (
        <View style={styles.emptyState}>
          <ScanAnimation />
          <Text style={styles.emptyTitle}>Ready to Scan</Text>
          <Text style={styles.emptyDesc}>
            Tap the button above to analyze provider billing data for suspicious
            activity patterns.
          </Text>
        </View>
      )}

      {scanning && (
        <View style={styles.emptyState}>
          <ScanAnimation />
          <Text style={styles.emptyTitle}>Analyzing Patterns</Text>
          <Text style={styles.emptyDesc}>
            Cross-referencing billing data across all providers and procedure
            codes...
          </Text>
        </View>
      )}

      {hasScanned && !scanning && (
        <FlatList
          data={filteredAlerts}
          renderItem={renderAlert}
          keyExtractor={(item, i) => `${item.provider_id}-${item.month}-${i}`}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={44} color={C.success} />
              <Text style={styles.emptyTitle}>No Anomalies</Text>
              <Text style={styles.emptyDesc}>
                No anomalies match this severity filter.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const scanStyles = StyleSheet.create({
  container: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  centerDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.tintBg2,
    justifyContent: "center",
    alignItems: "center",
  },
  meterContainer: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  meterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  meterTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: C.text,
  },
  meterBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  meterBadgeText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 10,
    letterSpacing: 1,
  },
  meterBarTrack: {
    height: 8,
    backgroundColor: C.border,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 14,
  },
  meterBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  meterStats: {
    flexDirection: "row",
    gap: 16,
  },
  meterStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  meterStatDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  meterStatText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.textSecondary,
  },
});

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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLabel: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: C.danger,
    textTransform: "uppercase" as const,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
    color: C.text,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  alertCountBadge: {
    backgroundColor: C.dangerBg,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
  },
  alertCountText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 15,
    color: C.danger,
  },
  headerDesc: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 19,
    marginBottom: 16,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
  },
  scanButtonText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 15,
    color: C.textInverse,
  },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  filterItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterItemActive: {
    backgroundColor: C.surfaceElevated,
  },
  filterCount: {
    fontFamily: "DMSans_700Bold",
    fontSize: 17,
    color: C.text,
  },
  filterLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  alertCard: {
    flexDirection: "row",
    backgroundColor: C.surface,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  alertStripe: {
    width: 4,
  },
  alertBody: {
    flex: 1,
    padding: 16,
  },
  alertHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  alertHeaderLeft: {
    flex: 1,
    marginRight: 10,
  },
  alertName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: C.text,
    marginBottom: 3,
  },
  alertProcedure: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  severityText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  alertDataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  alertDataItem: {
    gap: 3,
  },
  alertDataLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  alertDataValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
    color: C.text,
  },
  alertGrowthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  alertCompare: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.background,
    padding: 10,
    borderRadius: 8,
  },
  alertCompareText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
    paddingHorizontal: 40,
    gap: 8,
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
