import React, { useEffect } from "react";
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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";

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

function AnimatedBar({
  height,
  color,
  label,
  amount,
  index,
  maxHeight,
}: {
  height: number;
  color: string;
  label: string;
  amount: string;
  index: number;
  maxHeight: number;
}) {
  const animHeight = useSharedValue(0);

  useEffect(() => {
    animHeight.value = withDelay(
      index * 50,
      withTiming(height, { duration: 600, easing: Easing.out(Easing.cubic) })
    );
  }, [height]);

  const barStyle = useAnimatedStyle(() => ({
    height: animHeight.value,
  }));

  return (
    <View style={chartStyles.barCol}>
      <Text style={chartStyles.barAmount}>{amount}</Text>
      <Animated.View style={[chartStyles.bar, barStyle, { backgroundColor: color }]} />
      <Text style={chartStyles.barLabel}>{label}</Text>
    </View>
  );
}

function SpendChart({ data }: { data: MonthlyTotal[] }) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d.total));
  const chartHeight = 130;

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.gridLines}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={chartStyles.gridLine} />
        ))}
      </View>
      <View style={chartStyles.bars}>
        {data.map((d, i) => {
          const h = maxVal > 0 ? (d.total / maxVal) * chartHeight : 0;
          const prevTotal = i > 0 ? data[i - 1].total : d.total;
          const isAnomaly =
            i > 0 && prevTotal > 0 ? (d.total - prevTotal) / prevTotal > 2 : false;
          return (
            <AnimatedBar
              key={d.month}
              height={h}
              color={isAnomaly ? C.danger : C.tint}
              label={formatMonth(d.month)}
              amount={formatCurrency(d.total)}
              index={i}
              maxHeight={chartHeight}
            />
          );
        })}
      </View>
    </View>
  );
}

function GrowthItem({ data, index, isLast }: { data: GrowthData; index: number; isLast: boolean }) {
  const isAnomaly = data.growth > 200;
  const color = isAnomaly
    ? data.growth > 1000
      ? C.danger
      : data.growth > 500
        ? C.warning
        : C.accent
    : C.success;

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
      <View style={timelineStyles.row}>
        <View style={timelineStyles.left}>
          <View style={[timelineStyles.dot, { backgroundColor: color }]} />
          {!isLast && <View style={timelineStyles.line} />}
        </View>
        <View style={timelineStyles.content}>
          <View style={timelineStyles.contentHeader}>
            <Text style={timelineStyles.month}>
              {formatMonthFull(data.month)}
            </Text>
            {isAnomaly && (
              <View
                style={[timelineStyles.flagBadge, { backgroundColor: color + "18" }]}
              >
                <Ionicons name="warning" size={10} color={color} />
                <Text style={[timelineStyles.flagText, { color }]}>
                  ANOMALY
                </Text>
              </View>
            )}
          </View>
          <View style={timelineStyles.growthWrap}>
            <Ionicons
              name={data.growth >= 0 ? "trending-up" : "trending-down"}
              size={14}
              color={color}
            />
            <Text style={[timelineStyles.growthVal, { color }]}>
              {data.growth >= 0 ? "+" : ""}
              {data.growth.toFixed(1)}%
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
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
        <Ionicons name="alert-circle" size={44} color={C.danger} />
        <Text style={styles.errorText}>Provider not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const avgSpend =
    provider.monthlyTotals.length > 0
      ? provider.totalSpend / provider.monthlyTotals.length
      : 0;

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
        <Text style={styles.topBarTitle} numberOfLines={1}>
          Provider Details
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)}>
          <LinearGradient
            colors={[C.gradient2, C.gradient1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.profileCard}
          >
            {provider.isFlagged && (
              <View style={styles.flaggedCorner}>
                <Ionicons name="warning" size={12} color={C.danger} />
              </View>
            )}

            <View style={styles.profileAvatar}>
              <MaterialCommunityIcons
                name="hospital-building"
                size={26}
                color={provider.isFlagged ? C.danger : C.tint}
              />
            </View>

            <Text style={styles.providerName}>{provider.name}</Text>

            <View style={styles.providerIdRow}>
              <Text style={styles.providerId}>{provider.id}</Text>
              {provider.isFlagged && (
                <View style={styles.flaggedPill}>
                  <Ionicons name="warning" size={10} color={C.danger} />
                  <Text style={styles.flaggedPillText}>FLAGGED</Text>
                </View>
              )}
            </View>

            <View style={styles.providerInfoChips}>
              <View style={styles.infoChip}>
                <Ionicons name="location" size={12} color={C.tint} />
                <Text style={styles.infoChipText}>{provider.state_name}</Text>
              </View>
              <View style={styles.infoChip}>
                <Ionicons name="medkit" size={12} color={C.tint} />
                <Text style={styles.infoChipText}>
                  {provider.procedure_code}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>Total Spend</Text>
            <Text style={styles.statBoxValue}>
              {formatCurrency(provider.totalSpend)}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>Avg/Month</Text>
            <Text style={styles.statBoxValue}>{formatCurrency(avgSpend)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statBoxLabel}>Claims</Text>
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
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionDot, { backgroundColor: C.tint }]} />
            <Text style={styles.sectionTitle}>Monthly Spending</Text>
          </View>
          <View style={styles.chartCard}>
            <SpendChart data={provider.monthlyTotals} />
          </View>
        </View>

        {provider.fraudAlerts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View
                style={[styles.sectionDot, { backgroundColor: C.danger }]}
              />
              <Text style={[styles.sectionTitle, { color: C.danger }]}>
                Fraud Alerts
              </Text>
            </View>
            {provider.fraudAlerts.map((alert, i) => (
              <Animated.View
                key={i}
                entering={FadeInDown.delay(i * 60).duration(300)}
              >
                <View style={styles.fraudAlertCard}>
                  <View style={styles.fraudAlertLeft}>
                    <View style={styles.fraudIconWrap}>
                      <Ionicons name="warning" size={16} color={C.danger} />
                    </View>
                    <View>
                      <Text style={styles.fraudAlertMonth}>
                        {formatMonthFull(alert.month)}
                      </Text>
                      <Text style={styles.fraudAlertGrowth}>
                        +{alert.growth_percent.toFixed(0)}% growth
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.fraudAlertAmount}>
                    {formatCurrency(alert.monthly_total)}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View
              style={[styles.sectionDot, { backgroundColor: C.accent }]}
            />
            <Text style={styles.sectionTitle}>Growth Timeline</Text>
          </View>
          {provider.growthData.length > 0 ? (
            <View style={timelineStyles.container}>
              {provider.growthData.map((d, i) => (
                <GrowthItem
                  key={d.month}
                  data={d}
                  index={i}
                  isLast={i === provider.growthData.length - 1}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.noData}>No growth data available</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View
              style={[styles.sectionDot, { backgroundColor: C.textMuted }]}
            />
            <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
          </View>
          <View style={styles.breakdownCard}>
            {provider.monthlyTotals.map((m, i) => {
              const prevTotal = i > 0 ? provider.monthlyTotals[i - 1].total : m.total;
              const change =
                i > 0 && prevTotal > 0
                  ? ((m.total - prevTotal) / prevTotal) * 100
                  : 0;
              const changeColor =
                change > 200 ? C.danger : change > 0 ? C.success : C.textMuted;
              return (
                <View
                  key={m.month}
                  style={[
                    styles.breakdownRow,
                    i === provider.monthlyTotals.length - 1 && {
                      borderBottomWidth: 0,
                    },
                  ]}
                >
                  <Text style={styles.breakdownMonth}>
                    {formatMonthFull(m.month)}
                  </Text>
                  <View style={styles.breakdownRight}>
                    {i > 0 && (
                      <Text
                        style={[styles.breakdownChange, { color: changeColor }]}
                      >
                        {change >= 0 ? "+" : ""}
                        {change.toFixed(0)}%
                      </Text>
                    )}
                    <Text style={styles.breakdownAmount}>
                      {formatCurrency(m.total)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
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
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  profileCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.borderLight,
    overflow: "hidden",
  },
  flaggedCorner: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.dangerBg,
    justifyContent: "center",
    alignItems: "center",
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: C.tintBg2,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  providerName: {
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    color: C.text,
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  providerIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  providerId: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textMuted,
  },
  flaggedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.dangerBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  flaggedPillText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    color: C.danger,
    letterSpacing: 0.8,
  },
  providerInfoChips: {
    flexDirection: "row",
    gap: 10,
  },
  infoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.tintBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  infoChipText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.tint,
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    minWidth: "22%" as unknown as number,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  statBoxLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 9,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  statBoxValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
    color: C.text,
    letterSpacing: -0.3,
  },

  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.text,
  },
  chartCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.dangerBg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.danger + "20",
  },
  fraudAlertLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fraudIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.danger + "18",
    justifyContent: "center",
    alignItems: "center",
  },
  fraudAlertMonth: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: C.danger,
  },
  fraudAlertGrowth: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.dangerLight,
  },
  fraudAlertAmount: {
    fontFamily: "DMSans_700Bold",
    fontSize: 15,
    color: C.danger,
    letterSpacing: -0.3,
  },

  breakdownCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  breakdownMonth: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
  },
  breakdownRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  breakdownChange: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
  },
  breakdownAmount: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: C.text,
    minWidth: 60,
    textAlign: "right",
  },
});

const chartStyles = StyleSheet.create({
  container: {
    paddingTop: 8,
  },
  gridLines: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    height: 130,
    justifyContent: "space-between",
  },
  gridLine: {
    height: 1,
    backgroundColor: C.border,
    opacity: 0.5,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 155,
    gap: 3,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "65%",
    borderRadius: 4,
    minHeight: 3,
  },
  barAmount: {
    fontFamily: "DMSans_400Regular",
    fontSize: 7,
    color: C.textMuted,
    marginBottom: 3,
  },
  barLabel: {
    fontFamily: "DMSans_500Medium",
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
    paddingLeft: 14,
    paddingBottom: 16,
  },
  contentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  month: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.text,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  flagText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 8,
    letterSpacing: 0.5,
  },
});
