import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Image,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

const C = Colors.light;
const { width: SCREEN_W } = Dimensions.get("window");

const FEATURES = [
  {
    icon: "bar-chart" as const,
    iconLib: "ionicon" as const,
    title: "Dashboard",
    desc: "Real-time overview of claims, providers, and spending across all states",
    color: C.tint,
    bg: C.tintBg,
  },
  {
    icon: "search" as const,
    iconLib: "ionicon" as const,
    title: "Explorer",
    desc: "Browse and filter providers by state and procedure code with deep drill-downs",
    color: C.accent,
    bg: C.accentBg,
  },
  {
    icon: "shield-checkmark" as const,
    iconLib: "ionicon" as const,
    title: "Fraud Scanner",
    desc: "Automated detection of anomalous billing spikes with severity scoring",
    color: C.danger,
    bg: C.dangerBg,
  },
  {
    icon: "robot" as const,
    iconLib: "mci" as const,
    title: "AI Assistant",
    desc: "Ask questions about providers and get AI-powered fraud analysis insights",
    color: C.warningLight,
    bg: C.warningBg,
  },
];

interface Props {
  onSignIn: () => void;
  onCreateAccount: () => void;
}

export default function WelcomeScreen({ onSignIn, onCreateAccount }: Props) {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <LinearGradient
      colors={[C.background, C.gradient2, C.background]}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + webTopInset + 32,
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)} style={styles.heroSection}>
          <Image
            source={require("@/assets/images/logo-dark.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.heroTagline}>Fraud Detection Intelligence</Text>
          <Text style={styles.heroDescription}>
            Analyze Medicaid provider spending, detect billing anomalies, and investigate fraud patterns — all in one powerful platform.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.ctaSection}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onCreateAccount}
            activeOpacity={0.8}
            testID="welcome-create-account"
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={18} color={C.textInverse} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onSignIn}
            activeOpacity={0.8}
            testID="welcome-sign-in"
          >
            <Text style={styles.secondaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>What you can do</Text>
          {FEATURES.map((f, i) => (
            <Animated.View
              key={f.title}
              entering={FadeInDown.delay(500 + i * 100).duration(400)}
              style={styles.featureCard}
            >
              <View style={[styles.featureIconWrap, { backgroundColor: f.bg }]}>
                {f.iconLib === "mci" ? (
                  <MaterialCommunityIcons name={f.icon as any} size={22} color={f.color} />
                ) : (
                  <Ionicons name={f.icon as any} size={22} color={f.color} />
                )}
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </Animated.View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(900).duration(400)} style={styles.footer}>
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Ionicons name="shield-checkmark" size={16} color={C.tint} />
              <Text style={styles.statText}>Anomaly Detection</Text>
            </View>
            <View style={styles.statDot} />
            <View style={styles.statItem}>
              <Ionicons name="analytics" size={16} color={C.accent} />
              <Text style={styles.statText}>Trend Analysis</Text>
            </View>
            <View style={styles.statDot} />
            <View style={styles.statItem}>
              <Ionicons name="sparkles" size={16} color={C.warningLight} />
              <Text style={styles.statText}>AI-Powered</Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoImage: {
    width: 280,
    height: 100,
    marginBottom: 12,
  },
  heroTagline: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.tint,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  heroDescription: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 23,
    maxWidth: 380,
  },
  ctaSection: {
    gap: 12,
    marginBottom: 40,
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  primaryButton: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    fontFamily: "DMSans_700Bold",
    fontSize: 16,
    color: C.textInverse,
  },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  secondaryButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.text,
  },
  featuresSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 18,
    color: C.text,
    marginBottom: 16,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.borderSubtle,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: C.text,
    marginBottom: 4,
  },
  featureDesc: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 19,
  },
  footer: {
    alignItems: "center",
    paddingTop: 8,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.textMuted,
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.textMuted,
  },
});
