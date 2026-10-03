import React, { useState, useEffect, useRef } from "react";
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
import * as SplashScreen from "expo-splash-screen";
import { LegalViewerModal } from "../../components/modals/LegalViewerModal";

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const { signOut } = useAuth();
  const router = useRouter();

  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const styles = useStyles(colors);
  
  const logoSource = theme !== "black" 
    ? require("../../assets/logo-light.png") 
    : require("../../assets/logo-dark.png");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  // OAuth-specific loading — shows full-screen AppLoading overlay
  const [oauthLoading, setOauthLoading] = useState(false);

  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Normal Sign-in Verification state
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationType, setVerificationType] = useState<"first" | "second">("first");
  const [code, setCode] = useState("");

  // Forgot Password state
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<"request" | "reset">("request");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetCodeFocused, setResetCodeFocused] = useState(false);
  const [newPasswordFocused, setNewPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);

  // Resend OTP cooldown (30 seconds)
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Legal Modal State
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | 'refund' | null>(null);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startResendCooldown = () => {
    setResendCooldown(30);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleOAuth = async () => {
    try {
      setOauthLoading(true);
      setError("");
      const { createdSessionId, setActive: setOAuthActive, authSessionResult, signIn, signUp } = await startOAuthFlow({
        redirectUrl: Linking.createURL("/callback", { scheme: "pathwise" })
      });

      console.log("OAUTH RESULT:", authSessionResult, createdSessionId, signIn, signUp);

      // User cancelled or dismissed the browser — clear any partial session and stay on sign-in
      if (
        !authSessionResult ||
        authSessionResult.type === "cancel" ||
        authSessionResult.type === "dismiss"
      ) {
        console.log("OAUTH CANCELLED OR DISMISSED", authSessionResult);
        await signOut().catch(() => {});
        setOauthLoading(false);
        router.replace("/(auth)/sign-in");
        return;
      }

      const sessionId = createdSessionId || signIn?.createdSessionId || signUp?.createdSessionId;

      if (sessionId && setOAuthActive) {
        await setOAuthActive({ session: sessionId });
        // Don't turn off loading on success so the loading screen covers the navigation delay
        router.replace("/(app)/dashboard");
      } else {
        console.error("Missing session ID! Auth State:", {
           signInStatus: signIn?.status,
           signUpStatus: signUp?.status,
           unverifiedFields: signUp?.unverifiedFields,
           missingFields: signUp?.missingFields
        });
        
        const debugInfo = `Session: ${createdSessionId ? 'yes' : 'no'}. SignIn: ${signIn?.status || 'none'}. SignUp: ${signUp?.status || 'none'}. AuthResult: ${authSessionResult?.type || 'none'}.`;
        
        setError(debugInfo);
        setOauthLoading(false);
        router.replace("/(auth)/sign-in");
      }
    } catch (err: any) {
      console.error("OAuth error", err);
      // Sign out any partial session on error too
      await signOut().catch(() => {});
      
      if (err?.code === "session_exists" || err?.errors?.[0]?.code === "session_exists") {
        router.replace("/(app)/dashboard");
        return;
      }
      
      if (!err?.message?.toLowerCase().includes("cancel")) {
        setError(err?.errors?.[0]?.message ?? "Google Sign In failed.");
      }
      setOauthLoading(false);
      // If we are on the callback screen, we must replace back to sign-in
      router.replace("/(auth)/sign-in");
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

  const handleSendResetCode = async () => {
    if (!isLoaded) return;
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      setForgotStep("reset");
      setSuccessMessage("Verification code sent to your email!");
      startResendCooldown();
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message: string }[] };
      setError(
        clerkErr?.errors?.[0]?.message ?? "Could not send reset code. Please check your email."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendResetCode = async () => {
    if (!isLoaded || resendCooldown > 0 || resendLoading) return;
    setError("");
    setSuccessMessage("");
    setResendLoading(true);

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      setSuccessMessage("New verification code sent! Check your inbox.");
      startResendCooldown();
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message: string }[] };
      setError(clerkErr?.errors?.[0]?.message ?? "Failed to resend code.");
    } finally {
      setResendLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!isLoaded) return;
    if (!resetCode.trim()) {
      setError("Please enter the 6-digit verification code.");
      return;
    }
    if (!newPassword) {
      setError("Please enter a new password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: resetCode.trim(),
        password: newPassword,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(app)/dashboard");
      } else {
        setError(`Password reset incomplete. Status: ${result.status}`);
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message: string }[] };
      setError(
        clerkErr?.errors?.[0]?.message ?? "Failed to reset password. Please verify the code and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBackToSignIn = () => {
    setIsForgotPassword(false);
    setForgotStep("request");
    setResetCode("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setSuccessMessage("");
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
            {pendingVerification ? (
              // Normal Sign-in 2FA / Verification
              <>
                <Text style={styles.formTitle}>{"Verify Email"}</Text>
                <Text style={styles.subTitleText}>
                  {"We've sent a 6-digit code to "}
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>{email}</Text>
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

                {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}

                <GradientButton
                  label="Verify Email"
                  onPress={handleVerify}
                  loading={loading}
                  icon="checkmark-circle-outline"
                  size="lg"
                  style={styles.btn}
                />
              </>
            ) : isForgotPassword ? (
              // Forgot Password Flow
              forgotStep === "request" ? (
                <>
                  <Text style={styles.formTitle}>{"Reset Password"}</Text>
                  <Text style={styles.subTitleText}>
                    {"Enter your registered email address and we'll send you a 6-digit code to reset your password."}
                  </Text>

                  <TextInput
                    style={[styles.input, emailFocused && styles.inputFocused]}
                    placeholder="Email address"
                    placeholderTextColor={colors.textDim}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    returnKeyType="done"
                    onSubmitEditing={handleSendResetCode}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                  />

                  {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}
                  {successMessage.length > 0 && (
                    <Text style={styles.successText}>{successMessage}</Text>
                  )}

                  <GradientButton
                    label="Send Reset Code"
                    onPress={handleSendResetCode}
                    loading={loading}
                    icon="mail-outline"
                    size="lg"
                    style={styles.btn}
                  />

                  <TouchableOpacity
                    style={styles.backToSignInBtn}
                    onPress={handleBackToSignIn}
                    disabled={loading}
                  >
                    <Ionicons name="arrow-back" size={16} color={colors.primary} />
                    <Text style={styles.backToSignInText}>Back to Sign In</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.formTitle}>{"Set New Password"}</Text>
                  <Text style={styles.subTitleText}>
                    {"Enter the 6-digit code sent to "}
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>{email}</Text>
                    {" and choose a new password."}
                  </Text>

                  <TextInput
                    style={[styles.input, resetCodeFocused && styles.inputFocused]}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor={colors.textDim}
                    value={resetCode}
                    onChangeText={setResetCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    returnKeyType="next"
                    onFocus={() => setResetCodeFocused(true)}
                    onBlur={() => setResetCodeFocused(false)}
                  />

                  {/* Resend Code Button */}
                  <TouchableOpacity
                    style={[
                      styles.resendBtn,
                      (resendCooldown > 0 || resendLoading) && { opacity: 0.5 },
                    ]}
                    onPress={handleResendResetCode}
                    disabled={resendCooldown > 0 || resendLoading}
                  >
                    <Ionicons name="refresh-outline" size={15} color={colors.primary} />
                    <Text style={styles.resendBtnText}>
                      {resendLoading
                        ? "Sending..."
                        : resendCooldown > 0
                        ? `Resend code in ${resendCooldown}s`
                        : "Resend code"}
                    </Text>
                  </TouchableOpacity>

                  {/* New Password Input */}
                  <View
                    style={[
                      styles.inputWrapper,
                      newPasswordFocused && styles.inputFocused,
                    ]}
                  >
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="New password (min 8 chars)"
                      placeholderTextColor={colors.textDim}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      returnKeyType="next"
                      onFocus={() => setNewPasswordFocused(true)}
                      onBlur={() => setNewPasswordFocused(false)}
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPassword(!showNewPassword)}
                      style={styles.eyeIcon}
                    >
                      <Ionicons
                        name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={colors.textDim}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Confirm New Password Input */}
                  <View
                    style={[
                      styles.inputWrapper,
                      confirmPasswordFocused && styles.inputFocused,
                    ]}
                  >
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Confirm new password"
                      placeholderTextColor={colors.textDim}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      returnKeyType="done"
                      onSubmitEditing={handleResetPassword}
                      onFocus={() => setConfirmPasswordFocused(true)}
                      onBlur={() => setConfirmPasswordFocused(false)}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={styles.eyeIcon}
                    >
                      <Ionicons
                        name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={colors.textDim}
                      />
                    </TouchableOpacity>
                  </View>

                  {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}
                  {successMessage.length > 0 && (
                    <Text style={styles.successText}>{successMessage}</Text>
                  )}

                  <GradientButton
                    label="Reset Password & Sign In"
                    onPress={handleResetPassword}
                    loading={loading}
                    icon="checkmark-circle-outline"
                    size="lg"
                    style={styles.btn}
                  />

                  <TouchableOpacity
                    style={styles.backToSignInBtn}
                    onPress={handleBackToSignIn}
                    disabled={loading}
                  >
                    <Ionicons name="arrow-back" size={16} color={colors.primary} />
                    <Text style={styles.backToSignInText}>Back to Sign In</Text>
                  </TouchableOpacity>
                </>
              )
            ) : (
              // Normal Sign In
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

                {/* Forgot Password Button */}
                <TouchableOpacity
                  style={styles.forgotPasswordContainer}
                  onPress={() => {
                    setError("");
                    setSuccessMessage("");
                    setIsForgotPassword(true);
                    setForgotStep("request");
                  }}
                >
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>

                {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}

                <GradientButton
                  label="Sign In with Email"
                  onPress={handleSignIn}
                  loading={loading}
                  icon="log-in-outline"
                  size="lg"
                  style={styles.btn}
                />

                <View style={styles.footer}>
                  <Text style={styles.footerText}>{"Don't have an account? "}</Text>
                  <Link href="/(auth)/sign-up" asChild>
                    <TouchableOpacity>
                      <Text style={styles.footerLink}>{"Sign Up"}</Text>
                    </TouchableOpacity>
                  </Link>
                </View>

                <View style={styles.legalNoticeContainer}>
                  <Text style={styles.legalNoticeText}>
                    By continuing, you agree to our{' '}
                    <Text
                      style={styles.legalLink}
                      onPress={() => setLegalModalType('terms')}
                    >
                      Terms of Service
                    </Text>
                    {' '}and{' '}
                    <Text
                      style={styles.legalLink}
                      onPress={() => setLegalModalType('privacy')}
                    >
                      Privacy Policy
                    </Text>.
                  </Text>
                </View>
              </>
            )}
          </GlassCard>
        </MotiView>

        <LegalViewerModal
          visible={!!legalModalType}
          type={legalModalType}
          onClose={() => setLegalModalType(null)}
        />
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
  subTitleText: {
    ...Typography.body,
    color: colors.textDim,
    marginBottom: 4,
    lineHeight: 20,
  },
  forgotPasswordContainer: {
    alignSelf: "flex-end",
    marginTop: -4,
    marginBottom: 2,
    paddingVertical: 4,
  },
  forgotPasswordText: {
    ...Typography.small,
    color: colors.primary,
    fontWeight: "600",
  },
  resendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    paddingVertical: 4,
    marginTop: -4,
  },
  resendBtnText: {
    ...Typography.small,
    color: colors.primary,
    fontWeight: "600",
  },
  backToSignInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  backToSignInText: {
    ...Typography.small,
    color: colors.primary,
    fontWeight: "600",
  },
  successText: {
    ...Typography.small,
    color: "#10b981",
    textAlign: "center",
    fontWeight: "500",
  },
  legalNoticeContainer: {
    marginTop: 10,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  legalNoticeText: {
    ...Typography.small,
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  legalLink: {
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
