import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import Animated, { FadeInDown } from "react-native-reanimated";

const C = Colors.light;

interface MenuItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  iconLibrary: "ionicons" | "material";
}

const menuItems: MenuItem[] = [
  {
    id: "watchlist",
    title: "Watchlist",
    description: "Track providers and alerts",
    icon: "eye",
    route: "/watchlist",
    iconLibrary: "ionicons",
  },
  {
    id: "activity",
    title: "Activity Feed",
    description: "View recent changes",
    icon: "time",
    route: "/activity",
    iconLibrary: "ionicons",
  },
  {
    id: "saved-searches",
    title: "Saved Searches",
    description: "Access your saved queries",
    icon: "bookmark",
    route: "/saved-searches",
    iconLibrary: "ionicons",
  },
  {
    id: "compare",
    title: "Compare Providers",
    description: "Side-by-side analysis",
    icon: "git-compare",
    route: "/compare",
    iconLibrary: "material",
  },
  {
    id: "heatmap",
    title: "Geographic Heatmap",
    description: "Visualize regional data",
    icon: "map",
    route: "/heatmap",
    iconLibrary: "ionicons",
  },
  {
    id: "shared",
    title: "Shared with Me",
    description: "Team collaboration",
    icon: "people",
    route: "/shared",
    iconLibrary: "ionicons",
  },
  {
    id: "settings",
    title: "Settings",
    description: "App preferences",
    icon: "settings",
    route: "/settings",
    iconLibrary: "ionicons",
  },
];

function MenuCard({ item, index }: { item: MenuItem; index: number }) {
  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(item.route);
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(350).springify()}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          pressed && { opacity: 0.7 },
        ]}
        onPress={handlePress}
      >
        <View style={styles.cardIconContainer}>
          {item.iconLibrary === "ionicons" ? (
            <Ionicons name={item.icon as any} size={24} color={C.tint} />
          ) : (
            <MaterialCommunityIcons name={item.icon as any} size={24} color={C.tint} />
          )}
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardDescription}>{item.description}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.container} testID="more-tab">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: topInset + 12,
          paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerLabel}>Tools & Settings</Text>
          <Text style={styles.headerTitle}>More</Text>
        </View>

        <View style={styles.cardsContainer}>
          {menuItems.map((item, index) => (
            <MenuCard key={item.id} item={item} index={index} />
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
  header: {
    marginBottom: 24,
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
  },
  cardsContainer: {
    gap: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.tintBg,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: C.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.textMuted,
  },
});
