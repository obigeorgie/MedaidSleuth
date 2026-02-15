import React, { useState, useCallback } from "react";
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
import { Ionicons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Colors from "@/constants/colors";

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
      onPress={onPress}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProviderCard({ provider }: { provider: Provider }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.providerCard,
        { opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={() =>
        router.push({
          pathname: "/provider/[id]",
          params: { id: provider.id },
        })
      }
    >
      <View style={styles.providerTop}>
        <View style={styles.providerInfo}>
          <Text style={styles.providerName} numberOfLines={1}>
            {provider.name}
          </Text>
          <View style={styles.providerMeta}>
            <View style={styles.metaTag}>
              <Ionicons name="location-outline" size={11} color={C.textMuted} />
              <Text style={styles.metaText}>{provider.state_name}</Text>
            </View>
            <View style={styles.metaTag}>
              <Ionicons name="medkit-outline" size={11} color={C.textMuted} />
              <Text style={styles.metaText}>{provider.procedure_code}</Text>
            </View>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={C.textMuted} />
      </View>
      <View style={styles.providerBottom}>
        <View>
          <Text style={styles.providerStatLabel}>Total Spend</Text>
          <Text style={styles.providerStatValue}>
            {formatCurrency(provider.totalSpend)}
          </Text>
        </View>
        <View>
          <Text style={styles.providerStatLabel}>Claims</Text>
          <Text style={styles.providerStatValue}>{provider.claimCount}</Text>
        </View>
        <View>
          <Text style={styles.providerStatLabel}>Procedure</Text>
          <Text style={styles.providerStatValue} numberOfLines={1}>
            {provider.procedure_desc.split(" ")[0]}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function ExplorerScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const statesQuery = useQuery<StateOption[]>({
    queryKey: ["/api/states"],
  });

  const proceduresQuery = useQuery<ProcedureOption[]>({
    queryKey: ["/api/procedures"],
  });

  const providersQuery = useQuery<Provider[]>({
    queryKey: ["/api/providers"],
  });

  const isLoading =
    statesQuery.isLoading ||
    proceduresQuery.isLoading ||
    providersQuery.isLoading;

  const states = statesQuery.data || [];
  const procedures = proceduresQuery.data || [];
  const allProviders = providersQuery.data || [];

  const filteredProviders = allProviders.filter((p) => {
    if (selectedState && p.state_code !== selectedState) return false;
    if (selectedCode && p.procedure_code !== selectedCode) return false;
    return true;
  });

  const renderProvider = useCallback(
    ({ item }: { item: Provider }) => <ProviderCard provider={item} />,
    []
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
      <View style={[styles.headerArea, { paddingTop: topInset + 16 }]}>
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

        <Text style={styles.resultCount}>
          {filteredProviders.length} provider
          {filteredProviders.length !== 1 ? "s" : ""} found
        </Text>
      </View>

      <FlatList
        data={filteredProviders}
        renderItem={renderProvider}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
        }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={40} color={C.textMuted} />
            <Text style={styles.emptyText}>No providers match filters</Text>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.tint,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  headerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
    color: C.text,
    marginBottom: 18,
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
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
    color: C.background,
  },
  resultCount: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.textMuted,
    marginTop: 4,
  },
  providerCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  providerTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
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
  providerMeta: {
    flexDirection: "row",
    gap: 12,
  },
  metaTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },
  providerBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 12,
  },
  providerStatLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    color: C.textMuted,
    marginBottom: 3,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  providerStatValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: C.text,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 15,
    color: C.textSecondary,
  },
});
