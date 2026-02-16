import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth";
import Slider from "@react-native-community/slider";

const C = Colors.light;

interface Settings {
  id: string;
  userId: string;
  alertThreshold: number;
  themePreference: "dark" | "light";
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { user } = useAuth();

  const [localThreshold, setLocalThreshold] = useState<number | null>(null);
  const [localTheme, setLocalTheme] = useState<"dark" | "light" | null>(null);

  const settingsQuery = useQuery<Settings>({ queryKey: ["/api/settings"] });

  const settingsMutation = useMutation({
    mutationFn: async (data: { alertThreshold?: number; themePreference?: "dark" | "light" }) => {
      const res = await apiRequest("PUT", "/api/settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scan"] });
      setLocalThreshold(null);
      setLocalTheme(null);
    },
  });

  const isLoading = settingsQuery.isLoading;
  const settings = settingsQuery.data;

  const currentThreshold = localThreshold !== null ? localThreshold : (settings?.alertThreshold ?? 200);
  const currentTheme = localTheme !== null ? localTheme : (settings?.themePreference ?? "dark");

  const handleThresholdChange = (value: number) => {
    setLocalThreshold(value);
  };

  const handleThresholdSave = () => {
    if (localThreshold !== null) {
      settingsMutation.mutate({ alertThreshold: Math.round(localThreshold) });
    }
  };

  const handleThemeChange = (theme: "dark" | "light") => {
    setLocalTheme(theme);
    settingsMutation.mutate({ themePreference: theme });
  };

  const handlePresetThreshold = (value: number) => {
    setLocalThreshold(value);
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
      <View style={[styles.header, { paddingTop: topInset }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="back-button"
        >
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingBottom: Platform.OS === "web" ? 84 + 34 : 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="warning" size={16} color={C.danger} />
            <Text style={styles.sectionTitle}>Fraud Detection</Text>
          </View>

          <View style={styles.thresholdCard}>
            <Text style={styles.thresholdLabel}>Alert Threshold</Text>
            <Text style={styles.thresholdValue}>{Math.round(currentThreshold)}%</Text>
            <Text style={styles.thresholdDescription}>
              Alerts will trigger when provider spending growth exceeds this percentage
            </Text>
          </View>

          <View style={styles.sliderContainer}>
            <Slider
              style={styles.slider}
              minimumValue={50}
              maximumValue={1000}
              step={10}
              value={currentThreshold}
              onValueChange={handleThresholdChange}
              minimumTrackTintColor={C.tint}
              maximumTrackTintColor={C.border}
              testID="threshold-slider"
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>50%</Text>
              <Text style={styles.sliderLabel}>1000%</Text>
            </View>
          </View>

          <View style={styles.presetsContainer}>
            {[100, 200, 500, 1000].map((value) => (
              <Pressable
                key={value}
                style={[
                  styles.presetButton,
                  Math.round(currentThreshold) === value && styles.presetButtonActive,
                ]}
                onPress={() => handlePresetThreshold(value)}
                testID={`preset-${value}`}
              >
                <Text
                  style={[
                    styles.presetButtonText,
                    Math.round(currentThreshold) === value && styles.presetButtonTextActive,
                  ]}
                >
                  {value}%
                </Text>
              </Pressable>
            ))}
          </View>

          {localThreshold !== null && localThreshold !== settings?.alertThreshold && (
            <Pressable
              style={[styles.saveButton, settingsMutation.isPending && styles.saveButtonDisabled]}
              onPress={handleThresholdSave}
              disabled={settingsMutation.isPending}
              testID="save-threshold-button"
            >
              {settingsMutation.isPending ? (
                <ActivityIndicator size="small" color={C.textInverse} />
              ) : (
                <Text style={styles.saveButtonText}>Save Threshold</Text>
              )}
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="moon" size={16} color={C.accent} />
            <Text style={styles.sectionTitle}>Appearance</Text>
          </View>

          <View style={styles.themeContainer}>
            <Pressable
              style={[
                styles.themeButton,
                currentTheme === "dark" && styles.themeButtonActive,
              ]}
              onPress={() => handleThemeChange("dark")}
              testID="theme-dark-button"
            >
              <Ionicons
                name="moon"
                size={18}
                color={currentTheme === "dark" ? C.textInverse : C.text}
              />
              <Text
                style={[
                  styles.themeButtonText,
                  currentTheme === "dark" && styles.themeButtonTextActive,
                ]}
              >
                Dark
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.themeButton,
                currentTheme === "light" && styles.themeButtonActive,
              ]}
              onPress={() => handleThemeChange("light")}
              testID="theme-light-button"
            >
              <Ionicons
                name="sunny"
                size={18}
                color={currentTheme === "light" ? C.textInverse : C.text}
              />
              <Text
                style={[
                  styles.themeButtonText,
                  currentTheme === "light" && styles.themeButtonTextActive,
                ]}
              >
                Light
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person" size={16} color={C.tint} />
            <Text style={styles.sectionTitle}>Account</Text>
          </View>

          <View style={styles.accountCard}>
            <Text style={styles.accountLabel}>Username</Text>
            <Text style={styles.accountValue}>{user?.username || "Unknown"}</Text>
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
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 24,
    color: C.text,
    letterSpacing: -0.5,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 17,
    color: C.text,
  },

  thresholdCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
  },
  thresholdLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 8,
  },
  thresholdValue: {
    fontFamily: "DMSans_700Bold",
    fontSize: 48,
    color: C.tint,
    letterSpacing: -1,
    marginBottom: 12,
  },
  thresholdDescription: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 18,
  },

  sliderContainer: {
    marginBottom: 16,
  },
  slider: {
    height: 40,
    marginHorizontal: -8,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 0,
  },
  sliderLabel: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: C.textMuted,
  },

  presetsContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  presetButton: {
    flex: 1,
    minWidth: "22%" as unknown as number,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },
  presetButtonActive: {
    backgroundColor: C.tint,
    borderColor: C.tint,
  },
  presetButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: C.text,
  },
  presetButtonTextActive: {
    color: C.textInverse,
  },

  saveButton: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: C.textInverse,
  },

  themeContainer: {
    flexDirection: "row",
    gap: 12,
  },
  themeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  themeButtonActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  themeButtonText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 14,
    color: C.text,
  },
  themeButtonTextActive: {
    color: C.textInverse,
  },

  accountCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  accountLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: C.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: 8,
  },
  accountValue: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 16,
    color: C.text,
  },
});
