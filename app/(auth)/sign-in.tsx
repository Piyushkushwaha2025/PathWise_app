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
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useRouter, Link } from "expo-router";
import { useSignIn, useOAuth, useAuth } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import { BlurView } from "expo-blur";
import * as Linking from "expo-linking";
import { MotiView } from "moti";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GradientButton } from "../../components/ui/GradientButton";
import { Typography, Spacing } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import { GlassCard } from "../../components/ui/GlassCard";
import AppLoading from "../../components/AppLoading";

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const { signOut } = useAuth();
  const router = useRouter();

  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const styles = useStyles(colors);
  
  const logoSource = theme === "white" || theme === "cream" 
    ? require("../../assets/logo-light.png") 
    : require("../../assets/logo-dark.png");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // OAuth-specific loading — shows full-screen AppLoading overlay
  const [oauthLoading, setOauthLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Verification state
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationType, setVerificationType] = useState<"first" | "second">("first");
  const [code, setCode] = useState("");

  const handleOAuth = async () => {
    try {
      setOauthLoading(true);
      setError("");
      const { createdSessionId, setActive: setOAuthActive, authSessionResult } = await startOAuthFlow({
        redirectUrl: Linking.createURL("/(auth)/sign-in", { scheme: "pathwise" })
      });

      // User cancelled or dismissed the browser — clear any partial session and stay on sign-in
      if (
        !authSessionResult ||
        authSessionResult.type === "cancel" ||
        authSessionResult.type === "dismiss"
      ) {
        await signOut().catch(() => {});
        setOauthLoading(false);
        return;
      }

      if (createdSessionId && setOAuthActive) {
        await setOAuthActive({ session: createdSessionId });
        // Don't turn off loading on success so the loading screen covers the navigation delay
        router.replace("/(app)/dashboard");
      } else {
        setOauthLoading(false);
      }
    } catch (err: any) {
      console.error("OAuth error", err);
      // Sign out any partial session on error too
      await signOut().catch(() => {});
      if (err?.code !== "session_exists" && !err?.message?.toLowerCase().includes("cancel")) {
        setError(err?.errors?.[0]?.message ?? "Google Sign In failed.");
      }
      setOauthLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded || !code.trim()) return;
    setError("");
    setLoading(true);

    try {
      let result;
      if (verificationType === "first") {
        result = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code: code.trim(),
        });
      } else {
        result = await signIn.attemptSecondFactor({
          strategy: "email_code",
          code: code.trim(),
        });
      }
      
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(app)/dashboard");
      } else {
        setError(`Verification incomplete. Status: ${result.status}`);
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message: string }[] };
      setError(clerkErr?.errors?.[0]?.message ?? "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (!isLoaded) return;
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(app)/dashboard");
      } else if (result.status === "needs_first_factor") {
        const emailFactor = result.supportedFirstFactors?.find(
          (f) => f.strategy === "email_code",
        );
        if (emailFactor && "emailAddressId" in emailFactor) {
          await signIn.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          });
          setVerificationType("first");
          setPendingVerification(true);
        } else {
          setError("Email verification required but not supported.");
        }
      } else if ((result.status as any) === "needs_client_trust" || result.status === "needs_second_factor") {
        const emailFactor = result.supportedSecondFactors?.find(
          (f) => f.strategy === "email_code",
        );
        if (emailFactor) {
          await signIn.prepareSecondFactor({
            strategy: "email_code",
          });
          setVerificationType("second");
          setPendingVerification(true);
        } else {
          setError("Device verification required but not supported.");
        }
      } else {
        setError(`Sign in incomplete. Status: ${result.status}`);
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message: string }[] };
      setError(
        clerkErr?.errors?.[0]?.message ?? "Sign in failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Show branded loading screen while Google OAuth is processing
  if (oauthLoading) return <AppLoading />;

  return (
    <KeyboardAwareScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      enableOnAndroid={true}
      extraScrollHeight={20}
      keyboardShouldPersistTaps="handled"
    >
      {/* Logo & Tagline */}
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 500, delay: 200 }}
          style={styles.header}
        >
          <Image source={logoSource} style={styles.appLogo} resizeMode="contain" />
          <Text style={styles.logoText}>
            <Text style={styles.logoBold}>PATH</Text>
            <Text style={styles.logoItalic}>wise</Text>
          </Text>
          <Text style={styles.tagline}>Learn Smarter. Level Up Faster.</Text>
        </MotiView>

        {/* Form Wrapped in GlassCard */}
        <MotiView
          from={{ opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 500, delay: 350 }}
        >
          <GlassCard style={styles.form}>
            {!pendingVerification ? (
              <>
                <Text style={styles.formTitle}>{"Welcome back"}</Text>

                <TouchableOpacity style={styles.oauthBtn} onPress={handleOAuth} disabled={loading}>
                  <Ionicons name="logo-google" size={20} color={colors.text} />
                  <Text style={styles.oauthBtnText} numberOfLines={1} adjustsFontSizeToFit>Sign in with Google</Text>
                </TouchableOpacity>

                <View style={styles.dividerContainer}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TextInput
                  style={[styles.input, emailFocused && styles.inputFocused]}
                  placeholder="Email address"
                  placeholderTextColor={colors.textDim}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                />

                {/* Password Input with Show/Hide Toggle */}
                <View style={[styles.inputWrapper, passwordFocused && styles.inputFocused]}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Password"
                    placeholderTextColor={colors.textDim}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleSignIn}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textDim} />
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.formTitle}>{"Verify Email"}</Text>
                <Text
                  style={{
                    ...Typography.body,
                    color: colors.textDim,
                    marginBottom: 8,
                  }}
                >
                  {"We've sent a 6-digit code to "}
                  <Text style={{ color: colors.primary }}>{email}</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter verification code"
                  placeholderTextColor={colors.textDim}
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
              label={pendingVerification ? "Verify Email" : "Sign In with Email"}
              onPress={pendingVerification ? handleVerify : handleSignIn}
              loading={loading}
              icon={
                pendingVerification
                  ? "checkmark-circle-outline"
                  : "log-in-outline"
              }
              size="lg"
              style={styles.btn}
            />

            {!pendingVerification && (
              <View style={styles.footer}>
                <Text style={styles.footerText}>{"Don't have an account? "}</Text>
                <Link href="/(auth)/sign-up" asChild>
                  <TouchableOpacity>
                    <Text style={styles.footerLink}>{"Sign Up"}</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            )}
          </GlassCard>
        </MotiView>
      </KeyboardAwareScrollView>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: { alignItems: "center", marginBottom: Spacing.xl },
  appLogo: { width: 120, height: 120, borderRadius: 28, marginBottom: 12 },
  logoText: { fontSize: 32, textAlign: "center" },
  logoBold: { ...Typography.h1, fontSize: 32, color: colors.text },
  logoItalic: {
    ...Typography.h1,
    fontSize: 32,
    color: colors.primary,
    fontStyle: "italic",
  },
  tagline: {
    ...Typography.small,
    color: colors.textDim,
    marginTop: 4,
    letterSpacing: 2,
    textTransform: "uppercase",
    textAlign: "center"
  },
  form: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  formTitle: { ...Typography.h2, color: colors.text, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    color: colors.text,
    ...Typography.body,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    color: colors.text,
    ...Typography.body,
  },
  eyeIcon: {
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  inputFocused: { borderColor: colors.primary },
  errorText: { ...Typography.small, color: "#ff4444" },
  btn: { marginTop: 4 },
  oauthBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, gap: 10 },
  oauthBtnText: { ...Typography.body, color: colors.text, fontWeight: "600" },
  dividerContainer: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...Typography.small, color: colors.textDim, marginHorizontal: 12 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 4 },
  footerText: { ...Typography.small, color: colors.textDim },
  footerLink: { ...Typography.small, color: colors.primary, fontWeight: "600" },
});
