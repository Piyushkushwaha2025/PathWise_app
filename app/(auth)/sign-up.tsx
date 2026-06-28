import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { useSignUp, useOAuth } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import { MotiView } from "moti";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GradientButton } from "../../components/ui/GradientButton";
import { Colors, Typography, Spacing } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const colors = useThemeStore((s) => s.colors);
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Verification state
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");

  const handleOAuth = async () => {
    try {
      setLoading(true);
      setError("");
      const { createdSessionId, setActive: setOAuthActive } = await startOAuthFlow();
      if (createdSessionId && setOAuthActive) {
        await setOAuthActive({ session: createdSessionId });
        router.replace("/(app)/dashboard");
      }
    } catch (err: any) {
      console.error("OAuth error", err);
      setError(err?.errors?.[0]?.message ?? "Google Sign Up failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!isLoaded) return;
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      await signUp.create({
        firstName: name.trim(),
        emailAddress: email.trim(),
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message: string }[] };
      setError(
        clerkErr?.errors?.[0]?.message ?? "Sign up failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded || !code.trim()) return;
    setError("");
    setLoading(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(app)/dashboard");
      } else {
        setError("Verification failed. Please check the code and try again.");
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message: string }[] };
      setError(clerkErr?.errors?.[0]?.message ?? "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Gradient Orb */}
        <MotiView
          from={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "timing", duration: 900 }}
          style={styles.orbContainer}
        >
          <LinearGradient
            colors={[colors.primary, colors.accent]}
            style={styles.orb}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 500, delay: 200 }}
          style={styles.header}
        >
          <Image 
            source={require('../../assets/logo.png')} 
            style={{ width: 220, height: 60, resizeMode: 'contain', marginBottom: 8 }} 
          />
          <Text style={styles.tagline}>
            {"Your AI Learning Journey Starts Here"}
          </Text>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 500, delay: 350 }}
          style={styles.form}
        >
          {!pendingVerification ? (
            <>
              <Text style={styles.formTitle}>{"Create Account"}</Text>

              <TouchableOpacity style={styles.oauthBtn} onPress={handleOAuth} disabled={loading}>
                <Ionicons name="logo-google" size={20} color={Colors.text} />
                <Text style={styles.oauthBtnText}>Sign up with Google</Text>
              </TouchableOpacity>

              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TextInput
                style={styles.input}
                placeholder="Full name"
                placeholderTextColor={Colors.textDim}
                value={name}
                onChangeText={setName}
                returnKeyType="next"
              />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={Colors.textDim}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={Colors.textDim}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSignUp}
              />
            </>
          ) : (
            <>
              <Text style={styles.formTitle}>{"Verify Email"}</Text>
              <Text style={styles.verifyHint}>
                {"We've sent a 6-digit code to "}
                <Text style={{ color: Colors.primary }}>{email}</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Enter verification code"
                placeholderTextColor={Colors.textDim}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={handleVerify}
              />
            </>
          )}

          {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}

          <GradientButton
            label={pendingVerification ? "Verify Email" : "Create Account"}
            onPress={pendingVerification ? handleVerify : handleSignUp}
            loading={loading}
            icon={
              pendingVerification
                ? "checkmark-circle-outline"
                : "person-add-outline"
            }
            size="lg"
            style={styles.btn}
          />

          {!pendingVerification && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {"Already have an account? "}
              </Text>
              <Link href="/(auth)/sign-in" asChild>
                <TouchableOpacity>
                  <Text style={styles.footerLink}>{"Sign In"}</Text>
                </TouchableOpacity>
              </Link>
            </View>
          )}
        </MotiView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: 60,
    paddingBottom: 40,
  },
  orbContainer: { alignItems: "center", marginBottom: -40 },
  orb: { width: 200, height: 200, borderRadius: 100, opacity: 0.3 },
  header: { alignItems: "center", marginBottom: Spacing.xl },
  logo: { fontSize: 40 },
  logoBold: { ...Typography.h1, fontSize: 40, color: Colors.text },
  logoItalic: {
    ...Typography.h1,
    fontSize: 40,
    color: Colors.primary,
    fontStyle: "italic",
  },
  tagline: {
    ...Typography.small,
    color: Colors.textMuted,
    marginTop: 8,
    textAlign: "center",
  },
  form: {
    backgroundColor: "#ffffff06",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  formTitle: { ...Typography.h2, color: Colors.text, marginBottom: 4 },
  verifyHint: { ...Typography.body, color: Colors.textMuted },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    color: Colors.text,
    ...Typography.body,
  },
  errorText: { ...Typography.small, color: Colors.error },
  btn: { marginTop: 4 },
  oauthBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, gap: 10 },
  oauthBtnText: { ...Typography.body, color: Colors.text, fontWeight: "600" },
  dividerContainer: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { ...Typography.small, color: Colors.textMuted, marginHorizontal: 12 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 4 },
  footerText: { ...Typography.small, color: Colors.textMuted },
  footerLink: { ...Typography.small, color: Colors.primary, fontWeight: "600" },
});
