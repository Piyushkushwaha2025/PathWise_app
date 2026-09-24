import { useThemeStore } from '../../../store/useThemeStore';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, BackHandler, Modal, Platform } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import { GraduationCap, ChevronRight, ChevronLeft, Search, X, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react-native';
import { GlassCard } from '../../../components/ui/GlassCard';
import { UNIVERSITIES, UniversityConfig } from '../../../constants/universities';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

export default function ConnectScreen() {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black' || theme === 'emerald';
  const styles = useStyles(colors, isDark);
  const router = useRouter();
  const { reset, error } = useLocalSearchParams<{ reset?: string; error?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUni, setSelectedUni] = useState<UniversityConfig | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const blockAutoLogin = useRef(false);
  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      if (!isMounted) return;
      
      if (reset === 'true') {
        setSelectedUni(null);
        blockAutoLogin.current = true;
        router.setParams({ reset: '' });
      }
      if (error === 'account_linked') {
        setShowErrorModal(true);
        blockAutoLogin.current = true;
        router.setParams({ error: '' });
      }
      
      // Auto-bypass if credentials exist and we haven't blocked it (due to expired/reset)
      if (!blockAutoLogin.current) {
        SecureStore.getItemAsync('culko_u').then(u => {
          if (u && isMounted) {
            router.replace({ pathname: '/(app)/studyos/webview-login', params: { uniId: 'cu' } } as any);
          }
        });
      }
    }, 50); // Small delay to ensure Root Layout is fully mounted
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [reset, error]);

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (selectedUni) {
          setSelectedUni(null);
          return true; // Prevent default back behavior, stay on this screen but clear selection
        }
        return false;
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => backHandler.remove();
    }, [selectedUni])
  );

  const filteredUniversities = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return Object.values(UNIVERSITIES).filter(
      (uni) => uni.name.toLowerCase().includes(query) || uni.shortName.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.headerTitleContainer}>
            {selectedUni && (
              <TouchableOpacity 
                style={styles.backBtn} 
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                  setSelectedUni(null);
                }}
                activeOpacity={0.7}
              >
                <ChevronLeft color={colors.text} size={28} />
              </TouchableOpacity>
            )}
            <LinearGradient
              colors={[colors.primary, colors.accent || colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconContainer}
            >
              <GraduationCap color="#ffffff" size={24} />
            </LinearGradient>
            <View>
              <Text style={styles.headerTitle} numberOfLines={1}>
                Study<Text style={{ color: colors.primary }}>O</Text>S
              </Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {selectedUni ? 'Connect your university portal' : 'Select your university to sync'}
              </Text>
            </View>
          </View>
        </View>
      </View>
      
      {/* Main Content Area — Tablet Optimized Container */}
      <View style={styles.content}>
        {!selectedUni && (
          <View style={styles.searchContainer}>
            <Search color={colors.textDim} size={20} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search your college or campus..."
              placeholderTextColor={colors.textDim}
              value={searchQuery}
              onChangeText={(text) => setSearchQuery(text)}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity 
                onPress={() => setSearchQuery('')} 
                style={styles.clearIcon}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X color={colors.textDim} size={18} />
              </TouchableOpacity>
            )}
          </View>
        )}
        
        {selectedUni ? (
          <View style={styles.selectedContainer}>
            <LinearGradient
              colors={[colors.primary + '28', colors.primary + '08']}
              style={styles.selectedGlowPod}
            >
              <GraduationCap size={56} color={colors.primary} />
            </LinearGradient>

            <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
              {selectedUni.name}
            </Text>

            <Text style={styles.subtitle}>
              StudyOS securely connects to your University Portal to fetch and organize your Attendance, Timetable, Marks, and Campus Services directly on your device.
            </Text>
            
            <GlassCard style={styles.card}>
              <View style={styles.cardRow}>
                <ShieldCheck color={colors.primary} size={22} style={{ marginTop: 2 }} />
                <Text style={styles.cardText}>
                  Your password is never stored on external servers. It is encrypted strictly on this device and used only to fetch your academic records.
                </Text>
              </View>
            </GlassCard>

            <TouchableOpacity 
              style={[styles.connectButton, { backgroundColor: colors.primary }]}
              activeOpacity={0.82}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
                router.push({ pathname: '/(app)/studyos/webview-login', params: { uniId: selectedUni.id } });
              }}
            >
              <Text style={styles.connectButtonText}>Connect {selectedUni.shortName} Portal</Text>
              <ChevronRight color="#ffffff" size={20} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.listContainer}>
            <View style={styles.listHeaderRow}>
              <Text style={styles.listTitle}>
                {searchQuery.length > 0 ? 'Search Results' : 'Supported Universities'}
              </Text>
              <View style={styles.portalCountPill}>
                <Text style={[styles.portalCountText, { color: colors.primary }]}>
                  {filteredUniversities.length} {filteredUniversities.length === 1 ? 'Campus' : 'Campuses'}
                </Text>
              </View>
            </View>

            <FlatList
              data={filteredUniversities}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={() => (
                <View style={styles.emptyContainer}>
                  <GraduationCap size={44} color={colors.textDim} style={{ opacity: 0.5, marginBottom: 12 }} />
                  <Text style={[styles.emptyText, { color: colors.textDim }]}>
                    No university found matching "{searchQuery}"
                  </Text>
                </View>
              )}
              renderItem={({ item: uni }) => (
                <TouchableOpacity 
                  style={[
                    styles.uniCard,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#ffffff',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                    }
                  ]}
                  activeOpacity={0.75}
                  onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    setSelectedUni(uni);
                  }}
                >
                  <View style={styles.uniCardContent}>
                    {/* Monogram Badge */}
                    <LinearGradient
                      colors={[`${colors.primary}22`, `${colors.primary}0a`]}
                      style={[styles.uniAvatarPod, { borderColor: `${colors.primary}40` }]}
                    >
                      <Text style={[styles.uniInitials, { color: colors.primary }]}>
                        {uni.shortName || uni.name.slice(0, 2).toUpperCase()}
                      </Text>
                    </LinearGradient>

                    {/* Details Column */}
                    <View style={styles.uniInfoCol}>
                      <Text 
                        style={[styles.uniName, { color: colors.text }]} 
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.88}
                      >
                        {uni.name}
                      </Text>
                      
                      <View style={styles.uniBadgeRow}>
                        <View style={styles.liveIndicatorRow}>
                          <View style={styles.pulseDot} />
                          <Text style={styles.liveBadgeText}>Live Portal Sync</Text>
                        </View>
                        <Text style={[styles.uniFeatureTag, { color: colors.textDim }]}>
                          • Attendance & Marks
                        </Text>
                      </View>
                    </View>

                    {/* Chevron Button */}
                    <View style={[styles.chevronActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                      <ChevronRight color={colors.primary} size={18} />
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {/* Account Already Linked Modal */}
      <Modal visible={showErrorModal} transparent animationType="fade" onRequestClose={() => setShowErrorModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <ShieldAlert color="#ef4444" size={44} style={styles.modalIcon} />
              <Text style={styles.modalTitle}>Account Already Linked</Text>
              <Text style={styles.modalDesc}>
                This PathWise account is already bound to a different university profile.
              </Text>
              <Text style={[styles.modalDesc, { marginTop: 10, color: colors.text }]}>
                For academic security and privacy, each university ID can only be bound to a single PathWise account.
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.modalBtn}
              activeOpacity={0.8}
              onPress={() => setShowErrorModal(false)}
            >
              <Text style={styles.modalBtnText}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Platform.OS === 'ios' ? 16 : 14,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerInner: {
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    padding: 6,
    marginLeft: -8,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  headerTitle: {
    color: colors.text,
    fontFamily: 'SpaceGrotesk_700Bold',
    paddingRight: 4,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: colors.textDim,
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    height: 48,
    marginTop: 8,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    width: '100%',
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    height: '100%',
  },
  clearIcon: {
    padding: Spacing.xs,
  },
  listContainer: {
    flex: 1,
    width: '100%',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  listTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  },
  portalCountPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.primary + '18',
  },
  portalCountText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 14,
  },
  listContent: {
    gap: 12,
    paddingBottom: Spacing.xxl,
  },
  uniCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.25 : 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  uniCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uniAvatarPod: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    marginRight: 12,
  },
  uniInitials: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.5,
  },
  uniInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  uniName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15.5,
    lineHeight: 20,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  uniBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  liveIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10b98118',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  liveBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
    lineHeight: 13,
    color: '#10b981',
  },
  uniFeatureTag: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 14,
  },
  chevronActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },

  // Selected State
  selectedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  selectedGlowPod: {
    width: 96,
    height: 96,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    maxWidth: 440,
  },
  card: {
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
    width: '100%',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.full,
    width: '100%',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  connectButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 16,
    lineHeight: 20,
    color: '#ffffff',
    marginRight: Spacing.sm,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    padding: Spacing.xl,
    borderRadius: Radius.xl,
    backgroundColor: colors.surfaceHigh || colors.surface || '#1e293b',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalIcon: {
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    lineHeight: 26,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  modalDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textDim,
    textAlign: 'center',
  },
  modalBtn: {
    backgroundColor: '#ef4444',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.full,
    width: '100%',
    alignItems: 'center',
  },
  modalBtnText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: '#ffffff',
  },
});
