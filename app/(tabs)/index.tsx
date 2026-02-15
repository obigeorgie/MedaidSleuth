import React, { useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
  Image,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth";

const C = Colors.light;
const { width: SCREEN_W } = Dimensions.get("window");

interface Stats {
  totalClaims: number;
  totalProviders: number;
  totalStates: number;
  totalSpend: number;
  flaggedProviders: number;
  totalAlerts: number;
}

interface FraudAlert {
  provider_id: string;
  provider_name: string;
  state_code: string;
  procedure_code: string;
  procedure_desc: string;
  month: string;
  growth_percent: number;
  monthly_total: number;
  severity: "critical" | "high" | "medium";
}

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatMonth(m: string): string {
  const d = new Date(m + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function RiskBar({ flagged, total }: { flagged: number; total: number }) {
  const ratio = total > 0 ? flagged / total : 0;
  const barWidth = useSharedValue(0);

  useEffect(() => {
    barWidth.value = withDelay(400, withTiming(ratio, { duration: 800, easing: Easing.out(Easing.cubic) }));
  }, [ratio]);

  const animBarStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%` as unknown as number,
  }));

  return (
    <View style={styles.riskBarContainer}>
      <View style={styles.riskBarTrack}>
        <Animated.View style={[styles.riskBarFill, animBarStyle]} />
      </View>
      <View style={styles.riskBarLabels}>
        <Text style={styles.riskBarText}>
          {flagged} flagged of {total} providers
        </Text>
        <Text style={[styles.riskBarText, { color: C.danger }]}>
          {(ratio * 100).toFixed(0)}% risk
        </Text>
      </View>
    </View>
  );
}

function AnimatedStatCard({
  icon,
  label,
  value,
  accentColor,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accentColor: string;
  delay: number;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 500 }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.statCard, animStyle]}>
      <View style={[styles.statAccent, { backgroundColor: accentColor }]} />
      <View style={styles.statIconRow}>
        {icon}
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

function AlertRow({ alert, index }: { alert: FraudAlert; index: number }) {
  const severityColor =
    alert.severity === "critical"
      ? C.danger
      : alert.severity === "high"
        ? C.warning
        : C.accent;
  const severityLabel =
    alert.severity === "critical"
      ? "CRIT"
      : alert.severity === "high"
        ? "HIGH"
        : "MED";

  return (
    <Animated.View entering={FadeIn.delay(200 + index * 80).duration(400)}>
      <Pressable
        style={({ pressed }) => [
          styles.alertRow,
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
        <View style={styles.alertLeft}>
          <View
            style={[styles.severityStripe, { backgroundColor: severityColor }]}
          />
          <View style={styles.alertContent}>
            <Text style={styles.alertName} numberOfLines={1}>
              {alert.provider_name}
            </Text>
            <View style={styles.alertMetaRow}>
              <View style={styles.alertMetaChip}>
                <Text style={styles.alertMetaChipText}>{alert.state_code}</Text>
              </View>
              <View style={styles.alertMetaChip}>
                <Text style={styles.alertMetaChipText}>
                  {alert.procedure_code}
                </Text>
              </View>
              <Text style={styles.alertMetaDate}>
                {formatMonth(alert.month)}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.alertRight}>
          <View
            style={[
              styles.severityBadge,
              { backgroundColor: severityColor + "18" },
            ]}
          >
            <Text style={[styles.severityBadgeText, { color: severityColor }]}>
              {severityLabel}
            </Text>
          </View>
          <View style={styles.growthContainer}>
            <Ionicons name="arrow-up" size={11} color={severityColor} />
            <Text style={[styles.growthPct, { color: severityColor }]}>
              {alert.growth_percent.toFixed(0)}%
            </Text>
          </View>
          <Text style={styles.alertAmount}>
            {formatCurrency(alert.monthly_total)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { user, logout } = useAuth();

  const statsQuery = useQuery<Stats>({ queryKey: ["/api/stats"] });
  const scanQuery = useQuery<FraudAlert[]>({ queryKey: ["/api/scan"] });

  const isLoading = statsQuery.isLoading || scanQuery.isLoading;
  const stats = statsQuery.data;
  const alerts = scanQuery.data || [];

  const refetch = () => {
    statsQuery.refetch();
    scanQuery.refetch();
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={C.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: topInset + 12,
            paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refetch}
            tintColor={C.tint}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image
              source={require("@/assets/images/logo-transparent.png")}
              style={styles.headerLogo}
              resizeMode="contain"
            />
            <Text style={styles.title}>Overview</Text>
          </View>
          <View style={styles.statusRow}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <TouchableOpacity
              onPress={logout}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="logout-button"
            >
              <Ionicons name="log-out-outline" size={22} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {stats && (
          <LinearGradient
            colors={[C.gradient2, C.gradient1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroGlowTop} />
            <Text style={styles.heroLabel}>Total Monitored Spend</Text>
            <Text style={styles.heroValue}>
              {formatCurrency(stats.totalSpend)}
            </Text>
            <View style={styles.heroMeta}>
              <View style={styles.heroMetaItem}>
                <View
                  style={[styles.heroMetaDot, { backgroundColor: C.tint }]}
                />
                <Text style={styles.heroMetaText}>
                  {stats.totalStates} States
                </Text>
              </View>
              <View style={styles.heroMetaItem}>
                <View
                  style={[styles.heroMetaDot, { backgroundColor: C.accent }]}
                />
                <Text style={styles.heroMetaText}>
                  {stats.totalClaims} Claims
                </Text>
              </View>
              <View style={styles.heroMetaItem}>
                <View
                  style={[styles.heroMetaDot, { backgroundColor: C.danger }]}
                />
                <Text style={styles.heroMetaText}>
                  {stats.totalAlerts} Alerts
                </Text>
              </View>
            </View>
            <RiskBar
              flagged={stats.flaggedProviders}
              total={stats.totalProviders}
            />
          </LinearGradient>
        )}

        {stats && (
          <View style={styles.statsGrid}>
            <AnimatedStatCard
              icon={
                <MaterialCommunityIcons
                  name="hospital-building"
                  size={18}
                  color={C.accent}
                />
              }
              label="Providers"
              value={stats.totalProviders.toString()}
              accentColor={C.accent}
              delay={100}
            />
            <AnimatedStatCard
              icon={<Ionicons name="document-text" size={18} color={C.tint} />}
              label="Claims"
              value={stats.totalClaims.toString()}
              accentColor={C.tint}
              delay={200}
            />
            <AnimatedStatCard
              icon={<Ionicons name="flag" size={18} color={C.danger} />}
              label="Flagged"
              value={stats.flaggedProviders.toString()}
              accentColor={C.danger}
              delay={300}
            />
            <AnimatedStatCard
              icon={
                <Feather name="alert-triangle" size={18} color={C.warning} />
              }
              label="Alerts"
              value={stats.totalAlerts.toString()}
              accentColor={C.warning}
              delay={400}
            />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View
              style={[styles.sectionDot, { backgroundColor: C.danger }]}
            />
            <Text style={styles.sectionTitle}>Top Anomalies</Text>
          </View>
          <Pressable
            onPress={() => router.push("/(tabs)/scanner")}
            style={styles.seeAllBtn}
          >
            <Text style={styles.seeAll}>View All</Text>
            <Feather name="arrow-right" size={14} color={C.tint} />
          </Pressable>
        </View>

        {alerts.slice(0, 5).map((alert, i) => (
          <AlertRow
            key={`${alert.provider_id}-${alert.month}-${i}`}
            alert={alert}
            index={i}
          />
        ))}

        {alerts.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={44} color={C.success} />
            <Text style={styles.emptyText}>No anomalies detected</Text>
          </View>
        )}
      </ScrollView>
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
  scroll: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  headerLogo: {
    width: 160,
    height: 28,
    marginBottom: 4,
  },
  title: {
    fontFamily: "DMSans_700Bold",
    fontSize: 30,
    color: C.text,
    letterSpacing: -0.5,
  },
  statusRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.successBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.success,
  },
  liveText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    color: C.success,
    letterSpacing: 1.2,
  },

  heroCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: "hidden",
  },
  heroGlowTop: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.tintBg2,
  },
  heroLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 40,
    color: C.text,
    letterSpacing: -1,
    marginBottom: 16,
  },
  heroMeta: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 18,
  },
  heroMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroMetaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroMetaText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.textSecondary,
  },

  riskBarContainer: {
    gap: 8,
  },
  riskBarTrack: {
    height: 6,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  riskBarFill: {
    height: "100%",
    backgroundColor: C.danger,
    borderRadius: 3,
  },
  riskBarLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  riskBarText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    minWidth: "45%" as unknown as number,
    borderRadius: 14,
    padding: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  statAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 3,
    height: "100%",
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  statIconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  statValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 24,
    color: C.text,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 17,
    color: C.text,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  seeAll: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.tint,
  },

  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingRight: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  alertLeft: {
    flexDirection: "row",
    flex: 1,
    alignItems: "center",
  },
  severityStripe: {
    width: 4,
    height: 48,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    marginRight: 14,
  },
  alertContent: {
    flex: 1,
    marginRight: 8,
  },
  alertName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: C.text,
    marginBottom: 6,
  },
  alertMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  alertMetaChip: {
    backgroundColor: C.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  alertMetaChipText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 10,
    color: C.textSecondary,
    letterSpacing: 0.3,
  },
  alertMetaDate: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    color: C.textMuted,
  },
  alertRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  severityBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  severityBadgeText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    letterSpacing: 0.8,
  },
  growthContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  growthPct: {
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
    letterSpacing: -0.3,
  },
  alertAmount: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },

  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 15,
    color: C.textSecondary,
  },
});
