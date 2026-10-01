import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Pressable, Image } from 'react-native';
import { useThemeStore } from '../../../store/useThemeStore';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { Typography, Spacing } from '../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { GlassCard } from '../../../components/ui/GlassCard';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

export default function CollegeProfileScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  
  const { profile } = useStudyOSStore();
  const { setStudyOSMode, clearSession, universityId } = useStudySessionStore();
  
  const [isDisconnectModalVisible, setDisconnectModalVisible] = useState(false);
  const [cookies, setCookies] = useState('');

  React.useEffect(() => {
    SecureStore.getItemAsync('culko_cookies').then((c) => {
      if (c) setCookies(c);
    }).catch(() => {});
  }, []);

  const handleSwitch = () => {
    // Show loading immediately, navigate, then change mode
    useStudySessionStore.getState().setSwitchingMode(true);
    router.replace('/(app)/dashboard');
    setTimeout(() => {
      setStudyOSMode(false);
    }, 50);
  };

  const handleDisconnect = () => {
    setDisconnectModalVisible(true);
  };

  const confirmDisconnect = async () => {
    setDisconnectModalVisible(false);
    // Show the global loading screen like profile switch
    useStudySessionStore.getState().setSwitchingMode(true);
    
    try {
      // Forcefully delete credentials here to guarantee they are wiped
      await SecureStore.deleteItemAsync('culko_u');
      await SecureStore.deleteItemAsync('culko_p');
      await clearSession(false);
    } catch(e) {}
    
    // Slight delay to allow UI to render loading and SecureStore to sync
    setTimeout(() => {
      useStudySessionStore.getState().setSwitchingMode(false);
      router.replace('/(app)/studyos/connect?reset=true');
    }, 1500);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MotiView
          from={{ opacity: 0, translateY: -10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: "timing", duration: 400 }}
          style={styles.header}
        >
          <View style={styles.idCard}>
            <View style={styles.idHeader}>
              <Ionicons name="school" size={40} color={colors.primary} />
              <Text style={styles.uniName}>{universityId?.toUpperCase() || 'UNIVERSITY'}</Text>
            </View>
            <View style={styles.idBody}>
              {profile?.photoUrl ? (
                <Image 
                  source={{ 
                    uri: profile.photoUrl,
                    ...(profile.photoUrl.startsWith('http') && cookies ? { headers: { Cookie: cookies } } : {})
                  }} 
                  style={{ width: 80, height: 100, borderRadius: 8, backgroundColor: colors.surfaceHigh }} 
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={40} color={colors.primary} />
                </View>
              )}
              <View style={styles.infoCol}>
                <Text style={styles.studentName}>{profile?.name || 'Student Name'}</Text>
                <Text style={styles.infoText}>{profile?.course || 'No Course'}</Text>
                {profile?.semester && profile.semester !== 'N/A' && (
                  <Text style={styles.infoText}>Semester {profile.semester}</Text>
                )}
                {profile?.section ? (
                  <Text style={styles.infoText}>Section: {profile.section}</Text>
                ) : null}
                <Text style={styles.infoText}>{profile?.uid ? `UID: ${profile.uid}` : 'UID: N/A'}</Text>
              </View>
            </View>
            <View style={styles.cgpaBadge}>
              <Text style={styles.cgpaLabel}>CGPA</Text>
              <Text style={styles.cgpaValue}>{profile?.cgpa || 'N/A'}</Text>
            </View>
          </View>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 200 }}
        >
          <Text style={styles.sectionTitle}>Account Actions</Text>

          <GlassCard style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(app)/studyos/settings')}>
              <Ionicons name="settings-outline" size={20} color={colors.primary} />
              <Text style={styles.menuLabel}>Settings</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(app)/rewards')}>
              <Text style={{ fontSize: 20 }}>🪙</Text>
              <Text style={styles.menuLabel}>Rewards & Free Premium</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={handleSwitch}>
              <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
              <Text style={styles.menuLabel}>Switch to Pathwise Profile</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={handleDisconnect}>
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={[styles.menuLabel, { color: colors.error }]}>Disconnect College</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.error} />
            </TouchableOpacity>
          </GlassCard>
        </MotiView>
      </ScrollView>

      {/* Custom Disconnect Modal */}
      <Modal visible={isDisconnectModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <MotiView 
            from={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }} 
            transition={{ type: 'spring', damping: 20 }}
            style={styles.modalContent}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBox}>
                <Ionicons name="warning-outline" size={32} color={colors.error} />
              </View>
              <Text style={styles.modalTitle}>Disconnect College?</Text>
            </View>
            
            <Text style={styles.modalText}>
              Are you sure you want to log out from your college account? You will need to log in again to access your subjects.
            </Text>
            
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setDisconnectModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnDanger} onPress={confirmDisconnect}>
                <Text style={styles.modalBtnDangerText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          </MotiView>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Spacing.lg, paddingTop: 40, gap: Spacing.lg },
  header: { alignItems: 'center' },
  idCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: Spacing.lg,
    position: 'relative',
    overflow: 'hidden',
  },
  idHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  uniName: {
    ...Typography.h2,
    color: colors.primary,
    flex: 1,
  },
  idBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  avatarPlaceholder: {
    width: 80,
    height: 100,
    backgroundColor: colors.textDim,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: { flex: 1, gap: 4 },
  studentName: { ...Typography.h3, color: colors.text, marginBottom: 4 },
  infoText: { ...Typography.body, color: colors.textDim },
  cgpaBadge: {
    position: 'absolute',
    bottom: Spacing.lg,
    right: Spacing.lg,
    alignItems: 'center',
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  cgpaLabel: { fontSize: 12, color: colors.primary, fontWeight: 'bold' },
  cgpaValue: { fontSize: 24, color: colors.primary, fontWeight: 'bold' },
  sectionTitle: { ...Typography.h2, color: colors.text, marginBottom: Spacing.md },
  menuCard: { padding: Spacing.sm },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  menuLabel: { ...Typography.body, flex: 1, color: colors.text, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: Spacing.md },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContent: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${colors.error}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.h2,
    color: colors.text,
    textAlign: 'center',
  },
  modalText: {
    ...Typography.body,
    color: colors.textDim,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBtnCancelText: {
    ...Typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  modalBtnDanger: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: 'center',
  },
  modalBtnDangerText: {
    ...Typography.body,
    color: '#fff',
    fontWeight: 'bold',
  },
});
