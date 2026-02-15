import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

const C = Colors.light;

interface MonthlyTotal {
  month: string;
  total: number;
}

interface GrowthData {
  month: string;
  growth: number;
}

interface FraudAlert {
  provider_id: string;
  provider_name: string;
  month: string;
  growth_percent: number;
  monthly_total: number;
  severity: "critical" | "high" | "medium";
}

interface ProviderDetail {
  id: string;
  name: string;
  state_code: string;
  state_name: string;
  procedure_code: string;
  procedure_desc: string;
  totalSpend: number;
  claimCount: number;
  monthlyTotals: MonthlyTotal[];
  growthData: GrowthData[];
  fraudAlerts: FraudAlert[];
  isFlagged: boolean;
}

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function formatMonth(m: string): string {
  const d = new Date(m + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short" });
}

function formatMonthFull(m: string): string {
  const d = new Date(m + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function MiniBarChart({ data }: { data: MonthlyTotal[] }) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d.total));

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.bars}>
        {data.map((d, i) => {
          const height = maxVal > 0 ? (d.total / maxVal) * 120 : 0;
          const isAnomaly = i > 0 && data[i - 1].total > 0
            ? ((d.total - data[i - 1].total) / data[i - 1].total) > 2
            : false;

          return (
            <View key={d.month} style={chartStyles.barCol}>
              <View
                style={[
                  chartStyles.bar,
                  {
                    height,
                    backgroundColor: isAnomaly ? C.danger : C.tint,
                    opacity: isAnomaly ? 1 : 0.7,
                  },
                ]}
              />
              <Text style={chartStyles.barLabel}>{formatMonth(d.month)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function GrowthTimeline({ data }: { data: GrowthData[] }) {
  return (
    <View style={timelineStyles.container}>
      {data.map((d, i) => {
        const isAnomaly = d.growth > 200;
        const color = isAnomaly
          ? d.growth > 1000
            ? C.danger
            : d.growth > 500
              ? C.warning
              : C.accent
          : C.success;

        return (
          <View key={d.month} style={timelineStyles.row}>
            <View style={timelineStyles.left}>
              <View
                style={[timelineStyles.dot, { backgroundColor: color }]}
              />
              {i < data.length - 1 && (
                <View style={timelineStyles.line} />
              )}
            </View>
            <View style={timelineStyles.content}>
              <Text style={timelineStyles.month}>
                {formatMonthFull(d.month)}
              </Text>
              <View style={timelineStyles.growthWrap}>
                <Ionicons
                  name={d.growth >= 0 ? "trending-up" : "trending-down"}
                  size={14}
                  color={color}
                />
                <Text style={[timelineStyles.growthVal, { color }]}>
                  {d.growth >= 0 ? "+" : ""}
                  {d.growth.toFixed(1)}%
                </Text>
                {isAnomaly && (
                  <View
                    style={[
                      timelineStyles.flagBadge,
                      { backgroundColor: color + "20" },
                    ]}
                  >
                    <Text style={[timelineStyles.flagText, { color }]}>
                      ANOMALY
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function ProviderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const providerQuery = useQuery<ProviderDetail>({
    queryKey: ["/api/providers", id],
  });

  const provider = providerQuery.data;
  const isLoading = providerQuery.isLoading;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={C.tint} />
      </View>
    );
  }

  if (!provider) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="alert-circle" size={40} color={C.danger} />
        <Text style={styles.errorText}>Provider not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </Pressable>
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
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </Pressable>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          Provider Details
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileSection}>
          <View style={styles.profileIcon}>
            <MaterialCommunityIcons
              name="hospital-building"
              size={28}
              color={C.tint}
            />
          </View>
          <Text style={styles.providerName}>{provider.name}</Text>
          <Text style={styles.providerId}>{provider.id}</Text>

          {provider.isFlagged && (
            <View style={styles.flaggedBanner}>
              <Ionicons name="warning" size={16} color={C.danger} />
              <Text style={styles.flaggedText}>
                Flagged for anomalous billing
              </Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons
                name="location-outline"
                size={14}
                color={C.textMuted}
              />
              <Text style={styles.infoText}>{provider.state_name}</Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="medkit-outline" size={14} color={C.textMuted} />
              <Text style={styles.infoText}>
                {provider.procedure_code} - {provider.procedure_desc}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>Total Spend</Text>
            <Text style={styles.statBoxValue}>
              {formatCurrency(provider.totalSpend)}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>Total Claims</Text>
            <Text style={styles.statBoxValue}>{provider.claimCount}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>Alerts</Text>
            <Text
              style={[
                styles.statBoxValue,
                provider.fraudAlerts.length > 0 && { color: C.danger },
              ]}
            >
              {provider.fraudAlerts.length}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly Spending</Text>
          <View style={styles.chartCard}>
            <MiniBarChart data={provider.monthlyTotals} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Growth Timeline</Text>
          {provider.growthData.length > 0 ? (
            <GrowthTimeline data={provider.growthData} />
          ) : (
            <Text style={styles.noData}>No growth data available</Text>
          )}
        </View>

        {provider.fraudAlerts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: C.danger }]}>
              Fraud Alerts
            </Text>
            {provider.fraudAlerts.map((alert, i) => (
              <View key={i} style={styles.fraudAlertCard}>
                <View style={styles.fraudAlertRow}>
                  <Ionicons name="warning" size={16} color={C.danger} />
                  <Text style={styles.fraudAlertMonth}>
                    {formatMonthFull(alert.month)}
                  </Text>
                </View>
                <Text style={styles.fraudAlertGrowth}>
                  +{alert.growth_percent.toFixed(0)}% growth to{" "}
                  {formatCurrency(alert.monthly_total)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
          {provider.monthlyTotals.map((m) => (
            <View key={m.month} style={styles.breakdownRow}>
              <Text style={styles.breakdownMonth}>
                {formatMonthFull(m.month)}
              </Text>
              <Text style={styles.breakdownAmount}>
                {formatCurrency(m.total)}
              </Text>
            </View>
          ))}
        </View>
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
    gap: 12,
  },
  errorText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 16,
    color: C.textSecondary,
  },
  backLink: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: C.tint,
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
    width: 32,
    height: 32,
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
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  profileSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  profileIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  providerName: {
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    color: C.text,
    textAlign: "center",
    marginBottom: 4,
  },
  providerId: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textMuted,
    marginBottom: 12,
  },
  flaggedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.dangerBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 14,
  },
  flaggedText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.danger,
  },
  infoRow: {
    gap: 8,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },
  statBox: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  statBoxLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statBoxValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
    color: C.text,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.text,
    marginBottom: 14,
  },
  chartCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  noData: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textMuted,
    textAlign: "center",
    paddingVertical: 20,
  },
  fraudAlertCard: {
    backgroundColor: C.dangerBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
  },
  fraudAlertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  fraudAlertMonth: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: C.danger,
  },
  fraudAlertGrowth: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.dangerLight,
    marginLeft: 22,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  breakdownMonth: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: C.textSecondary,
  },
  breakdownAmount: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: C.text,
  },
});

const chartStyles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 140,
    gap: 4,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "70%",
    borderRadius: 4,
    minHeight: 3,
  },
  barLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 9,
    color: C.textMuted,
    marginTop: 6,
  },
});

const timelineStyles = StyleSheet.create({
  container: {
    paddingLeft: 4,
  },
  row: {
    flexDirection: "row",
    minHeight: 52,
  },
  left: {
    width: 20,
    alignItems: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: C.border,
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 16,
  },
  month: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.text,
    marginBottom: 4,
  },
  growthWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  growthVal: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
  },
  flagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  flagText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 8,
    letterSpacing: 0.5,
  },
});
