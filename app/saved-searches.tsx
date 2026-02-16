import React, { useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Platform,
  FlatList,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import Animated, { FadeInDown } from "react-native-reanimated";
import { apiRequest } from "@/lib/query-client";

const C = Colors.light;

interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  stateCode: string | null;
  procedureCode: string | null;
  createdAt: string;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  ) {
    return `Today at ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
  }

  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function SavedSearchCard({
  search,
  index,
  onDelete,
  isDeleting,
}: {
  search: SavedSearch;
  index: number;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(350).springify()}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          router.push("/(tabs)/explorer");
        }}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleWrap}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {search.name}
            </Text>
            <Text style={styles.cardDate}>
              {formatDate(search.createdAt)}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }
              onDelete();
            }}
            disabled={isDeleting}
            style={({ pressed }) => [
              styles.deleteButton,
              pressed && { opacity: 0.6 },
              isDeleting && { opacity: 0.5 },
            ]}
          >
            {isDeleting ? (
              <ActivityIndicator size={20} color={C.danger} />
            ) : (
              <Feather name="trash-2" size={18} color={C.danger} />
            )}
          </Pressable>
        </View>

        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>
              {search.stateCode || "All States"}
            </Text>
          </View>
          <View style={styles.tag}>
            <Text style={styles.tagText}>
              {search.procedureCode || "All Procedures"}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function SavedSearchesScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const queryClient = useQueryClient();

  const savedSearchesQuery = useQuery<SavedSearch[]>({
    queryKey: ["/api/saved-searches"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/saved-searches/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-searches"] });
    },
  });

  const handleDelete = useCallback(
    (id: string) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      deleteMutation.mutate(id);
    },
    [deleteMutation]
  );

  const renderSearch = useCallback(
    ({ item, index }: { item: SavedSearch; index: number }) => (
      <SavedSearchCard
        search={item}
        index={index}
        onDelete={() => handleDelete(item.id)}
        isDeleting={deleteMutation.isPending}
      />
    ),
    [handleDelete, deleteMutation.isPending]
  );

  const isLoading = savedSearchesQuery.isLoading;
  const searches = savedSearchesQuery.data || [];

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={C.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerTop}>
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              router.back();
            }}
            style={({ pressed }) => pressed && { opacity: 0.6 }}
          >
            <Ionicons name="chevron-back" size={24} color={C.tint} />
          </Pressable>
          <Text style={styles.headerTitle}>Saved Searches</Text>
          <View style={{ width: 24 }} />
        </View>
      </View>

      <FlatList
        data={searches}
        renderItem={renderSearch}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
        }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={searches.length > 0}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="bookmark-outline" size={48} color={C.textMuted} />
            <Text style={styles.emptyTitle}>No Saved Searches</Text>
            <Text style={styles.emptyText}>
              Create and save your search filters to access them later
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
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
    color: C.text,
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardTitleWrap: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.text,
    marginBottom: 4,
  },
  cardDate: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.textMuted,
  },
  deleteButton: {
    padding: 8,
  },
  tagRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  tag: {
    backgroundColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tagText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.textSecondary,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 80,
    gap: 12,
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
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
