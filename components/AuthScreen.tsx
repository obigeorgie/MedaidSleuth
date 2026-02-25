import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import Colors from "@/constants/colors";

const C = Colors.light;

interface AuthScreenProps {
  initialMode?: "login" | "register";
  onBack?: () => void;
}

export default function AuthScreen({ initialMode = "login", onBack }: AuthScreenProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { login, register, loginError, registerError, isLoggingIn, isRegistering } = useAuth();

  const isSubmitting = isLoggingIn || isRegistering;
  const serverError = mode === "login" ? loginError : registerError;

  const handleSubmit = async () => {
    setLocalError(null);

    if (!username.trim() || !password.trim()) {
      setLocalError("Please fill in all fields");
      return;
    }

    if (mode === "register") {
      if (username.trim().length < 3) {
        setLocalError("Username must be at least 3 characters");
        return;
      }
      if (password.length < 6) {
        setLocalError("Password must be at least 6 characters");
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("Passwords do not match");
        return;
      }
    }

    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
    } catch {}
  };

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setLocalError(null);
    setPassword("");
    setConfirmPassword("");
  };

  const error = localError || serverError;

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <LinearGradient
      colors={[C.background, C.gradient2, C.background]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + webTopInset + 40,
              paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 40,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {onBack ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.backRow}>
              <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7} testID="auth-back-button">
                <Ionicons name="arrow-back" size={20} color={C.text} />
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeIn.duration(600)} style={styles.logoSection}>
            <Image
              source={require("@/assets/images/logo-dark.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>Fraud Detection Intelligence</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.formCard}>
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, mode === "login" && styles.tabActive]}
                onPress={() => mode !== "login" && switchMode()}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, mode === "register" && styles.tabActive]}
                onPress={() => mode !== "register" && switchMode()}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, mode === "register" && styles.tabTextActive]}>
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <Animated.View entering={FadeIn.duration(300)} style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={C.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Username</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color={C.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter username"
                  placeholderTextColor={C.textMuted}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSubmitting}
                  testID="username-input"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={C.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter password"
                  placeholderTextColor={C.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!isSubmitting}
                  testID="password-input"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={C.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {mode === "register" && (
              <Animated.View entering={FadeInDown.duration(300)} style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={C.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm password"
                    placeholderTextColor={C.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!isSubmitting}
                    testID="confirm-password-input"
                  />
                </View>
              </Animated.View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
              testID="submit-button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={C.textInverse} size="small" />
              ) : (
                <>
                  <Text style={styles.submitText}>
                    {mode === "login" ? "Sign In" : "Create Account"}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={C.textInverse} />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={switchMode} style={styles.switchRow} activeOpacity={0.7}>
              <Text style={styles.switchText}>
                {mode === "login" ? "Need an account?" : "Already have an account?"}
              </Text>
              <Text style={styles.switchLink}>
                {mode === "login" ? "Sign up" : "Sign in"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 36,
  },
  logoImage: {
    width: 260,
    height: 90,
    marginBottom: 8,
  },
  tagline: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: C.textSecondary,
    marginTop: 4,
  },
  formCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: C.background,
    borderRadius: 10,
    padding: 3,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: C.surfaceElevated,
  },
  tabText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: C.textMuted,
  },
  tabTextActive: {
    color: C.text,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.dangerBg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.dangerLight,
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    color: C.textSecondary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: C.text,
    paddingVertical: 14,
  },
  eyeIcon: {
    padding: 4,
  },
  submitButton: {
    backgroundColor: C.tint,
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 15,
    color: C.textInverse,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    gap: 4,
  },
  switchText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: C.textSecondary,
  },
  switchLink: {
    fontFamily: "DMSans_600SemiBold",
    fontSize: 13,
    color: C.tint,
  },
  backRow: {
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingRight: 12,
  },
  backText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 15,
    color: C.text,
  },
});
