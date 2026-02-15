import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";

const C = Colors.light;

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

function StatCard({
  icon,
  iconColor,
  label,
  value,
  bgColor,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value: string;
  bgColor: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: bgColor }]}>
      <View style={styles.statIconWrap}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AlertRow({ alert }: { alert: FraudAlert }) {
  const severityColor =
    alert.severity === "critical"
      ? C.danger
      : alert.severity === "high"
        ? C.warning
        : C.accent;
  const severityBg =
    alert.severity === "critical"
      ? C.dangerBg
      : alert.severity === "high"
        ? C.warningBg
        : C.successBg;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.alertRow,
        { opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={() =>
        router.push({
          pathname: "/provider/[id]",
          params: { id: alert.provider_id },
        })
      }
    >
      <View style={[styles.severityDot, { backgroundColor: severityColor }]} />
      <View style={styles.alertContent}>
        <Text style={styles.alertName} numberOfLines={1}>
          {alert.provider_name}
        </Text>
        <Text style={styles.alertMeta}>
          {alert.state_code} | {alert.procedure_code} | {formatMonth(alert.month)}
        </Text>
      </View>
      <View style={styles.alertRight}>
        <View style={[styles.growthBadge, { backgroundColor: severityBg }]}>
          <Ionicons name="trending-up" size={12} color={severityColor} />
          <Text style={[styles.growthText, { color: severityColor }]}>
            +{alert.growth_percent.toFixed(0)}%
          </Text>
        </View>
        <Text style={styles.alertAmount}>
          {formatCurrency(alert.monthly_total)}
        </Text>
      </View>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const statsQuery = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const scanQuery = useQuery<FraudAlert[]>({
    queryKey: ["/api/scan"],
  });

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
          { paddingTop: topInset + 16, paddingBottom: Platform.OS === "web" ? 84 + 34 : 100 },
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
          <View>
            <Text style={styles.greeting}>Medicaid Intelligence</Text>
            <Text style={styles.title}>Dashboard</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {stats && (
          <LinearGradient
            colors={["rgba(0,212,170,0.08)", "rgba(59,130,246,0.06)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.spendBanner}
          >
            <Text style={styles.spendLabel}>Total Monitored Spend</Text>
            <Text style={styles.spendValue}>
              {formatCurrency(stats.totalSpend)}
            </Text>
            <Text style={styles.spendSub}>
              Across {stats.totalStates} states, {stats.totalClaims} claims
            </Text>
          </LinearGradient>
        )}

        {stats && (
          <View style={styles.statsGrid}>
            <StatCard
              icon={
                <MaterialCommunityIcons
                  name="hospital-building"
                  size={20}
                  color={C.accent}
                />
              }
              iconColor={C.accent}
              label="Providers"
              value={stats.totalProviders.toString()}
              bgColor={C.surface}
            />
            <StatCard
              icon={
                <Ionicons name="shield-checkmark" size={20} color={C.tint} />
              }
              iconColor={C.tint}
              label="Monitored"
              value={stats.totalClaims.toString()}
              bgColor={C.surface}
            />
            <StatCard
              icon={
                <Ionicons name="warning" size={20} color={C.danger} />
              }
              iconColor={C.danger}
              label="Flagged"
              value={stats.flaggedProviders.toString()}
              bgColor={C.surface}
            />
            <StatCard
              icon={
                <Feather name="alert-triangle" size={20} color={C.warning} />
              }
              iconColor={C.warning}
              label="Alerts"
              value={stats.totalAlerts.toString()}
              bgColor={C.surface}
            />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Anomalies</Text>
          <Pressable onPress={() => router.push("/(tabs)/scanner")}>
            <Text style={styles.seeAll}>See All</Text>
          </Pressable>
        </View>

        {alerts.slice(0, 5).map((alert, i) => (
          <AlertRow key={`${alert.provider_id}-${alert.month}-${i}`} alert={alert} />
        ))}

        {alerts.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={40} color={C.success} />
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
    marginBottom: 24,
  },
  greeting: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.tint,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
    color: C.text,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.successBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
    marginTop: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.success,
  },
  liveText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 10,
    color: C.success,
    letterSpacing: 1,
  },
  spendBanner: {
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  spendLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.textSecondary,
    marginBottom: 6,
  },
  spendValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 36,
    color: C.text,
    marginBottom: 4,
  },
  spendSub: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textMuted,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    minWidth: "45%" as unknown as number,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  statIconWrap: {
    marginBottom: 12,
  },
  statValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    color: C.text,
    marginBottom: 2,
  },
  statLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.textSecondary,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 18,
    color: C.text,
  },
  seeAll: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.tint,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  severityDot: {
    width: 4,
    height: 36,
    borderRadius: 2,
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
    marginRight: 8,
  },
  alertName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: C.text,
    marginBottom: 3,
  },
  alertMeta: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },
  alertRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  growthBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  growthText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 11,
  },
  alertAmount: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.textSecondary,
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
