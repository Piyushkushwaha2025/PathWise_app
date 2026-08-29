import { useThemeStore } from '../../../store/useThemeStore';
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, BackHandler, Modal } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import { GraduationCap, ChevronRight, ChevronLeft, Search, X, ShieldAlert } from 'lucide-react-native';
import { GlassCard } from '../../../components/ui/GlassCard';
import { UNIVERSITIES, UniversityConfig } from '../../../constants/universities';

export default function ConnectScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { reset, error } = useLocalSearchParams<{ reset?: string; error?: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUni, setSelectedUni] = useState<UniversityConfig | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  useEffect(() => {
    if (reset === 'true') {
      setSelectedUni(null);
      router.setParams({ reset: '' });
    }
    if (error === 'account_linked') {
      setShowErrorModal(true);
      router.setParams({ error: '' });
    }
    
    // Auto-bypass if credentials exist and we're not resetting
    if (reset !== 'true') {
      SecureStore.getItemAsync('culko_u').then(u => {
        if (u) {
          router.replace({ pathname: '/(app)/studyos/webview-login', params: { uniId: 'cu' } } as any);
        }
      });
    }
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
    const query = searchQuery.toLowerCase();
    return Object.values(UNIVERSITIES).filter(
      (uni) => uni.name.toLowerCase().includes(query) || uni.shortName.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          {selectedUni && (
            <TouchableOpacity 
              style={{ marginRight: 8, padding: 4 }} 
              onPress={() => setSelectedUni(null)}
              activeOpacity={0.7}
            >
              <ChevronLeft color={colors.text} size={32} />
            </TouchableOpacity>
          )}
          <View style={styles.iconContainer}>
            <GraduationCap color={colors.background} size={28} />
          </View>
          <Text style={styles.headerTitle}>Study<Text style={{ color: colors.primary }}>O</Text>S</Text>
        </View>
        <Text style={styles.headerSubtitle}>{selectedUni ? 'Connect your university portal' : 'Search & select your university'}</Text>
      </View>
      
      <View style={styles.content}>
        {!selectedUni && (
          <View style={styles.searchContainer}>
            <Search color={colors.textDim} size={20} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search your college..."
              placeholderTextColor={colors.textDim}
              value={searchQuery}
              onChangeText={(text) => setSearchQuery(text)}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearIcon}>
                <X color={colors.textDim} size={20} />
              </TouchableOpacity>
            )}
          </View>
        )}
        
        {selectedUni ? (
          <View style={styles.selectedContainer}>
            <GraduationCap size={60} color={colors.primary} style={styles.icon} />
            <Text style={styles.title}>{selectedUni.name}</Text>
            <Text style={styles.subtitle}>
              StudyOS needs to securely connect to your University Portal to fetch your subjects, attendance, timetable, and marks.
            </Text>
            
            <GlassCard style={styles.card}>
              <Text style={styles.cardText}>
                🔒 We never store your password. We only use it once to generate secure session tokens which are stored safely on your device.
              </Text>
            </GlassCard>

            <TouchableOpacity 
              style={styles.connectButton}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/(app)/studyos/webview-login', params: { uniId: selectedUni.id } })}
            >
              <Text style={styles.connectButtonText}>Connect {selectedUni.shortName} Account</Text>
              <ChevronRight color={colors.background} size={20} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.changeCollegeButton}
              onPress={() => setSelectedUni(null)}
            >
              <Text style={styles.changeCollegeText}>Change College</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.listContainer}>
            <Text style={styles.listTitle}>{searchQuery.length > 0 ? 'Search Results:' : 'Select from below:'}</Text>
            <FlatList
              data={filteredUniversities}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={() => (
                <Text style={{ color: colors.textDim, textAlign: 'center', marginTop: 20 }}>No university found</Text>
              )}
              renderItem={({ item: uni }) => (
                <TouchableOpacity 
                  style={styles.uniListItem}
                  activeOpacity={0.7}
                  onPress={() => setSelectedUni(uni)}
                >
                  <View>
                    <Text style={styles.uniName}>{uni.name}</Text>
                    <Text style={styles.uniSub}>{uni.shortName}</Text>
                  </View>
                  <ChevronRight color={colors.border} size={20} />
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {/* Custom Account Already Linked Modal */}
      <Modal visible={showErrorModal} transparent animationType="fade" onRequestClose={() => setShowErrorModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <ShieldAlert color="#ef4444" size={48} style={styles.modalIcon} />
              <Text style={styles.modalTitle}>Account Already Linked</Text>
              <Text style={styles.modalDesc}>
                This PathWise account is already linked with a different university profile.
              </Text>
              <Text style={[styles.modalDesc, { marginTop: 12, color: colors.text }]}>
                For maximum security and academic privacy, each university ID can only be bound to a single profile. Please log in using your original account or create a brand new PathWise profile.
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

const useStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 40,
    paddingBottom: 20,
    backgroundColor: colors.surface,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  headerTitle: {
    color: colors.text,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 38,
    letterSpacing: -1,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: colors.textDim,
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  icon: {
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.h2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    ...Typography.body,
    color: colors.textDim,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  card: {
    marginBottom: Spacing.xxl,
    padding: Spacing.lg,
  },
  cardText: {
    ...Typography.body,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    height: 50,
    marginTop: 20,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: colors.text,
    height: '100%',
  },
  clearIcon: {
    padding: Spacing.xs,
  },
  selectedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Spacing.xl,
  },
  listContainer: {
    flex: 1,
    width: '100%',
  },
  listTitle: {
    ...Typography.h3,
    color: colors.text,
    marginBottom: Spacing.md,
  },
  listContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  uniListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingVertical: 36,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 130,
  },
  connectButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.full,
    width: '100%',
    marginBottom: Spacing.md,
  },
  connectButtonText: {
    ...Typography.h3,
    color: colors.background,
    marginRight: Spacing.sm,
  },
  changeCollegeButton: {
    padding: Spacing.md,
  },
  changeCollegeText: {
    ...Typography.body,
    color: colors.textDim,
    textDecorationLine: 'underline',
  },
  uniName: {
    ...Typography.h3,
    color: colors.text,
    marginBottom: 4,
  },
  uniSub: {
    ...Typography.body,
    color: colors.textDim,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
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
    ...Typography.h2,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  modalDesc: {
    ...Typography.body,
    color: colors.textDim,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
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
    ...Typography.h3,
    color: '#ffffff',
  },
});
