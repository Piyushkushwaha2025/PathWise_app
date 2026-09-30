import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useRouter, Link } from "expo-router";
import { useSignUp, useSignIn, useOAuth, useAuth } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import { MotiView } from "moti";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { GradientButton } from "../../components/ui/GradientButton";
import { Colors, Typography, Spacing } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import AppLoading from "../../components/AppLoading";
import { LegalViewerModal } from "../../components/modals/LegalViewerModal";

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const { signIn } = useSignIn();
  const theme = useThemeStore((s) => s.theme);
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const { signOut } = useAuth();
  const router = useRouter();

  const logoSource = theme !== "black"
    ? require("../../assets/logo-light.png")
    : require("../../assets/logo-dark.png");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  // Verification state
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");

  // Resend OTP cooldown (30 seconds)
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Legal Agreement State
  const [agreedToTerms, setAgreedToTerms] = useState(false);
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
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleOAuth = async () => {
    if (!agreedToTerms) {
      setError("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    try {
      setOauthLoading(true);
      setError("");
      const { createdSessionId, setActive: setOAuthActive, authSessionResult } = await startOAuthFlow({
        redirectUrl: Linking.createURL("/(auth)/sign-up", { scheme: "pathwise" })
      });

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
        router.replace("/(app)/dashboard");
      } else {
        setOauthLoading(false);
      }
    } catch (err: any) {
      console.error("OAuth error", err);
      await signOut().catch(() => {});
      if (err?.code !== "session_exists" && !err?.message?.toLowerCase().includes("cancel")) {
        setError(err?.errors?.[0]?.message ?? "Google Sign Up failed.");
      }
      setOauthLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!isLoaded) return;
    if (!agreedToTerms) {
      setError("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Please fill in email and password.");
      return;
    }
    setError("");
    setLoading(true);

    const trimmedName = name.trim();
    const fallbackName = email.trim().split('@')[0] || "Student";
    const effectiveName = trimmedName || fallbackName;
    const nameParts = effectiveName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || effectiveName;
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

    try {
      await signUp.create({
        firstName,
        ...(lastName ? { lastName } : {}),
        emailAddress: email.trim(),
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
      startResendCooldown(); // Start 30s cooldown when OTP is first sent
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message: string }[] };
      setError(
        clerkErr?.errors?.[0]?.message ?? "Sign up failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!isLoaded || resendCooldown > 0 || resendLoading) return;
    setResendLoading(true);
    setError("");
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      startResendCooldown();
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message: string }[] };
      setError(clerkErr?.errors?.[0]?.message ?? "Failed to resend code. Please try again.");
    } finally {
      setResendLoading(false);
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

      // If last_name was missing on a previously created sign-up, supply it now
      if (result.status === "missing_requirements") {
        const missing = (result as any).missingFields || [];
        if (missing.includes("last_name") || missing.includes("lastName")) {
          const nameParts = name.trim().split(/\s+/);
          const fallbackLastName = nameParts.slice(1).join(" ") || nameParts[0] || "-";
          try {
            await signUp.update({ lastName: fallbackLastName });
          } catch {}
        }
      }

      // 1. Primary Success Path: Status complete or session created
      const activeSessionId = result.createdSessionId || signUp.createdSessionId;
      if (activeSessionId) {
        await setActive({ session: activeSessionId });
        router.replace("/(app)/dashboard");
        return;
      }

      if (result.status === "complete" || signUp.status === "complete") {
        if (activeSessionId) {
          await setActive({ session: activeSessionId });
          router.replace("/(app)/dashboard");
          return;
        }
      }

      // 2. Email verification succeeded but session ID not attached directly
      // Auto-sign in with the verified email and password
      if (
        result.status === "complete" ||
        result.verifications?.emailAddress?.status === "verified" ||
        signUp.verifications?.emailAddress?.status === "verified"
      ) {
        if (signIn && email && password) {
          try {
            const signInResult = await signIn.create({
              identifier: email.trim(),
              password,
            });
            if (signInResult.status === "complete" && signInResult.createdSessionId) {
              await setActive({ session: signInResult.createdSessionId });
              router.replace("/(app)/dashboard");
              return;
            }
          } catch {
            // fall through
          }
        }
      }

      // 3. Fallback: Try sign-in in case Clerk completed verification on the server
      if (signIn && email && password) {
        try {
          const signInResult = await signIn.create({
            identifier: email.trim(),
            password,
          });
          if (signInResult.status === "complete" && signInResult.createdSessionId) {
            await setActive({ session: signInResult.createdSessionId });
            router.replace("/(app)/dashboard");
            return;
          }
        } catch {
          // fall through to error
        }
      }

      setError("Verification failed. Please check the code and try again.");
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { code?: string; message: string }[] };
      const errCode = clerkErr?.errors?.[0]?.code ?? "";
      const errMsg = clerkErr?.errors?.[0]?.message ?? "";

      // ── "Already verified" scenario ─────────────────────────────────────────
      // This happens when: first OTP attempt actually verified the account but
      // Clerk threw an error anyway (race condition / network blip), and user
      // hits submit again. We must NOT send them to sign-in — instead silently
      // complete the session using one of three fallback strategies.
      const isAlreadyVerified =
        errCode === "form_identifier_already_verified" ||
        errCode === "is_already_verified" ||
        errCode === "session_exists" ||
        errMsg.toLowerCase().includes("already verified") ||
        errMsg.toLowerCase().includes("already been verified") ||
        errMsg.toLowerCase().includes("is already verified");

      if (isAlreadyVerified) {
        // Strategy 1: signUp object may still have the createdSessionId
        if (signUp?.createdSessionId) {
          try {
            await setActive({ session: signUp.createdSessionId });
            router.replace("/(app)/dashboard");
            return;
          } catch {
            // fall through to next strategy
          }
        }

        // Strategy 2: Auto-sign-in using the credentials they just registered with
        // This is the most reliable path — email is verified so sign-in will succeed
        if (signIn && email && password) {
          try {
            const signInResult = await signIn.create({
              identifier: email.trim(),
              password,
            });
            if (signInResult.status === "complete" && signInResult.createdSessionId) {
              await setActive({ session: signInResult.createdSessionId });
              router.replace("/(app)/dashboard");
              return;
            }
          } catch {
            // fall through to last resort
          }
        }

        // Strategy 3: Last resort — redirect to sign-in with a success message
        // (not an error — their account IS created and verified)
        setError("Account verified! Please sign in with your credentials.");
        setTimeout(() => router.replace("/(auth)/sign-in"), 1500);
        return;
      }

      setError(errMsg || "Verification failed. Please try again.");
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

        <MotiView
          from={{ opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 500, delay: 350 }}
          style={styles.form}
        >
          {!pendingVerification ? (
            <>
              <Text style={styles.formTitle}>{"Create Account"}</Text>

              <TouchableOpacity
                style={[styles.oauthBtn, !agreedToTerms && { opacity: 0.6 }]}
                onPress={handleOAuth}
                disabled={loading}
              >
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
                placeholder="Full name (optional)"
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

              {/* Terms & Privacy Agreement Checkbox */}
              <View style={styles.agreementRow}>
                <TouchableOpacity
                  style={styles.checkboxTouch}
                  onPress={() => setAgreedToTerms(!agreedToTerms)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={[styles.checkboxBox, agreedToTerms && styles.checkboxBoxChecked]}>
                    {agreedToTerms && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                </TouchableOpacity>
                <Text style={styles.agreementText}>
                  I agree to the{' '}
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
                  </Text>
                </Text>
              </View>
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
                autoFocus
              />

              {/* Resend OTP Button */}
              <TouchableOpacity
                style={[styles.resendBtn, (resendCooldown > 0 || resendLoading) && { opacity: 0.5 }]}
                onPress={handleResendOTP}
                disabled={resendCooldown > 0 || resendLoading}
              >
                <Ionicons name="refresh-outline" size={15} color={Colors.primary} />
                <Text style={styles.resendBtnText}>
                  {resendLoading
                    ? "Sending..."
                    : resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : "Resend code"}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {error.length > 0 && <Text style={styles.errorText}>{error}</Text>}

          <GradientButton
            label={pendingVerification ? "Verify Email" : "Create Account"}
            onPress={pendingVerification ? handleVerify : handleSignUp}
            loading={loading}
            disabled={!pendingVerification && !agreedToTerms}
            icon={
              pendingVerification
                ? "checkmark-circle-outline"
                : "person-add-outline"
            }
            size="lg"
            style={(!pendingVerification && !agreedToTerms) ? { ...styles.btn, opacity: 0.5 } : styles.btn}
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

        <LegalViewerModal
          visible={!!legalModalType}
          type={legalModalType}
          onClose={() => setLegalModalType(null)}
        />
      </KeyboardAwareScrollView>
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
  header: { alignItems: "center", marginBottom: Spacing.xl },
  appLogo: { width: 120, height: 120, borderRadius: 28, marginBottom: 12 },
  logoText: { fontSize: 32, textAlign: "center" },
  logoBold: { ...Typography.h1, fontSize: 32, color: Colors.text },
  logoItalic: {
    ...Typography.h1,
    fontSize: 32,
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
  resendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  resendBtnText: {
    ...Typography.small,
    color: Colors.primary,
    fontWeight: '600',
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
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
    gap: 10,
  },
  checkboxTouch: {
    padding: 2,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  agreementText: {
    ...Typography.small,
    color: Colors.textMuted,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  legalLink: {
    color: Colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
