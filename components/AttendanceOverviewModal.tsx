import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  Dimensions,
  BackHandler,
  Animated,
  Easing,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { useStudyOSStore, CulkoSubject } from '../store/studyosStore';
import { Typography, Spacing, Radius } from '../constants/theme';
import { DetailedAttendanceModal } from './DetailedAttendanceModal';

interface AttendanceOverviewModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectSubject?: (subject: { code: string; name: string; viewActionTarget?: string }) => void;
}

type FilterType = 'all' | 'critical' | 'safe' | 'leaves';
type SortType = 'critical_first' | 'highest_first' | 'alphabetical';

interface ProcessedSubject {
  subject: CulkoSubject;
  attended: number;
  total: number;
  percentage: number;
  isSafe: boolean;
  isWarning: boolean;
  presentCount: number;
  absentCount: number;
  dutyLeaveCount: number;
  medicalLeaveCount: number;
  marginText: string;
  safeBunks: number;
  recoveryNeeded: number;
  hasDetailedRecords: boolean;
}

// Memoized Subject Item Card for 60fps scrolling
const SubjectCardItem = React.memo(({
  item,
  colors,
  onPress,
}: {
  item: ProcessedSubject;
  colors: any;
  onPress: () => void;
}) => {
  const sub = item.subject;
  const statusColor = item.isSafe ? '#22c55e' : item.isWarning ? '#f59e0b' : '#ef4444';
  const statusBg = item.isSafe ? '#22c55e15' : item.isWarning ? '#f59e0b15' : '#ef444415';
  const statusBorder = item.isSafe ? '#22c55e35' : item.isWarning ? '#f59e0b35' : '#ef444435';
  const statusLabel = item.isSafe ? 'SAFE' : item.isWarning ? 'WARNING' : 'CRITICAL';

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.subjectCard,
        {
          backgroundColor: colors.surfaceHigh,
          borderColor: colors.border,
          borderLeftColor: statusColor,
        },
      ]}
    >
      {/* Top Header: Title, Code, Status & Percentage Badge */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={[styles.subjectName, { color: colors.text }]} numberOfLines={2}>
            {sub.name}
          </Text>
          <View style={styles.codeRow}>
            <Text style={[styles.subjectCode, { color: colors.textDim }]}>{sub.code}</Text>
            {sub.credits && sub.credits !== '0' && (
              <View style={[styles.creditPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.creditText, { color: colors.textMuted }]}>{sub.credits} Credits</Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.pctBadge, { backgroundColor: statusBg, borderColor: statusBorder }]}>
          <Text style={[styles.pctBadgeValue, { color: statusColor }]}>{item.percentage}%</Text>
          <Text style={[styles.pctStatusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Progress Line with 75% Goal Marker */}
      <View style={styles.barWrapper}>
        <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.min(100, Math.max(0, item.percentage))}%`,
                backgroundColor: statusColor,
              },
            ]}
          />
          {/* 75% Goal Line */}
          <View style={styles.barGoalLine}>
            <View style={[styles.barGoalTick, { backgroundColor: colors.text }]} />
          </View>
        </View>
        <View style={styles.barMetaRow}>
          <Text style={[styles.barMetaText, { color: colors.textMuted }]}>
            {item.attended} attended of {item.total} classes
          </Text>
          <Text style={[styles.barGoalText, { color: colors.primary }]}>75% Target</Text>
        </View>
      </View>

      {/* Breakdown Pills Row: Present, Absent, DL, ML */}
      <View style={styles.statsPillRow}>
        <View style={[styles.miniPill, { backgroundColor: '#22c55e14', borderColor: '#22c55e30' }]}>
          <Ionicons name="checkmark-circle" size={12} color="#22c55e" style={{ marginRight: 4 }} />
          <Text style={[styles.miniPillText, { color: '#22c55e' }]}>{item.presentCount} Present</Text>
        </View>

        <View style={[styles.miniPill, { backgroundColor: '#ef444414', borderColor: '#ef444430' }]}>
          <Ionicons name="close-circle" size={12} color="#ef4444" style={{ marginRight: 4 }} />
          <Text style={[styles.miniPillText, { color: '#ef4444' }]}>{item.absentCount} Absent</Text>
        </View>

        {item.dutyLeaveCount > 0 && (
          <View style={[styles.miniPill, { backgroundColor: '#3b82f614', borderColor: '#3b82f630' }]}>
            <Ionicons name="briefcase" size={11} color="#3b82f6" style={{ marginRight: 4 }} />
            <Text style={[styles.miniPillText, { color: '#3b82f6' }]}>{item.dutyLeaveCount} DL</Text>
          </View>
        )}

        {item.medicalLeaveCount > 0 && (
          <View style={[styles.miniPill, { backgroundColor: '#f59e0b14', borderColor: '#f59e0b30' }]}>
            <Ionicons name="medkit" size={11} color="#f59e0b" style={{ marginRight: 4 }} />
            <Text style={[styles.miniPillText, { color: '#f59e0b' }]}>{item.medicalLeaveCount} ML</Text>
          </View>
        )}
      </View>

      {/* Smart Margin / Action Pill */}
      <View style={[styles.marginBanner, { backgroundColor: statusBg, borderColor: statusBorder }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
          <Ionicons
            name={item.isSafe ? 'shield-checkmark-outline' : 'alert-circle-outline'}
            size={15}
            color={statusColor}
          />
          <Text style={[styles.marginBannerText, { color: statusColor }]} numberOfLines={1}>
            {item.marginText}
          </Text>
        </View>

        <View style={styles.actionPrompt}>
          <Text style={[styles.actionPromptText, { color: colors.primary }]}>Predictor</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );
});

export function AttendanceOverviewModal({
  visible,
  onClose,
  onSelectSubject,
}: AttendanceOverviewModalProps) {
  const { colors } = useThemeStore();
  const { subjects, detailedAttendanceCache } = useStudyOSStore();
  const { width: SCREEN_WIDTH } = Dimensions.get('window');
  const slideAnim = React.useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('critical_first');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<{
    code: string;
    name: string;
    viewActionTarget?: string;
    initialPredicting?: boolean;
  } | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const handleOpenDetail = useCallback(
    (subject: { code: string; name: string; viewActionTarget?: string; initialPredicting?: boolean }) => {
      setSelectedSubject(subject);
      setIsDetailOpen(true);
      slideAnim.setValue(SCREEN_WIDTH);
      requestAnimationFrame(() => {
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
      if (onSelectSubject) {
        onSelectSubject(subject);
      }
    },
    [SCREEN_WIDTH, slideAnim, onSelectSubject]
  );

  const handleCloseDetail = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_WIDTH,
      duration: 250,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsDetailOpen(false);
      setSelectedSubject(null);
    });
  }, [SCREEN_WIDTH, slideAnim]);

  React.useEffect(() => {
    if (!visible) {
      setIsDetailOpen(false);
      setSelectedSubject(null);
      slideAnim.setValue(SCREEN_WIDTH);
    }
  }, [visible, SCREEN_WIDTH, slideAnim]);

  // Hardware back button handler for Android
  React.useEffect(() => {
    if (!visible) return;
    const backAction = () => {
      if (isDetailOpen) {
        handleCloseDetail();
        return true;
      }
      if (searchQuery !== '') {
        setSearchQuery('');
        return true;
      }
      if (filter !== 'all') {
        setFilter('all');
        return true;
      }
      onClose();
      return true;
    };
    const handler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => handler.remove();
  }, [visible, isDetailOpen, searchQuery, filter, onClose, handleCloseDetail]);

  const safeSubjects = Array.isArray(subjects) ? subjects : [];

  // Compute stats for all subjects
  const subjectStats = useMemo<ProcessedSubject[]>(() => {
    return safeSubjects.map((sub) => {
      const attended = Number(sub.attendedClasses || 0);
      const total = Number(sub.totalClasses || 0);
      const percentage = total > 0 ? (attended / total) * 100 : Number(sub.attendancePercentage || 0);
      const isSafe = percentage >= 75;
      const isWarning = percentage >= 65 && percentage < 75;

      // Detailed past records from cache
      const records = detailedAttendanceCache?.[sub.code] || [];
      let presentCount = 0;
      let absentCount = 0;
      let dutyLeaveCount = 0;
      let medicalLeaveCount = 0;

      records.forEach((r: any) => {
        const s = String(r?.status || '').toUpperCase().trim();
        if (s.includes('DUTY') || s === 'DL') dutyLeaveCount++;
        else if (s.includes('MEDIC') || s === 'ML' || s.includes('SICK')) medicalLeaveCount++;
        else if (s.includes('ABSENT') || s === 'A' || s.includes('LEAVE')) absentCount++;
        else if (s.includes('PRESENT') || s === 'P') presentCount++;
      });

      // Bunk / Margin Advice
      let marginText = '';
      let safeBunks = 0;
      let recoveryNeeded = 0;

      if (isSafe) {
        safeBunks = Math.floor((attended - 0.75 * total) / 0.75);
        if (safeBunks > 0) {
          marginText = `Safe to miss ${safeBunks} class${safeBunks > 1 ? 'es' : ''}`;
        } else {
          marginText = 'Borderline: Cannot miss next class';
        }
      } else {
        recoveryNeeded = Math.ceil((0.75 * total - attended) / 0.25);
        marginText = `Attend next ${recoveryNeeded} class${recoveryNeeded > 1 ? 'es' : ''} consecutively`;
      }

      return {
        subject: sub,
        attended,
        total,
        percentage: Math.round(percentage * 10) / 10,
        isSafe,
        isWarning,
        presentCount: records.length > 0 ? presentCount : attended,
        absentCount: records.length > 0 ? absentCount : Math.max(0, total - attended),
        dutyLeaveCount,
        medicalLeaveCount,
        marginText,
        safeBunks,
        recoveryNeeded,
        hasDetailedRecords: records.length > 0,
      };
    });
  }, [safeSubjects, detailedAttendanceCache]);

  // Overall aggregate semester stats
  const overallStats = useMemo(() => {
    let totalAttended = 0;
    let totalClasses = 0;
    let safeCount = 0;
    let criticalCount = 0;
    let totalDL = 0;
    let totalML = 0;

    subjectStats.forEach((s) => {
      totalAttended += s.attended;
      totalClasses += s.total;
      totalDL += s.dutyLeaveCount;
      totalML += s.medicalLeaveCount;
      if (s.isSafe) safeCount++;
      else criticalCount++;
    });

    const overallPct = totalClasses > 0 ? Math.round((totalAttended / totalClasses) * 1000) / 10 : 0;
    const isOverallSafe = overallPct >= 75;

    // Aggregate Bunk Cushion or Recovery
    let aggregateCushionText = '';
    if (isOverallSafe) {
      const netBunks = Math.floor((totalAttended - 0.75 * totalClasses) / 0.75);
      aggregateCushionText = netBunks > 0 ? `+${netBunks} classes cushion across semester` : 'At threshold margin';
    } else {
      const netRecovery = Math.ceil((0.75 * totalClasses - totalAttended) / 0.25);
      aggregateCushionText = `-${netRecovery} classes aggregate deficit`;
    }

    return {
      totalAttended,
      totalClasses,
      overallPct,
      safeCount,
      criticalCount,
      totalDL,
      totalML,
      totalSubjects: subjectStats.length,
      isOverallSafe,
      aggregateCushionText,
    };
  }, [subjectStats]);

  // Filtered and Sorted list
  const filteredAndSortedSubjects = useMemo(() => {
    let list = subjectStats.filter((s) => {
      const matchesSearch =
        s.subject.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.subject.code.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (filter === 'critical') return !s.isSafe;
      if (filter === 'safe') return s.isSafe;
      if (filter === 'leaves') return s.dutyLeaveCount > 0 || s.medicalLeaveCount > 0;
      return true;
    });

    if (sort === 'critical_first') {
      list.sort((a, b) => a.percentage - b.percentage);
    } else if (sort === 'highest_first') {
      list.sort((a, b) => b.percentage - a.percentage);
    } else if (sort === 'alphabetical') {
      list.sort((a, b) => a.subject.name.localeCompare(b.subject.name));
    }

    return list;
  }, [subjectStats, filter, sort, searchQuery]);

  const renderSubject = useCallback(
    ({ item }: { item: ProcessedSubject }) => (
      <SubjectCardItem
        item={item}
        colors={colors}
        onPress={() => {
          handleOpenDetail({
            code: item.subject.code,
            name: item.subject.name,
            viewActionTarget: item.subject.viewActionTarget,
            initialPredicting: true,
          });
        }}
      />
    ),
    [colors, handleOpenDetail]
  );

  // Circular gauge math for Hero card
  const gaugeRadius = 44;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset =
    gaugeCircumference - (gaugeCircumference * Math.min(100, Math.max(0, overallStats.overallPct))) / 100;
  const gaugeColor = overallStats.isOverallSafe ? '#22c55e' : '#ef4444';

  const ListHeader = useMemo(
    () => (
      <View style={styles.headerComponentWrapper}>
        {/* Overall Semester Health Hero Card */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.surfaceHigh,
              borderColor: overallStats.isOverallSafe ? '#22c55e35' : '#ef444435',
            },
          ]}
        >
          <View style={styles.heroRow}>
            {/* Left: SVG Radial Progress Ring */}
            <View style={styles.radialWrapper}>
              <Svg width={110} height={110} viewBox="0 0 110 110">
                {/* Track Circle */}
                <Circle
                  cx="55"
                  cy="55"
                  r={gaugeRadius}
                  stroke={colors.border}
                  strokeWidth="8"
                  fill="none"
                />
                {/* Progress Circle */}
                <Circle
                  cx="55"
                  cy="55"
                  r={gaugeRadius}
                  stroke={gaugeColor}
                  strokeWidth="8"
                  strokeDasharray={gaugeCircumference}
                  strokeDashoffset={gaugeOffset}
                  strokeLinecap="round"
                  fill="none"
                  transform="rotate(-90 55 55)"
                />
              </Svg>
              <View style={styles.radialCenterContent}>
                <Text style={[styles.radialPctText, { color: colors.text }]}>
                  {overallStats.overallPct}%
                </Text>
                <Text style={[styles.radialSubText, { color: colors.textMuted }]}>Overall</Text>
              </View>
            </View>

            {/* Right: Aggregate Summary Metrics */}
            <View style={styles.heroStatsRight}>
              <View style={styles.statusPillRow}>
                <View
                  style={[
                    styles.heroStatusBadge,
                    {
                      backgroundColor: overallStats.isOverallSafe ? '#22c55e15' : '#ef444415',
                      borderColor: overallStats.isOverallSafe ? '#22c55e40' : '#ef444440',
                    },
                  ]}
                >
                  <Ionicons
                    name={overallStats.isOverallSafe ? 'shield-checkmark' : 'warning'}
                    size={12}
                    color={overallStats.isOverallSafe ? '#22c55e' : '#ef4444'}
                  />
                  <Text
                    style={[
                      styles.heroStatusText,
                      { color: overallStats.isOverallSafe ? '#22c55e' : '#ef4444' },
                    ]}
                  >
                    {overallStats.isOverallSafe ? 'SAFE ZONE' : 'ACTION REQUIRED'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.heroRatioText, { color: colors.text }]}>
                {overallStats.totalAttended}{' '}
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>/ {overallStats.totalClasses} classes</Text>
              </Text>

              <Text style={[styles.cushionText, { color: overallStats.isOverallSafe ? '#22c55e' : '#ef4444' }]}>
                {overallStats.aggregateCushionText}
              </Text>

              {/* Course Ratio & Leaves tags */}
              <View style={styles.tagRow}>
                <View style={[styles.metaChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.metaChipText, { color: '#22c55e' }]}>
                    {overallStats.safeCount} Safe
                  </Text>
                </View>
                {overallStats.criticalCount > 0 && (
                  <View style={[styles.metaChip, { backgroundColor: '#ef444415', borderColor: '#ef444430' }]}>
                    <Text style={[styles.metaChipText, { color: '#ef4444' }]}>
                      {overallStats.criticalCount} Low
                    </Text>
                  </View>
                )}
                {(overallStats.totalDL > 0 || overallStats.totalML > 0) && (
                  <View style={[styles.metaChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.metaChipText, { color: colors.primary }]}>
                      {overallStats.totalDL + overallStats.totalML} Leaves
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Search Input Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={17} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search subject or course code..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips Bar */}
        <View style={styles.filterChipsRow}>
          <TouchableOpacity
            onPress={() => setFilter('all')}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === 'all' ? colors.primary : colors.surfaceHigh,
                borderColor: filter === 'all' ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[styles.filterChipText, { color: filter === 'all' ? '#fff' : colors.textMuted }]}>
              All ({subjectStats.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilter('critical')}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === 'critical' ? '#ef4444' : colors.surfaceHigh,
                borderColor: filter === 'critical' ? '#ef4444' : colors.border,
              },
            ]}
          >
            <Text style={[styles.filterChipText, { color: filter === 'critical' ? '#fff' : colors.textMuted }]}>
              Critical ({overallStats.criticalCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilter('safe')}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === 'safe' ? '#22c55e' : colors.surfaceHigh,
                borderColor: filter === 'safe' ? '#22c55e' : colors.border,
              },
            ]}
          >
            <Text style={[styles.filterChipText, { color: filter === 'safe' ? '#fff' : colors.textMuted }]}>
              Safe ({overallStats.safeCount})
            </Text>
          </TouchableOpacity>

          {(overallStats.totalDL > 0 || overallStats.totalML > 0) && (
            <TouchableOpacity
              onPress={() => setFilter('leaves')}
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === 'leaves' ? colors.primary : colors.surfaceHigh,
                  borderColor: filter === 'leaves' ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.filterChipText, { color: filter === 'leaves' ? '#fff' : colors.textMuted }]}>
                Leaves
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Sorting Toggle Header */}
        <View style={styles.sortHeaderRow}>
          <Text style={[styles.sortSectionTitle, { color: colors.text }]}>
            Courses ({filteredAndSortedSubjects.length})
          </Text>

          <View style={styles.sortActionsRow}>
            <TouchableOpacity
              onPress={() =>
                setSort((prev) =>
                  prev === 'critical_first'
                    ? 'highest_first'
                    : prev === 'highest_first'
                    ? 'alphabetical'
                    : 'critical_first'
                )
              }
              style={[styles.sortButton, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}
            >
              <Ionicons name="swap-vertical" size={12} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.sortButtonText, { color: colors.primary }]}>
                {sort === 'critical_first'
                  ? 'Critical First'
                  : sort === 'highest_first'
                  ? 'Highest %'
                  : 'A-Z'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    ),
    [
      colors,
      overallStats,
      gaugeColor,
      gaugeOffset,
      gaugeCircumference,
      gaugeRadius,
      searchQuery,
      filter,
      subjectStats.length,
      filteredAndSortedSubjects.length,
      sort,
    ]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (isDetailOpen) {
          handleCloseDetail();
        } else {
          onClose();
        }
      }}
    >
      <View style={[styles.container, { backgroundColor: colors.background, overflow: 'hidden' }]}>
        {/* Base Layer: Attendance Analytics List */}
        <View style={StyleSheet.absoluteFill}>
          {/* Sticky Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 }}>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeButton, { backgroundColor: colors.surfaceHigh }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="arrow-back" size={20} color={colors.text} />
              </TouchableOpacity>

              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Attendance Analytics</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                  Comprehensive Subject Intelligence
                </Text>
              </View>
            </View>
          </View>

          {/* Optimized Virtualized FlatList */}
          <FlatList
            data={filteredAndSortedSubjects}
            keyExtractor={(item) => item.subject.code}
            renderItem={renderSubject}
            ListHeaderComponent={ListHeader}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={6}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews={true}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={44} color={colors.textMuted} />
                <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
                  No subjects found matching your criteria
                </Text>
              </View>
            }
          />
        </View>

        {/* Animated Slide-over Layer: Detailed Attendance Modal */}
        {isDetailOpen && selectedSubject && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: colors.background,
                transform: [{ translateX: slideAnim }],
                borderLeftWidth: 1,
                borderLeftColor: colors.border,
              },
            ]}
          >
            <DetailedAttendanceModal
              visible={true}
              asModal={false}
              onClose={handleCloseDetail}
              subjectCode={selectedSubject.code}
              subjectName={selectedSubject.name}
              viewActionTarget={selectedSubject.viewActionTarget}
              initialPredicting={selectedSubject.initialPredicting ?? true}
            />
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 54,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
  },
  headerSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: Spacing.lg,
    paddingBottom: 50,
  },
  headerComponentWrapper: {
    marginBottom: 8,
  },
  heroCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  radialWrapper: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialCenterContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialPctText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
  },
  radialSubText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroStatsRight: {
    flex: 1,
    justifyContent: 'center',
  },
  statusPillRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  heroStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  heroStatusText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9.5,
    letterSpacing: 0.5,
  },
  heroRatioText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 18,
    marginTop: 2,
  },
  cushionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    marginTop: 2,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  metaChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  metaChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    padding: 0,
  },
  filterChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5.5,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  filterChipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
  },
  sortHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sortSectionTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
  },
  sortActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  sortButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  subjectCard: {
    borderRadius: Radius.xl,
    padding: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  subjectName: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14.5,
    lineHeight: 19,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  subjectCode: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
  },
  creditPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  creditText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9.5,
  },
  pctBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 64,
  },
  pctBadgeValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
  },
  pctStatusLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8.5,
    marginTop: 1,
    letterSpacing: 0.5,
  },
  barWrapper: {
    marginBottom: 10,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barGoalLine: {
    position: 'absolute',
    left: '75%',
    top: 0,
    bottom: 0,
    width: 2,
    alignItems: 'center',
  },
  barGoalTick: {
    width: 2,
    height: '100%',
  },
  barMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  barMetaText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10.5,
  },
  barGoalText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
  },
  statsPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  miniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  miniPillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
  },
  marginBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  marginBannerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    flexShrink: 1,
  },
  actionPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 6,
  },
  actionPromptText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 10,
  },
  emptyStateText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
});
