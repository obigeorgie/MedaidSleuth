import React, { useState, useEffect } from "react";
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
import { router } from "expo-router";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
} from "react-native-reanimated";

const C = Colors.light;

const PROVIDER_COLORS = ["#00E5CC", "#4C7CFF", "#FFB020", "#FF4D6A"];

interface Provider {
  id: string;
  name: string;
  state_code: string;
  state_name: string;
  procedure_code: string;
  procedure_desc: string;
  totalSpend: number;
  claimCount: number;
}

interface MonthlyTotal {
  month: string;
  total: number;
}

interface FraudAlert {
  provider_id: string;
  provider_name: string;
  month: string;
  growth_percent: number;
  monthly_total: number;
  severity: "critical" | "high" | "medium";
}

interface CompareProvider {
  id: string;
  name: string;
  state_code: string;
  state_name: string;
  procedure_code: string;
  procedure_desc: string;
  totalSpend: number;
  claimCount: number;
  monthlyTotals: MonthlyTotal[];
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

function SelectionCard({
  provider,
  selected,
  disabled,
  onToggle,
  index,
}: {
  provider: Provider;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  index: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
      <Pressable
        style={({ pressed }) => [
          styles.selCard,
          selected && styles.selCardActive,
          disabled && !selected && styles.selCardDisabled,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => {
          if (disabled && !selected) return;
          if (Platform.OS !== "web") {
            Haptics.selectionAsync();
          }
          onToggle();
        }}
      >
        <View style={[styles.selCheck, selected && styles.selCheckActive]}>
          {selected && <Ionicons name="checkmark" size={14} color={C.background} />}
        </View>
        <View style={styles.selInfo}>
          <Text style={styles.selName} numberOfLines={1}>
            {provider.name}
          </Text>
          <View style={styles.selTagRow}>
            <View style={styles.selTag}>
              <Text style={styles.selTagText}>{provider.state_code}</Text>
            </View>
            <View style={styles.selTag}>
              <Text style={styles.selTagText}>{provider.procedure_code}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.selSpend}>{formatCurrency(provider.totalSpend)}</Text>
      </Pressable>
    </Animated.View>
  );
}

function SpendBar({
  value,
  maxValue,
  color,
  index,
}: {
  value: number;
  maxValue: number;
  color: string;
  index: number;
}) {
  const animWidth = useSharedValue(0);
  const ratio = maxValue > 0 ? (value / maxValue) * 100 : 0;

  useEffect(() => {
    animWidth.value = withDelay(
      index * 100,
      withTiming(ratio, { duration: 700, easing: Easing.out(Easing.cubic) })
    );
  }, [ratio]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${animWidth.value}%` as unknown as number,
  }));

  return (
    <Animated.View
      style={[styles.spendBarFill, barStyle, { backgroundColor: color }]}
    />
  );
}

function MonthlyRow({
  provider,
  color,
  globalMax,
  index,
}: {
  provider: CompareProvider;
  color: string;
  globalMax: number;
  index: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(350)}
      style={styles.monthlyRow}
    >
      <View style={styles.monthlyLabelRow}>
        <View style={[styles.monthlyDot, { backgroundColor: color }]} />
        <Text style={styles.monthlyName} numberOfLines={1}>
          {provider.name}
        </Text>
      </View>
      <View style={styles.monthlyBars}>
        {provider.monthlyTotals.map((mt) => {
          const h = globalMax > 0 ? (mt.total / globalMax) * 40 : 2;
          return (
            <View key={mt.month} style={styles.monthlyBarCol}>
              <View
                style={[
                  styles.monthlyBar,
                  { height: Math.max(h, 2), backgroundColor: color },
                ]}
              />
              <Text style={styles.monthlyBarLabel}>{formatMonth(mt.month)}</Text>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

export default function CompareScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<"select" | "compare">("select");

  const providersQuery = useQuery<Provider[]>({ queryKey: ["/api/providers"] });

  const idsParam = selectedIds.join(",");
  const compareQuery = useQuery<CompareProvider[]>({
    queryKey: ["/api/compare", idsParam],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/compare?ids=${encodeURIComponent(idsParam)}`, baseUrl);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: phase === "compare" && selectedIds.length >= 2,
  });

  const providers = providersQuery.data || [];

  const toggleId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCompare = () => {
    if (selectedIds.length < 2) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setPhase("compare");
  };

  const handleBack = () => {
    if (phase === "compare") {
      setPhase("select");
      return;
    }
    router.back();
  };

  const compareData = compareQuery.data || [];
  const maxSpend = Math.max(...compareData.map((p) => p.totalSpend), 1);
  const maxClaims = Math.max(...compareData.map((p) => p.claimCount), 1);
  const globalMonthlyMax = Math.max(
    ...compareData.flatMap((p) => p.monthlyTotals.map((mt) => mt.total)),
    1
  );

  if (providersQuery.isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={C.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <Pressable onPress={handleBack} style={styles.backButton} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Compare Providers</Text>
        <View style={{ width: 36 }} />
      </View>

      {phase === "select" && (
        <View style={styles.flex1}>
          <View style={styles.selHeader}>
            <Text style={styles.selHeaderText}>
              Select 2-4 providers to compare
            </Text>
            <Text style={styles.selCount}>
              {selectedIds.length} / 4 selected
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.selList,
              { paddingBottom: Platform.OS === "web" ? 120 : insets.bottom + 100 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {providers.map((p, i) => (
              <SelectionCard
                key={p.id}
                provider={p}
                selected={selectedIds.includes(p.id)}
                disabled={selectedIds.length >= 4}
                onToggle={() => toggleId(p.id)}
                index={i}
              />
            ))}
          </ScrollView>

          {selectedIds.length >= 2 && (
            <Animated.View
              entering={FadeIn.duration(300)}
              style={[
                styles.compareButtonWrap,
                { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 12 },
              ]}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.compareButton,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={handleCompare}
              >
                <Ionicons name="git-compare-outline" size={18} color={C.background} />
                <Text style={styles.compareButtonText}>
                  Compare {selectedIds.length} Providers
                </Text>
              </Pressable>
            </Animated.View>
          )}
        </View>
      )}

      {phase === "compare" && (
        <>
          {compareQuery.isLoading ? (
            <View style={[styles.flex1, styles.center]}>
              <ActivityIndicator size="large" color={C.tint} />
              <Text style={styles.loadingText}>Loading comparison...</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={[
                styles.compareScroll,
                { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <Animated.View entering={FadeIn.duration(400)}>
                <View style={styles.legendRow}>
                  {compareData.map((p, i) => (
                    <View key={p.id} style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendDot,
                          { backgroundColor: PROVIDER_COLORS[i % PROVIDER_COLORS.length] },
                        ]}
                      />
                      <Text style={styles.legendName} numberOfLines={1}>
                        {p.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </Animated.View>

              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.sectionDot, { backgroundColor: C.tint }]} />
                  <Text style={styles.sectionTitle}>Total Spend</Text>
                </View>
                <View style={styles.card}>
                  {compareData.map((p, i) => (
                    <Animated.View
                      key={p.id}
                      entering={FadeInRight.delay(i * 100).duration(400)}
                    >
                      <View style={styles.spendRow}>
                        <View style={styles.spendLabelCol}>
                          <View
                            style={[
                              styles.spendDot,
                              {
                                backgroundColor:
                                  PROVIDER_COLORS[i % PROVIDER_COLORS.length],
                              },
                            ]}
                          />
                          <Text style={styles.spendLabel} numberOfLines={1}>
                            {p.name}
                          </Text>
                        </View>
                        <Text style={styles.spendValue}>
                          {formatCurrency(p.totalSpend)}
                        </Text>
                      </View>
                      <View style={styles.spendBarTrack}>
                        <SpendBar
                          value={p.totalSpend}
                          maxValue={maxSpend}
                          color={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
                          index={i}
                        />
                      </View>
                      {i < compareData.length - 1 && <View style={styles.rowDivider} />}
                    </Animated.View>
                  ))}
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.sectionDot, { backgroundColor: C.accent }]} />
                  <Text style={styles.sectionTitle}>Claims & Status</Text>
                </View>
                <View style={styles.card}>
                  {compareData.map((p, i) => (
                    <Animated.View
                      key={p.id}
                      entering={FadeInDown.delay(i * 80).duration(350)}
                    >
                      <View style={styles.claimsRow}>
                        <View style={styles.claimsLeft}>
                          <View
                            style={[
                              styles.claimsDot,
                              {
                                backgroundColor:
                                  PROVIDER_COLORS[i % PROVIDER_COLORS.length],
                              },
                            ]}
                          />
                          <Text style={styles.claimsName} numberOfLines={1}>
                            {p.name}
                          </Text>
                        </View>
                        <View style={styles.claimsRight}>
                          <View style={styles.claimsStat}>
                            <Text style={styles.claimsLabel}>Claims</Text>
                            <Text style={styles.claimsValue}>{p.claimCount}</Text>
                          </View>
                          <View style={styles.claimsStat}>
                            <Text style={styles.claimsLabel}>Alerts</Text>
                            <Text
                              style={[
                                styles.claimsValue,
                                p.fraudAlerts.length > 0 && { color: C.danger },
                              ]}
                            >
                              {p.fraudAlerts.length}
                            </Text>
                          </View>
                          {p.isFlagged ? (
                            <View style={styles.flaggedBadge}>
                              <Ionicons name="warning" size={10} color={C.danger} />
                              <Text style={styles.flaggedBadgeText}>FLAGGED</Text>
                            </View>
                          ) : (
                            <View style={styles.clearBadge}>
                              <Ionicons
                                name="checkmark-circle"
                                size={10}
                                color={C.success}
                              />
                              <Text style={styles.clearBadgeText}>CLEAR</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {i < compareData.length - 1 && <View style={styles.rowDivider} />}
                    </Animated.View>
                  ))}
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.sectionDot, { backgroundColor: C.warning }]} />
                  <Text style={styles.sectionTitle}>Monthly Spending</Text>
                </View>
                <View style={styles.card}>
                  {compareData.map((p, i) => (
                    <MonthlyRow
                      key={p.id}
                      provider={p}
                      color={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
                      globalMax={globalMonthlyMax}
                      index={i}
                    />
                  ))}
                </View>
              </View>
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  flex1: {
    flex: 1,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textMuted,
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

  selHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  selHeaderText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.textSecondary,
  },
  selCount: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
    color: C.tint,
  },
  selList: {
    paddingHorizontal: 20,
    gap: 8,
  },
  selCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  selCardActive: {
    borderColor: C.tint,
    backgroundColor: C.tintBg,
  },
  selCardDisabled: {
    opacity: 0.4,
  },
  selCheck: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: C.borderLight,
    justifyContent: "center",
    alignItems: "center",
  },
  selCheckActive: {
    backgroundColor: C.tint,
    borderColor: C.tint,
  },
  selInfo: {
    flex: 1,
  },
  selName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: C.text,
    marginBottom: 4,
  },
  selTagRow: {
    flexDirection: "row",
    gap: 5,
  },
  selTag: {
    backgroundColor: C.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selTagText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 10,
    color: C.textSecondary,
    letterSpacing: 0.3,
  },
  selSpend: {
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
    color: C.text,
    letterSpacing: -0.3,
  },
  compareButtonWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: C.background + "F0",
  },
  compareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.tint,
    paddingVertical: 16,
    borderRadius: 14,
  },
  compareButtonText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 15,
    color: C.background,
    letterSpacing: -0.2,
  },

  compareScroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendName: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.textSecondary,
    maxWidth: 120,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
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
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  spendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  spendLabelCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  spendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  spendLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.textSecondary,
    flex: 1,
  },
  spendValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 15,
    color: C.text,
    letterSpacing: -0.3,
  },
  spendBarTrack: {
    height: 6,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 4,
  },
  spendBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  rowDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 12,
  },

  claimsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  claimsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  claimsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  claimsName: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.textSecondary,
    flex: 1,
  },
  claimsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  claimsStat: {
    alignItems: "center",
  },
  claimsLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 9,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  claimsValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 14,
    color: C.text,
  },
  flaggedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: C.dangerBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  flaggedBadgeText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    color: C.danger,
    letterSpacing: 0.5,
  },
  clearBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: C.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  clearBadgeText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    color: C.success,
    letterSpacing: 0.5,
  },

  monthlyRow: {
    marginBottom: 16,
  },
  monthlyLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  monthlyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  monthlyName: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.textSecondary,
  },
  monthlyBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 56,
  },
  monthlyBarCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  monthlyBar: {
    width: "70%",
    borderRadius: 3,
    minHeight: 2,
  },
  monthlyBarLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 7,
    color: C.textMuted,
    marginTop: 3,
  },
});
