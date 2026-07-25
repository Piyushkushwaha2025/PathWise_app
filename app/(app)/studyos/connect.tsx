import { useThemeStore } from '../../../store/useThemeStore';
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, BackHandler } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import { GraduationCap, ChevronRight, Search, X } from 'lucide-react-native';
import { GlassCard } from '../../../components/ui/GlassCard';
import { UNIVERSITIES, UniversityConfig } from '../../../constants/universities';

export default function ConnectScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { reset } = useLocalSearchParams<{ reset: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUni, setSelectedUni] = useState<UniversityConfig | null>(null);

  useEffect(() => {
    if (reset === 'true') {
      setSelectedUni(null);
      router.setParams({ reset: '' });
    }
  }, [reset]);

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
        <Text style={styles.headerTitle}>StudyOS</Text>
      </View>
      
      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <Search color={colors.textDim} size={20} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your college..."
            placeholderTextColor={colors.textDim}
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              if (selectedUni) setSelectedUni(null); // Reset selection on search
            }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearIcon}>
              <X color={colors.textDim} size={20} />
            </TouchableOpacity>
          )}
        </View>
        
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
            <Text style={styles.listTitle}>Select from below:</Text>
            <FlatList
              data={filteredUniversities}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
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
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: Spacing.lg,
    paddingTop: 20,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    ...Typography.h2,
    color: colors.text,
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
  },
  listTitle: {
    ...Typography.h3,
    color: colors.text,
    marginBottom: Spacing.md,
  },
  listContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  uniListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
});
