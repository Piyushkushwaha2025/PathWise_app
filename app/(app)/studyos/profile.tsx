import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Pressable, Image } from 'react-native';
import { WebView } from 'react-native-webview';
import { useThemeStore } from '../../../store/useThemeStore';
import { useStudySessionStore } from '../../../store/studySessionStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { Typography, Spacing } from '../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { GlassCard } from '../../../components/ui/GlassCard';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { PrivacyPinModal } from '../../../components/modals/PrivacyPinModal';

export default function CollegeProfileScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  
  const { profile, resultCache, setScrapedData } = useStudyOSStore();
  const { setStudyOSMode, clearSession, universityId } = useStudySessionStore();
  
  const [isDisconnectModalVisible, setDisconnectModalVisible] = useState(false);
  const [cookies, setCookies] = useState('');

  // GPA Privacy & Security Lock State (Default hidden)
  const [isGpaVisible, setIsGpaVisible] = useState(false);
  const [isPinModalVisible, setIsPinModalVisible] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync('culko_cookies').then((c) => {
      if (c) setCookies(c);
    }).catch(() => {});
  }, []);

  const handleToggleGpa = async () => {
    if (isGpaVisible) {
      setIsGpaVisible(false);
      return;
    }

    try {
      const isPinEnabled = await SecureStore.getItemAsync('studyos_pin_enabled');
      if (isPinEnabled === 'true') {
        setIsPinModalVisible(true);
      } else {
        setIsGpaVisible(true);
      }
    } catch (e) {
      setIsGpaVisible(true);
    }
  };

  // Calculate overall GPA and extract semester-wise SGPAs
  const { calculatedGpa, semesterSgpas } = useMemo(() => {
    const semMap = new Map<number, number>();

    if (resultCache && typeof resultCache === 'object') {
      Object.entries(resultCache).forEach(([key, val]) => {
        if (!val) return;
        const rawSgpa = val.sgpa || (val as any).gpa;
        if (!rawSgpa) return;
        const num = parseFloat(rawSgpa);
        if (isNaN(num) || num <= 0 || num > 10) return;

        // Match semester number from keys like "1", "Semester 1", "sem_1"
        const match = key.match(/(?:Semester\s*|sem_)?(\d+)/i);
        if (match) {
          const semNum = parseInt(match[1], 10);
          if (semNum > 0 && semNum <= 16) {
            semMap.set(semNum, num);
          }
        }
      });
    }

    const sList = Array.from(semMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([semester, sgpa]) => ({ semester, sgpa }));

    if (sList.length > 0) {
      const sum = sList.reduce((acc, curr) => acc + curr.sgpa, 0);
      const avg = (sum / sList.length).toFixed(2);
      return { calculatedGpa: avg, semesterSgpas: sList };
    }

    // Fallback to profile.cgpa if it is a valid positive number
    if (profile?.cgpa && profile.cgpa !== 'N/A') {
      const pNum = parseFloat(profile.cgpa);
      if (!isNaN(pNum) && pNum > 0 && pNum <= 10) {
        return { calculatedGpa: pNum.toFixed(2), semesterSgpas: [] };
      }
    }

    return { calculatedGpa: 'N/A', semesterSgpas: [] };
  }, [resultCache, profile?.cgpa]);

  // Background Result Scraping Script for result.aspx
  const extractResultScript = `
    (function() {
      try {
        var repeaterTables = document.querySelectorAll('table[id*="gvResult"], table[id*="dlResult"] table, table.table-bordered, table');
        var allSemesters = {};

        for (var t = 0; t < repeaterTables.length; t++) {
          var tbl = repeaterTables[t];
          var rows = Array.from(tbl.querySelectorAll('tr'));
          if (rows.length < 2) continue;

          var semNum = '';
          var semSgpa = '';
          var parentItem = tbl.parentElement;
          var searchArea = parentItem || tbl.parentElement || document;
          var textToSearch = searchArea.innerText || '';

          var semSpan = searchArea.querySelector('span[id*="lblSem_' + t + '"]') || searchArea.querySelector('span[id*="lblSem"]');
          if (semSpan) {
            semNum = semSpan.innerText.trim();
          }
          if (!semNum) {
            var semM = textToSearch.match(/(?:Semester\\s*[:\\-\\=]?\\s*|Sem\\s*[:\\-\\=]?\\s*)(\\d+)/i);
            if (semM) semNum = semM[1];
          }

          var sgpaM = textToSearch.match(/(?:S\\.?G\\.?P\\.?A\\.?|GPA)\\s*[:\\-\\=]?\\s*([0-9]{1,2}\\.[0-9]{1,3})/i);
          if (sgpaM) {
            semSgpa = sgpaM[1];
          }

          if (semNum && semSgpa) {
            allSemesters[semNum] = {
              semesterNumber: semNum,
              sgpa: semSgpa,
              subjects: []
            };
          }
        }

        var bodyText = document.body ? document.body.innerText : '';
        var cgpa = '';
        var cgpaMatch = bodyText.match(/(?:C\\.?G\\.?P\\.?A\\.?)\\s*[:\\-\\=]?\\s*([0-9]{1,2}\\.[0-9]{1,3})/i);
        if (cgpaMatch) {
          cgpa = cgpaMatch[1];
        }

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'BG_RESULT_DATA',
          allSemesters: allSemesters,
          cgpa: cgpa
        }));
      } catch(e) {}
    })();
    true;
  `;

  const handleBgMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'BG_RESULT_DATA') {
        const hasSemesters = data.allSemesters && Object.keys(data.allSemesters).length > 0;
        const hasCgpa = data.cgpa && !isNaN(parseFloat(data.cgpa));

        if (hasSemesters || hasCgpa) {
          const newCache = { ...(resultCache || {}) };
          if (hasSemesters) {
            Object.keys(data.allSemesters).forEach((k) => {
              const semData = data.allSemesters[k];
              if (semData && semData.sgpa) {
                newCache[k] = semData;
                newCache[`Semester ${k}`] = semData;
                newCache[`sem_${k}`] = semData;
              }
            });
          }

          const currentProfile = useStudyOSStore.getState().profile;
          const updatedProfile = currentProfile ? {
            ...currentProfile,
            cgpa: hasCgpa ? data.cgpa : currentProfile.cgpa
          } : null;

          setScrapedData({
            resultCache: newCache,
            ...(updatedProfile ? { profile: updatedProfile } : {})
          });
        }
      }
    } catch(e) {}
  };

  const handleSwitch = () => {
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
    useStudySessionStore.getState().setSwitchingMode(true);
    
    try {
      await SecureStore.deleteItemAsync('culko_u');
      await SecureStore.deleteItemAsync('culko_p');
      await clearSession(false);
    } catch(e) {}
    
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
            {/* Top row: University Info on left, GPA Badge / View Button on right */}
            <View style={styles.idHeader}>
              <View style={styles.uniBadge}>
                <Ionicons name="school" size={28} color={colors.primary} />
                <Text style={styles.uniName}>{universityId?.toUpperCase() || 'UNIVERSITY'}</Text>
              </View>

              {isGpaVisible ? (
                <TouchableOpacity
                  style={styles.gpaBadge}
                  onPress={handleToggleGpa}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.gpaLabel}>GPA</Text>
                    <Ionicons name="eye-off-outline" size={12} color={colors.primary} />
                  </View>
                  <Text style={styles.gpaValue}>{calculatedGpa}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.gpaViewBtn}
                  onPress={handleToggleGpa}
                  activeOpacity={0.7}
                >
                  <Ionicons name="eye-outline" size={15} color={colors.primary} />
                  <Text style={styles.gpaViewBtnText}>View GPA</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Body row: Student Photo on left, Info Details on right (zero text overlap) */}
            <View style={styles.idBody}>
              {profile?.photoUrl ? (
                <Image 
                  source={{ 
                    uri: profile.photoUrl,
                    ...(profile.photoUrl.startsWith('http') && cookies ? { headers: { Cookie: cookies } } : {})
                  }} 
                  style={styles.avatarImage} 
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={36} color={colors.primary} />
                </View>
              )}
              <View style={styles.infoCol}>
                <Text style={styles.studentName} numberOfLines={1}>{profile?.name || 'Student Name'}</Text>
                <Text style={styles.infoText} numberOfLines={1}>{profile?.course || 'No Course'}</Text>
                {profile?.semester && profile.semester !== 'N/A' && (
                  <Text style={styles.infoText}>Semester {profile.semester}</Text>
                )}
                {profile?.section ? (
                  <Text style={styles.infoText}>Section: {profile.section}</Text>
                ) : null}
                <Text style={styles.infoText}>{profile?.uid ? `UID: ${profile.uid}` : 'UID: N/A'}</Text>
              </View>
            </View>

            {/* Semester SGPA Breakdown (visible only when GPA is revealed) */}
            {isGpaVisible && semesterSgpas.length > 0 && (
              <View style={styles.sgpaSection}>
                <View style={styles.sgpaDivider} />
                <View style={styles.sgpaHeaderRow}>
                  <Text style={styles.sgpaHeaderTitle}>SEMESTER SGPA</Text>
                  <Text style={styles.sgpaHeaderAvg}>Avg GPA: {calculatedGpa}</Text>
                </View>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.sgpaPillsContainer}
                >
                  {semesterSgpas.map((item) => (
                    <View key={item.semester} style={styles.sgpaPill}>
                      <Text style={styles.sgpaPillSem}>Sem {item.semester}</Text>
                      <Text style={styles.sgpaPillScore}>{item.sgpa.toFixed(2)}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
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

      {/* Hidden WebView to fetch result.aspx if no semester results cached yet */}
      {cookies && semesterSgpas.length === 0 && (
        <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute', left: -1000 }}>
          <WebView
            source={{
              uri: 'https://student.culko.in/result.aspx',
              headers: { Cookie: cookies }
            }}
            injectedJavaScript={extractResultScript}
            onMessage={handleBgMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
          />
        </View>
      )}

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

      {/* Security PIN Modal for GPA Unlock */}
      <PrivacyPinModal
        isVisible={isPinModalVisible}
        mode="verify"
        title="Unlock GPA & Marks"
        subtitle="Enter your 4-digit PIN to view your GPA and semester SGPA"
        onClose={() => setIsPinModalVisible(false)}
        onSuccess={() => setIsGpaVisible(true)}
      />
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Spacing.lg, paddingTop: 40, gap: Spacing.lg },
  header: { width: '100%' },
  idCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: `${colors.primary}40`,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  idHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  uniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  uniName: {
    ...Typography.h2,
    color: colors.primary,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  gpaBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.primary}18`,
    borderWidth: 1,
    borderColor: `${colors.primary}40`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 64,
  },
  gpaViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.primary}18`,
    borderWidth: 1,
    borderColor: `${colors.primary}40`,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  gpaViewBtnText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  gpaLabel: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '800',
    letterSpacing: 1,
  },
  gpaValue: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '800',
  },
  idBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatarImage: {
    width: 80,
    height: 100,
    borderRadius: 8,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
  },
  avatarPlaceholder: {
    width: 80,
    height: 100,
    backgroundColor: colors.surfaceHigh,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  studentName: {
    ...Typography.h3,
    color: colors.text,
    fontWeight: '700',
    marginBottom: 2,
  },
  infoText: {
    ...Typography.body,
    fontSize: 13,
    color: colors.textDim,
    lineHeight: 18,
  },
  sgpaSection: {
    marginTop: Spacing.md,
  },
  sgpaDivider: {
    height: 1,
    backgroundColor: `${colors.primary}20`,
    marginBottom: Spacing.sm,
  },
  sgpaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sgpaHeaderTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textDim,
    letterSpacing: 1,
  },
  sgpaHeaderAvg: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  sgpaPillsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  sgpaPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: `${colors.primary}12`,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
    alignItems: 'center',
    minWidth: 60,
  },
  sgpaPillSem: {
    fontSize: 10,
    color: colors.textDim,
    fontWeight: '600',
    marginBottom: 2,
  },
  sgpaPillScore: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '800',
  },
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
