import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";

const C = Colors.light;

interface Price {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string } | null;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, string>;
  prices: Price[];
}

const PLAN_ICONS: Record<string, { icon: string; color: string }> = {
  analyst: { icon: "analytics", color: C.accent },
  investigator: { icon: "shield-checkmark", color: C.tint },
};

const PLAN_FEATURES: Record<string, string[]> = {
  analyst: [
    "Real-time dashboard analytics",
    "Provider explorer with filters",
    "Basic anomaly scanning",
    "State-level data views",
    "Monthly billing trend charts",
  ],
  investigator: [
    "Everything in Analyst",
    "Advanced multi-factor scanning",
    "Severity-classified alerts",
    "Priority fraud notifications",
    "Data export capabilities",
    "Custom alert thresholds",
    "Historical pattern analysis",
  ],
};

function PlanCard({
  product,
  index,
  onSubscribe,
  isLoading,
}: {
  product: Product;
  index: number;
  onSubscribe: (priceId: string) => void;
  isLoading: boolean;
}) {
  const tier = product.metadata?.tier || product.name.toLowerCase();
  const planStyle = PLAN_ICONS[tier] || { icon: "diamond", color: C.accent };
  const features = PLAN_FEATURES[tier] || [];
  const price = product.prices[0];
  const isPopular = tier === "investigator";

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 150).springify()}
      style={[styles.planCard, isPopular && styles.planCardPopular]}
    >
      {isPopular && (
        <LinearGradient
          colors={[C.tint, C.tintDim]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.popularBadge}
        >
          <Text style={styles.popularBadgeText}>RECOMMENDED</Text>
        </LinearGradient>
      )}

      <View style={styles.planHeader}>
        <View
          style={[
            styles.planIconContainer,
            { backgroundColor: planStyle.color + "18" },
          ]}
        >
          <Ionicons
            name={planStyle.icon as any}
            size={28}
            color={planStyle.color}
          />
        </View>
        <Text style={styles.planName}>{product.name}</Text>
        {product.description && (
          <Text style={styles.planDescription}>{product.description}</Text>
        )}
      </View>

      <View style={styles.priceContainer}>
        {price && price.unit_amount != null ? (
          <>
            <Text style={[styles.priceAmount, { color: planStyle.color }]}>
              ${(price.unit_amount / 100).toFixed(0)}
            </Text>
            <Text style={styles.pricePeriod}>
              /{price.recurring?.interval || "mo"}
            </Text>
          </>
        ) : (
          <Text style={styles.priceAmount}>Contact Us</Text>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.featuresContainer}>
        {features.map((feature, i) => (
          <View key={i} style={styles.featureRow}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={planStyle.color}
              style={styles.featureIcon}
            />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[
          styles.subscribeButton,
          isPopular
            ? styles.subscribeButtonPopular
            : styles.subscribeButtonDefault,
        ]}
        onPress={() => price && onSubscribe(price.id)}
        disabled={isLoading || !price}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={isPopular ? C.background : C.tint} />
        ) : (
          <>
            <Text
              style={[
                styles.subscribeButtonText,
                isPopular
                  ? styles.subscribeButtonTextPopular
                  : styles.subscribeButtonTextDefault,
              ]}
            >
              Get Started
            </Text>
            <Ionicons
              name="arrow-forward"
              size={18}
              color={isPopular ? C.background : C.tint}
              style={{ marginLeft: 6 }}
            />
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function PlansScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);

  const productsQuery = useQuery<{ data: Product[] }>({
    queryKey: ["/api/stripe/products"],
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const response = await apiRequest("POST", "/api/stripe/checkout", {
        priceId,
      });
      return await response.json();
    },
    onSuccess: (data: { url: string }) => {
      if (data.url) {
        Linking.openURL(data.url);
      }
    },
    onError: (error: any) => {
      Alert.alert("Error", "Failed to start checkout. Please try again.");
      console.error("Checkout error:", error);
    },
    onSettled: () => {
      setLoadingPriceId(null);
    },
  });

  const handleSubscribe = (priceId: string) => {
    setLoadingPriceId(priceId);
    checkoutMutation.mutate(priceId);
  };

  const products = productsQuery.data?.data || [];
  const sortedProducts = [...products].sort((a, b) => {
    const aPrice = a.prices[0]?.unit_amount || 0;
    const bPrice = b.prices[0]?.unit_amount || 0;
    return aPrice - bPrice;
  });

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(500)} style={styles.headerSection}>
          <View style={styles.headerIconRow}>
            <MaterialCommunityIcons
              name="shield-lock"
              size={32}
              color={C.tint}
            />
          </View>
          <Text style={styles.headerTitle}>Choose Your Plan</Text>
          <Text style={styles.headerSubtitle}>
            Unlock powerful fraud detection tools to protect Medicaid programs
          </Text>
        </Animated.View>

        {productsQuery.isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={C.tint} />
            <Text style={styles.loadingText}>Loading plans...</Text>
          </View>
        ) : productsQuery.isError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color={C.danger} />
            <Text style={styles.errorText}>
              Unable to load plans right now
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => productsQuery.refetch()}
            >
              <Ionicons name="refresh" size={20} color={C.tint} />
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : sortedProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="package-variant"
              size={48}
              color={C.textMuted}
            />
            <Text style={styles.emptyText}>
              No plans available yet. Check back soon.
            </Text>
          </View>
        ) : (
          <View style={styles.plansContainer}>
            {sortedProducts.map((product, index) => (
              <PlanCard
                key={product.id}
                product={product}
                index={index}
                onSubscribe={handleSubscribe}
                isLoading={
                  loadingPriceId === product.prices[0]?.id &&
                  checkoutMutation.isPending
                }
              />
            ))}
          </View>
        )}

        <Animated.View
          entering={FadeInDown.delay(400).springify()}
          style={styles.footerSection}
        >
          <View style={styles.footerRow}>
            <Ionicons name="lock-closed" size={14} color={C.textMuted} />
            <Text style={styles.footerText}>
              Secure payments powered by Stripe
            </Text>
          </View>
          <View style={styles.footerRow}>
            <Ionicons name="refresh" size={14} color={C.textMuted} />
            <Text style={styles.footerText}>Cancel anytime, no lock-in</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  headerSection: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 28,
  },
  headerIconRow: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: C.tintBg2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: "DMSans_700Bold",
    color: C.text,
    marginBottom: 8,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
  loadingContainer: {
    alignItems: "center",
    paddingTop: 60,
  },
  loadingText: {
    color: C.textSecondary,
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    marginTop: 12,
  },
  errorContainer: {
    alignItems: "center",
    paddingTop: 60,
  },
  errorText: {
    color: C.textSecondary,
    fontFamily: "DMSans_500Medium",
    fontSize: 15,
    marginTop: 12,
    marginBottom: 16,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  retryText: {
    color: C.tint,
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    color: C.textSecondary,
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  plansContainer: {
    gap: 20,
  },
  planCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    overflow: "hidden",
  },
  planCardPopular: {
    borderColor: C.tint,
    borderWidth: 1.5,
  },
  popularBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomLeftRadius: 12,
  },
  popularBadgeText: {
    color: C.background,
    fontSize: 10,
    fontFamily: "DMSans_700Bold",
    letterSpacing: 1,
  },
  planHeader: {
    marginBottom: 20,
  },
  planIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  planName: {
    fontSize: 22,
    fontFamily: "DMSans_700Bold",
    color: C.text,
    marginBottom: 6,
  },
  planDescription: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: C.textSecondary,
    lineHeight: 18,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 20,
  },
  priceAmount: {
    fontSize: 40,
    fontFamily: "DMSans_700Bold",
    color: C.text,
  },
  pricePeriod: {
    fontSize: 16,
    fontFamily: "DMSans_400Regular",
    color: C.textMuted,
    marginLeft: 4,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 20,
  },
  featuresContainer: {
    gap: 12,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  featureIcon: {
    marginRight: 10,
  },
  featureText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: C.textSecondary,
    flex: 1,
  },
  subscribeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },
  subscribeButtonPopular: {
    backgroundColor: C.tint,
  },
  subscribeButtonDefault: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: C.tint,
  },
  subscribeButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
  },
  subscribeButtonTextPopular: {
    color: C.background,
  },
  subscribeButtonTextDefault: {
    color: C.tint,
  },
  footerSection: {
    alignItems: "center",
    marginTop: 32,
    gap: 10,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: C.textMuted,
  },
});
