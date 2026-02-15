import React, { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
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
import Animated, { FadeInDown } from "react-native-reanimated";

const C = Colors.light;

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

interface StateOption {
  code: string;
  name: string;
}

interface ProcedureOption {
  code: string;
  desc: string;
}

interface FraudAlert {
  provider_id: string;
  severity: string;
}

function formatCurrency(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={() => {
        if (Platform.OS !== "web") {
          Haptics.selectionAsync();
        }
        onPress();
      }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function MiniSpendBar({ spend, maxSpend }: { spend: number; maxSpend: number }) {
  const ratio = maxSpend > 0 ? spend / maxSpend : 0;
  return (
    <View style={styles.miniBarTrack}>
      <View
        style={[
          styles.miniBarFill,
          { width: `${ratio * 100}%` as unknown as number },
        ]}
      />
    </View>
  );
}

function ProviderCard({
  provider,
  maxSpend,
  isFlagged,
  index,
}: {
  provider: Provider;
  maxSpend: number;
  isFlagged: boolean;
  index: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(350).springify()}>
      <Pressable
        style={({ pressed }) => [
          styles.providerCard,
          isFlagged && styles.providerCardFlagged,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          router.push({
            pathname: "/provider/[id]",
            params: { id: provider.id },
          });
        }}
      >
        <View style={styles.providerTop}>
          <View style={styles.providerAvatarWrap}>
            <View
              style={[
                styles.providerAvatar,
                isFlagged && styles.providerAvatarFlagged,
              ]}
            >
              <MaterialCommunityIcons
                name="hospital-building"
                size={18}
                color={isFlagged ? C.danger : C.tint}
              />
            </View>
            {isFlagged && <View style={styles.flagDot} />}
          </View>
          <View style={styles.providerInfo}>
            <Text style={styles.providerName} numberOfLines={1}>
              {provider.name}
            </Text>
            <View style={styles.providerTagRow}>
              <View style={styles.providerTag}>
                <Text style={styles.providerTagText}>
                  {provider.state_code}
                </Text>
              </View>
              <View style={styles.providerTag}>
                <Text style={styles.providerTagText}>
                  {provider.procedure_code}
                </Text>
              </View>
              {isFlagged && (
                <View style={styles.providerFlagTag}>
                  <Text style={styles.providerFlagTagText}>FLAGGED</Text>
                </View>
              )}
            </View>
          </View>
          <Feather name="chevron-right" size={16} color={C.textMuted} />
        </View>

        <View style={styles.providerBottom}>
          <View style={styles.providerSpendCol}>
            <Text style={styles.providerSpendLabel}>Total Spend</Text>
            <Text style={styles.providerSpendValue}>
              {formatCurrency(provider.totalSpend)}
            </Text>
            <MiniSpendBar spend={provider.totalSpend} maxSpend={maxSpend} />
          </View>
          <View style={styles.providerDivider} />
          <View style={styles.providerStatsCol}>
            <View style={styles.providerStatRow}>
              <Text style={styles.providerStatLabel}>Claims</Text>
              <Text style={styles.providerStatValue}>
                {provider.claimCount}
              </Text>
            </View>
            <View style={styles.providerStatRow}>
              <Text style={styles.providerStatLabel}>Type</Text>
              <Text style={styles.providerStatValue} numberOfLines={1}>
                {provider.procedure_desc.split(" ").slice(0, 2).join(" ")}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function ExplorerScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const statesQuery = useQuery<StateOption[]>({ queryKey: ["/api/states"] });
  const proceduresQuery = useQuery<ProcedureOption[]>({
    queryKey: ["/api/procedures"],
  });
  const providersQuery = useQuery<Provider[]>({ queryKey: ["/api/providers"] });
  const scanQuery = useQuery<FraudAlert[]>({ queryKey: ["/api/scan"] });

  const isLoading =
    statesQuery.isLoading || proceduresQuery.isLoading || providersQuery.isLoading;

  const states = statesQuery.data || [];
  const procedures = proceduresQuery.data || [];
  const allProviders = providersQuery.data || [];
  const flaggedIds = new Set(
    (scanQuery.data || []).map((a) => a.provider_id)
  );

  const filteredProviders = allProviders.filter((p) => {
    if (selectedState && p.state_code !== selectedState) return false;
    if (selectedCode && p.procedure_code !== selectedCode) return false;
    return true;
  });

  const maxSpend = Math.max(...allProviders.map((p) => p.totalSpend), 1);

  const renderProvider = useCallback(
    ({ item, index }: { item: Provider; index: number }) => (
      <ProviderCard
        provider={item}
        maxSpend={maxSpend}
        isFlagged={flaggedIds.has(item.id)}
        index={index}
      />
    ),
    [maxSpend, flaggedIds]
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
      <View style={[styles.headerArea, { paddingTop: topInset + 12 }]}>
        <Text style={styles.headerLabel}>Data Explorer</Text>
        <Text style={styles.headerTitle}>Providers</Text>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>State</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <FilterChip
              label="All"
              selected={selectedState === null}
              onPress={() => setSelectedState(null)}
            />
            {states.map((s) => (
              <FilterChip
                key={s.code}
                label={s.code}
                selected={selectedState === s.code}
                onPress={() =>
                  setSelectedState(selectedState === s.code ? null : s.code)
                }
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Procedure</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <FilterChip
              label="All"
              selected={selectedCode === null}
              onPress={() => setSelectedCode(null)}
            />
            {procedures.map((p) => (
              <FilterChip
                key={p.code}
                label={p.code}
                selected={selectedCode === p.code}
                onPress={() =>
                  setSelectedCode(selectedCode === p.code ? null : p.code)
                }
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.resultBar}>
          <Text style={styles.resultCount}>
            {filteredProviders.length} provider
            {filteredProviders.length !== 1 ? "s" : ""}
          </Text>
          {(selectedState || selectedCode) && (
            <Pressable
              onPress={() => {
                setSelectedState(null);
                setSelectedCode(null);
              }}
            >
              <Text style={styles.clearFilters}>Clear filters</Text>
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={filteredProviders}
        renderItem={renderProvider}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
        }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={44} color={C.textMuted} />
            <Text style={styles.emptyTitle}>No Matches</Text>
            <Text style={styles.emptyText}>
              No providers match the selected filters
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
  headerArea: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLabel: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: C.tint,
    textTransform: "uppercase" as const,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
    color: C.text,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  filterSection: {
    marginBottom: 10,
  },
  filterLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
    color: C.textMuted,
    marginBottom: 6,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  chipRow: {
    flexDirection: "row",
    gap: 7,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipSelected: {
    backgroundColor: C.tint,
    borderColor: C.tint,
  },
  chipText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.textSecondary,
  },
  chipTextSelected: {
    color: C.textInverse,
    fontFamily: "DMSans_600SemiBold",
  },
  resultBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  resultCount: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.textMuted,
  },
  clearFilters: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.tint,
  },

  providerCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  providerCardFlagged: {
    borderColor: C.danger + "30",
  },
  providerTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  providerAvatarWrap: {
    position: "relative",
    marginRight: 12,
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
  providerInfo: {
    flex: 1,
    marginRight: 8,
  },
  providerName: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: C.text,
    marginBottom: 6,
  },
  providerTagRow: {
    flexDirection: "row",
    gap: 5,
  },
  providerTag: {
    backgroundColor: C.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  providerTagText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 10,
    color: C.textSecondary,
    letterSpacing: 0.3,
  },
  providerFlagTag: {
    backgroundColor: C.dangerBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  providerFlagTagText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 9,
    color: C.danger,
    letterSpacing: 0.5,
  },
  providerBottom: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 14,
  },
  providerSpendCol: {
    flex: 1.2,
  },
  providerSpendLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    color: C.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  providerSpendValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
    color: C.text,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  miniBarTrack: {
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  miniBarFill: {
    height: "100%",
    backgroundColor: C.tint,
    borderRadius: 2,
  },
  providerDivider: {
    width: 1,
    backgroundColor: C.border,
    marginHorizontal: 16,
  },
  providerStatsCol: {
    flex: 1,
    justifyContent: "center",
    gap: 10,
  },
  providerStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  providerStatLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },
  providerStatValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 12,
    color: C.text,
    maxWidth: 100,
  },

  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 17,
    color: C.text,
    marginTop: 4,
  },
  emptyText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: C.textSecondary,
  },
});
