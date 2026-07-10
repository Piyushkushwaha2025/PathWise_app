import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Linking,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { NotificationsBottomSheet } from "../../components/modals/NotificationsBottomSheet";
import { UpToDateModal } from "../../components/modals/UpToDateModal";
import { ChangePasswordModal } from "../../components/modals/ChangePasswordModal";
import { useNotificationStore } from "../../store/useNotificationStore";
import { useUser, useClerk } from "@clerk/clerk-expo";
import { MotiView } from "moti";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SmoothSheet } from "../../components/ui/SmoothSheet";
import * as ImagePicker from "expo-image-picker";
import { GlassCard } from "../../components/ui/GlassCard";
import { GradientButton } from "../../components/ui/GradientButton";
import { useEnrollments } from "../../hooks/useEnrollments";
import { useProgress } from "../../hooks/useProgress";
import { useStats } from "../../hooks/useStats";
import { useFeedback } from "../../hooks/useFeedback";
import { useDownloadCount } from "../../hooks/useDownloadCount";
import { useRoadmapsCatalog, useRoadmaps } from "../../hooks/useRoadmaps";
import { Typography, Spacing } from "../../constants/theme";
import { useThemeStore, ThemeType } from "../../store/useThemeStore";
import { useUpdateStore } from "../../store/useUpdateStore";
import { validateNameInput, validateFeedback, sanitizeString, MAX_NAME_LENGTH, MAX_FEEDBACK_LENGTH } from "../../lib/validation";

type SubBadge = "FREE" | "PRO" | "ELITE";

const SUB_COLORS: Record<SubBadge, [string, string]> = {
  FREE: ["#374151", "#1f2937"],
  PRO: ["#3b82f6", "#1d4ed8"],
  ELITE: ["#8b5cf6", "#6d28d9"],
};

function SubscriptionBadge({ tier }: { tier: SubBadge }) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  return (
    <LinearGradient
      colors={SUB_COLORS[tier]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.subBadge}
    >
      <Text style={styles.subBadgeText}>{tier}</Text>
    </LinearGradient>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();

  const colors = useThemeStore((s) => s.colors);
  const currentTheme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setPrimaryColor = useThemeStore((s) => s.setPrimaryColor);
  const styles = useStyles(colors);

  const ACCENT_COLORS = [
    { name: "Blue", hex: "#3b82f6" },
    { name: "Indigo", hex: "#6366f1" },
    { name: "Purple", hex: "#a855f7" },
    { name: "Pink", hex: "#ec4899" },
    { name: "Rose", hex: "#f43f5e" },
    { name: "Amber", hex: "#f59e0b" },
    { name: "Emerald", hex: "#10b981" },
    { name: "Cyan", hex: "#06b6d4" },
  ];

  const { data: enrolledIds = [] } = useEnrollments();
  const { data: progress = {} } = useProgress();
  const { data: statsData } = useStats();
  const { data: catalog = [] } = useRoadmapsCatalog();
  const { data: customRoadmaps = [] } = useRoadmaps();
  const feedbackMutation = useFeedback();
  const downloadCount = useDownloadCount();
  const { checkForUpdates, currentVersion } = useUpdateStore();

  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [phone, setPhone] = useState((user?.unsafeMetadata?.phone as string) || "");
  const [selectedTheme, setSelectedTheme] = useState<ThemeType>(currentTheme);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [isUpdatingImage, setIsUpdatingImage] = useState(false);
  const [isNotificationsVisible, setNotificationsVisible] = useState(false);
  const [isUpToDateModalVisible, setUpToDateModalVisible] = useState(false);
  const [isChangePasswordVisible, setChangePasswordVisible] = useState(false);

  // Stats Data
  const { totalCompletedTopics, totalXp } = React.useMemo(() => {
    const totalTopics = Object.values(progress).reduce(
      (acc, arr) => acc + arr.length,
      0,
    );
    return {
      totalCompletedTopics: totalTopics,
      totalXp: totalTopics * 50
    };
  }, [progress]);

  const currentStreak = statsData?.signedIn
    ? Math.floor(statsData.signedIn / 10) + 1
    : 1;

  // Calculate Fully Completed Roadmaps
  const allRoadmaps = React.useMemo(() => [...catalog, ...customRoadmaps], [catalog, customRoadmaps]);
  
  // Determine Subscription Tier from Clerk User Metadata
  const userTier = (user?.publicMetadata?.subscriptionTier as SubBadge) || (user?.unsafeMetadata?.subscriptionTier as SubBadge) || "FREE";

  const completedRoadmapsCount = React.useMemo(() => {
    let count = 0;
    enrolledIds.forEach((id) => {
      const roadmap = allRoadmaps.find((r) => r.id === id || r._id === id);
      if (!roadmap) return;
      const saved = progress[id] || [];
      const completedSet = new Set(saved);
      let total = 0;
      let done = 0;
      roadmap.modules?.forEach((m: any) => {
        m.topics?.forEach((t: any) => {
          const items = t.objectives || t.problems || [];
          items.forEach((obj: any) => {
            total++;
            const title = typeof obj === "object" ? obj.title : obj;
            if (completedSet.has(title)) done++;
          });
        });
      });
      if (total > 0 && done >= total) {
        count++;
      }
    });
    return count;
  }, [enrolledIds, allRoadmaps, progress]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch (e) {
      Alert.alert("Error", "Failed to sign out");
    }
  };

  const handleEditPicture = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setIsUpdatingImage(true);
        const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await user?.setProfileImage({ file: base64 });
      }
    } catch (e) {
      Alert.alert("Error", "Failed to update profile picture.");
    } finally {
      setIsUpdatingImage(false);
    }
  };

  const handleSaveSettings = async () => {
    const firstNameValidation = validateNameInput(firstName);
    if (!firstNameValidation.valid) {
      Alert.alert("Error", firstNameValidation.message);
      return;
    }

    if (lastName && lastName.length > MAX_NAME_LENGTH) {
      Alert.alert("Error", "Last name is too long");
      return;
    }

    setIsUpdatingSettings(true);
    try {
      await user?.update({
        firstName: sanitizeString(firstName),
        lastName: sanitizeString(lastName),
        unsafeMetadata: {
          ...user.unsafeMetadata,
          phone,
        }
      });
      setSettingsVisible(false);
    } catch (e: any) {
      if (__DEV__) {
        console.warn("Save Settings Error:", e);
      }
      Alert.alert("Profile Update", e.errors?.[0]?.message || "Could not save profile info.");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleThemeSelect = (t: ThemeType) => {
    setSelectedTheme(t);
    setTheme(t);
    user?.update({
      unsafeMetadata: {
        ...user.unsafeMetadata,
        theme: t
      }
    }).catch(() => {});
  };

  const handleColorSelect = (c: string) => {
    setPrimaryColor(c);
    user?.update({
      unsafeMetadata: {
        ...user.unsafeMetadata,
        primaryColor: c
      }
    }).catch(() => {});
  };

  const handleSubmitFeedback = async () => {
    const validation = validateFeedback(feedbackText);
    if (!validation.valid) {
      Alert.alert("Error", validation.message);
      return;
    }

    try {
      const sanitizedFeedback = sanitizeString(feedbackText.trim());
      await feedbackMutation.mutateAsync({
        name: user?.fullName || "User",
        content: sanitizedFeedback,
        rating: 5,
      });
      setFeedbackVisible(false);
      setFeedbackText("");
      Alert.alert("Success", "Thank you for your feedback!");
    } catch (e) {
      Alert.alert("Error", "Failed to send feedback.");
    }
  };

  const stats = [
    {
      label: "Total XP",
      value: totalXp.toLocaleString(),
      icon: "⚡",
      color: colors.xpGold,
    },
    {
      label: "Day Streak",
      value: String(currentStreak),
      icon: "🔥",
      color: colors.warning,
    },
    {
      label: "Enrolled",
      value: String(enrolledIds.length),
      icon: "🗺️",
      color: colors.primary,
    },
    {
      label: "Completed",
      value: String(completedRoadmapsCount),
      icon: "✅",
      color: colors.success,
    },
  ];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Avatar Section */}
        <MotiView
          from={{ opacity: 0, translateY: -10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400 }}
          style={styles.avatarSection}
        >
          <TouchableOpacity
            onPress={handleEditPicture}
            style={styles.avatarContainer}
            disabled={isUpdatingImage}
          >
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
            ) : (
              <View
                style={[
                  styles.avatarPlaceholder,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={styles.avatarInitial}>
                  {user?.firstName?.[0] || "U"}
                </Text>
              </View>
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={styles.nameContainer}>
            <Text style={styles.name}>{user?.fullName ?? "Learner"}</Text>
          </View>

          <Text style={styles.email}>
            {user?.primaryEmailAddress?.emailAddress ?? ""}
          </Text>
          <SubscriptionBadge tier={userTier} />
        </MotiView>

        {/* Stats Grid */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 100 }}
        >
          <Text style={styles.sectionTitle}>{"Your Stats"}</Text>
          <View style={styles.statsGrid}>
            {stats.map((s, i) => (
              <MotiView
                key={s.label}
                from={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 60 }}
                style={{ width: "48%" }}
              >
                <GlassCard style={styles.statCard}>
                  <Text style={styles.statIcon}>{s.icon}</Text>
                  <Text style={[styles.statValue, { color: s.color }]}>
                    {s.value}
                  </Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </GlassCard>
              </MotiView>
            ))}
          </View>
        </MotiView>

        {/* Account */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 200 }}
        >
          <Text style={styles.sectionTitle}>{"Account"}</Text>

          <GlassCard style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setFirstName(user?.firstName || "");
                setLastName(user?.lastName || "");
                setPhone((user?.unsafeMetadata?.phone as string) || "");
                setSelectedTheme(currentTheme);
                setSettingsVisible(true);
              }}
            >
              <Ionicons
                name="person-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>{"Edit Profile"}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setChangePasswordVisible(true)}
            >
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>{"Change Password"}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push("/(app)/subscription")}
            >
              <Ionicons
                name="diamond-outline"
                size={20}
                color={colors.accent}
              />
              <Text style={styles.menuLabel}>
                {"Manage Subscription (Explorer)"}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setNotificationsVisible(true)}
            >
              <Ionicons
                name="notifications-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>{"Notification Settings"}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={async () => {
                const hasUpdate = await checkForUpdates(true);
                if (!hasUpdate) {
                  setUpToDateModalVisible(true);
                }
              }}
            >
              <Ionicons
                name="cloud-download-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>{"Check for Updates"}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setFeedbackVisible(true)}
            >
              <Ionicons
                name="chatbubble-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>{"Send Feedback"}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                Linking.openURL("https://github.com/Piyushkushwaha2025/PathWise_app/releases/latest");
              }}
            >
              <Ionicons
                name="logo-android"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>{"Download App (APK)"}</Text>
              
              {downloadCount !== null && (
                <View style={{ backgroundColor: `${colors.primary}20`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginRight: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>
                    {downloadCount} DLs
                  </Text>
                </View>
              )}

              <Ionicons
                name="open-outline"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => Linking.openURL("https://pathwise-beige.vercel.app/")}
            >
              <Ionicons
                name="globe-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={styles.menuLabel}>{"Visit PathWise Web"}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={[styles.menuLabel, { color: colors.error }]}>
                {"Sign Out"}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.error} />
            </TouchableOpacity>
          </GlassCard>
        </MotiView>

        {/* App Theme */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 250 }}
        >
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>{"App Theme"}</Text>
          <View style={styles.themeToggleRow}>
            {(["black", "white", "cream"] as ThemeType[]).map((t) => (
              <MotiView
                key={t}
                animate={{ scale: selectedTheme === t ? 1.05 : 1 }}
                transition={{ type: "spring", damping: 12, stiffness: 200 }}
              >
                <TouchableOpacity
                  style={[
                    styles.themeBtn,
                    selectedTheme === t && styles.themeBtnActive,
                  ]}
                  onPress={() => handleThemeSelect(t)}
                >
                  <Ionicons
                    name={t === "black" ? "moon" : t === "white" ? "sunny" : "leaf"}
                    size={20}
                    color={selectedTheme === t ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.themeBtnText,
                      selectedTheme === t && { color: colors.primary, fontWeight: "bold" },
                    ]}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              </MotiView>
            ))}
          </View>
        </MotiView>

        {/* Accent Color */}
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 300 }}
        >
          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>{"Accent Color"}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12, justifyContent: "center" }}>
            {ACCENT_COLORS.map((c) => (
              <MotiView
                key={c.hex}
                animate={{ scale: colors.primary === c.hex ? 1.15 : 1 }}
                transition={{ type: "spring", damping: 12, stiffness: 200 }}
              >
                <TouchableOpacity
                  onPress={() => handleColorSelect(c.hex)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: c.hex,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: colors.primary === c.hex ? colors.text : "transparent",
                  }}
                >
                  {colors.primary === c.hex && (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </MotiView>
            ))}
          </View>
        </MotiView>

        {/* App Version */}
        <Text style={styles.version}>{"PathWise v" + currentVersion}</Text>
      </ScrollView>

      {/* Edit Profile Sheet */}
      <SmoothSheet
        isVisible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        heightFraction={0.78}
        avoidKeyboard
      >
        <ScrollView
          contentContainerStyle={{ gap: 12, padding: Spacing.lg, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.modalTitle}>Edit Profile</Text>
          <Text style={styles.sectionTitle}>Profile Info</Text>
          <TextInput
            style={styles.input}
            placeholder="First Name"
            placeholderTextColor={colors.textMuted}
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            style={styles.input}
            placeholder="Last Name (Optional)"
            placeholderTextColor={colors.textMuted}
            value={lastName}
            onChangeText={setLastName}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone Number (Optional)"
            placeholderTextColor={colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <GradientButton
            label="Save Changes"
            onPress={handleSaveSettings}
            loading={isUpdatingSettings}
            icon="checkmark"
            style={{ marginTop: 10 }}
          />
          <TouchableOpacity
            onPress={() => setSettingsVisible(false)}
            style={styles.closeBtn}
          >
            <Text style={styles.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </SmoothSheet>

      {/* Feedback Sheet */}
      <SmoothSheet
        isVisible={feedbackVisible}
        onClose={() => setFeedbackVisible(false)}
        heightFraction={0.6}
        avoidKeyboard
      >
        <ScrollView
          contentContainerStyle={{ gap: 12, padding: Spacing.lg, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.modalTitle}>Send Feedback</Text>
          <Text style={styles.modalSubtitle}>
            How can we improve PathWise for you?
          </Text>
          <TextInput
            style={styles.feedbackInput}
            placeholder="Tell us what you think..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            value={feedbackText}
            onChangeText={setFeedbackText}
          />
          <GradientButton
            label="Submit Feedback"
            onPress={handleSubmitFeedback}
            loading={feedbackMutation.isPending}
            icon="send"
            style={{ marginTop: 10 }}
          />
          <TouchableOpacity
            onPress={() => setFeedbackVisible(false)}
            style={styles.closeBtn}
          >
            <Text style={styles.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </SmoothSheet>

      {/* Notifications Sheet */}
      <NotificationsBottomSheet
        isVisible={isNotificationsVisible}
        onClose={() => setNotificationsVisible(false)}
        type="settings"
      />

      <UpToDateModal 
        isVisible={isUpToDateModalVisible}
        onClose={() => setUpToDateModalVisible(false)}
      />

      <ChangePasswordModal
        isVisible={isChangePasswordVisible}
        onClose={() => setChangePasswordVisible(false)}
      />
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: Spacing.lg,
    paddingTop: 40,
    gap: Spacing.lg,
    paddingBottom: 40,
  },
  avatarSection: { alignItems: "center", gap: 10 },
  avatarContainer: { position: "relative", marginBottom: 10 },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { ...Typography.h1, color: "#fff", fontSize: 36 },
  editProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 10,
  },
  editProfileBtnText: {
    ...Typography.label,
    fontWeight: "bold",
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  nameContainer: { flexDirection: "row", alignItems: "center" },
  name: { ...Typography.h2, color: colors.text },
  email: { ...Typography.small, color: colors.textMuted },
  subBadge: { paddingHorizontal: 16, paddingVertical: 5, borderRadius: 99 },
  subBadgeText: { ...Typography.label, color: "#fff", fontWeight: "700" },
  sectionTitle: { ...Typography.h3, color: colors.text, marginBottom: 12 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  statCard: { alignItems: "center", gap: 6, paddingVertical: 18 },
  statIcon: { fontSize: 24 },
  statValue: { ...Typography.h2, color: colors.text },
  statLabel: { ...Typography.label, color: colors.textMuted },
  menuCard: { gap: 0, padding: 0 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: Spacing.md,
  },
  menuLabel: { ...Typography.body, color: colors.text, flex: 1 },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  version: { ...Typography.small, color: colors.textDim, textAlign: "center" },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "#000000cc",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    paddingBottom: 40,
    gap: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 8,
  },
  modalTitle: { ...Typography.h2, color: colors.text },
  modalSubtitle: { ...Typography.body, color: colors.textDim },
  input: {
    backgroundColor: "rgba(128,128,128,0.1)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    color: colors.text,
  },
  feedbackInput: {
    backgroundColor: "rgba(128,128,128,0.1)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  closeBtn: { alignItems: "center", marginTop: 12 },
  closeBtnText: { ...Typography.small, color: colors.textMuted },
  // Theme Toggle Styles
  themeToggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  themeBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    marginHorizontal: 4,
  },
  themeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}20`,
  },
  themeBtnText: {
    ...Typography.label,
    color: colors.text,
    marginTop: 8,
  },
});
