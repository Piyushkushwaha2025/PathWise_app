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
  Platform,
  StatusBar,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
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

// Modern Glass Subject Card Item
const SubjectCardItem = React.memo(({
  item,
  colors,
  isDark,
  onPress,
}: {
  item: ProcessedSubject;
  colors: any;
  isDark: boolean;
  onPress: () => void;
}) => {
  const sub = item.subject;
  const statusColor = item.isSafe ? '#10b981' : item.isWarning ? '#f59e0b' : '#ef4444';
  const statusBg = item.isSafe ? 'rgba(16, 185, 129, 0.12)' : item.isWarning ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)';
  const statusBorder = item.isSafe ? 'rgba(16, 185, 129, 0.3)' : item.isWarning ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)';
  const statusLabel = item.isSafe ? 'SAFE' : item.isWarning ? 'WARNING' : 'CRITICAL';

  const cardGradColors = isDark
    ? ['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.02)'] as const
    : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.75)'] as const;

  const glassBorderColor = isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.07)';
  const glassBorderTop = isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(255, 255, 255, 0.95)';

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={() => {
        try { Haptics.selectionAsync(); } catch {}
        onPress();
      }}
      style={styles.cardOuter}
    >
      <LinearGradient
        colors={cardGradColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.subjectCard,
          {
            borderColor: glassBorderColor,
            borderTopColor: glassBorderTop,
          },
        ]}
      >
        {/* Left Glowing Accent Indicator */}
        <View
          style={[
            styles.cardAccentBar,
            {
              backgroundColor: statusColor,
              shadowColor: statusColor,
            },
          ]}
        />

        {/* Top Header: Title, Code, Status & Percentage Badge */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={[styles.subjectName, { color: colors.text }]} numberOfLines={2}>
              {sub.name}
            </Text>
            <View style={styles.codeRow}>
              <View style={[styles.codeBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                <Text style={[styles.subjectCode, { color: colors.textDim }]}>{sub.code}</Text>
              </View>
              {sub.credits && sub.credits !== '0' && (
                <View style={[styles.creditPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]}>
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
          <View style={[styles.barTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}>
            <LinearGradient
              colors={
                item.isSafe
                  ? ['#10b981', '#34d399']
                  : item.isWarning
                  ? ['#f59e0b', '#fbbf24']
                  : ['#ef4444', '#f87171']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.barFill,
                {
                  width: `${Math.min(100, Math.max(0, item.percentage))}%`,
                },
              ]}
            />
            {/* 75% Target Marker */}
            <View style={styles.barGoalLine}>
              <View style={[styles.barGoalTick, { backgroundColor: colors.text }]} />
            </View>
          </View>

          <View style={styles.barMetaRow}>
            <Text style={[styles.barMetaText, { color: colors.textMuted }]}>
              <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: colors.text }}>{item.attended}</Text> attended of {item.total} classes
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.primary }} />
              <Text style={[styles.barGoalText, { color: colors.primary }]}>75% Target</Text>
            </View>
          </View>
        </View>

        {/* Breakdown Pills Row: Present, Absent, DL, ML */}
        <View style={styles.statsPillRow}>
          <View style={[styles.miniPill, { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.25)' }]}>
            <Ionicons name="checkmark-circle" size={13} color="#10b981" style={{ marginRight: 4 }} />
            <Text style={[styles.miniPillText, { color: '#10b981' }]}>{item.presentCount} Present</Text>
          </View>

          <View style={[styles.miniPill, { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.25)' }]}>
            <Ionicons name="close-circle" size={13} color="#ef4444" style={{ marginRight: 4 }} />
            <Text style={[styles.miniPillText, { color: '#ef4444' }]}>{item.absentCount} Absent</Text>
          </View>

          {item.dutyLeaveCount > 0 && (
            <View style={[styles.miniPill, { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.25)' }]}>
              <Ionicons name="briefcase" size={12} color="#3b82f6" style={{ marginRight: 4 }} />
              <Text style={[styles.miniPillText, { color: '#3b82f6' }]}>{item.dutyLeaveCount} DL</Text>
            </View>
          )}

          {item.medicalLeaveCount > 0 && (
            <View style={[styles.miniPill, { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.25)' }]}>
              <Ionicons name="medkit" size={12} color="#f59e0b" style={{ marginRight: 4 }} />
              <Text style={[styles.miniPillText, { color: '#f59e0b' }]}>{item.medicalLeaveCount} ML</Text>
            </View>
          )}
        </View>

        {/* Smart Margin / Action Pill */}
        <View style={[styles.marginBanner, { backgroundColor: statusBg, borderColor: statusBorder }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
            <Ionicons
              name={item.isSafe ? 'shield-checkmark' : 'alert-circle'}
              size={15}
              color={statusColor}
            />
            <Text style={[styles.marginBannerText, { color: statusColor }]} numberOfLines={1}>
              {item.marginText}
            </Text>
          </View>

          <View style={[styles.actionPrompt, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
            <Text style={[styles.actionPromptText, { color: colors.primary }]}>Predictor</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.primary} />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
});

export function AttendanceOverviewModal({
  visible,
  onClose,
  onSelectSubject,
}: AttendanceOverviewModalProps) {
  const { colors, theme } = useThemeStore();
  const isDark = theme === 'black';
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
        isDark={isDark}
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
    [colors, isDark, handleOpenDetail]
  );

  // Circular gauge math for Hero card
  const gaugeRadius = 45;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset =
    gaugeCircumference - (gaugeCircumference * Math.min(100, Math.max(0, overallStats.overallPct))) / 100;

  const ListHeader = useMemo(
    () => {
      const heroGradColors = isDark
        ? ['rgba(255, 255, 255, 0.09)', 'rgba(255, 255, 255, 0.02)'] as const
        : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.80)'] as const;
      const heroBorderColor = overallStats.isOverallSafe
        ? 'rgba(16, 185, 129, 0.35)'
        : 'rgba(239, 68, 68, 0.35)';
      const heroBorderTop = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.95)';

      return (
        <View style={styles.headerComponentWrapper}>
          {/* Overall Semester Health Hero Card */}
          <LinearGradient
            colors={heroGradColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.heroCard,
              {
                borderColor: heroBorderColor,
                borderTopColor: heroBorderTop,
              },
            ]}
          >
            <View style={styles.heroRow}>
              {/* Left: SVG Radial Progress Ring with Gradient */}
              <View style={styles.radialWrapper}>
                <Svg width={116} height={116} viewBox="0 0 116 116">
                  <Defs>
                    <SvgGradient id="heroGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <Stop offset="0%" stopColor={overallStats.isOverallSafe ? '#10b981' : '#ef4444'} />
                      <Stop offset="100%" stopColor={overallStats.isOverallSafe ? '#06b6d4' : '#f97316'} />
                    </SvgGradient>
                  </Defs>
                  {/* Track Circle */}
                  <Circle
                    cx="58"
                    cy="58"
                    r={gaugeRadius}
                    stroke={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.07)'}
                    strokeWidth="9"
                    fill="none"
                  />
                  {/* Progress Circle with Gradient */}
                  <Circle
                    cx="58"
                    cy="58"
                    r={gaugeRadius}
                    stroke="url(#heroGaugeGrad)"
                    strokeWidth="9"
                    strokeDasharray={gaugeCircumference}
                    strokeDashoffset={gaugeOffset}
                    strokeLinecap="round"
                    fill="none"
                    transform="rotate(-90 58 58)"
                  />
                </Svg>
                <View style={styles.radialCenterContent}>
                  <Text style={[styles.radialPctText, { color: colors.text }]}>
                    {overallStats.overallPct}%
                  </Text>
                  <View style={[styles.radialLabelPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                    <Text style={[styles.radialSubText, { color: colors.textMuted }]}>OVERALL</Text>
                  </View>
                </View>
              </View>

              {/* Right: Aggregate Summary Metrics */}
              <View style={styles.heroStatsRight}>
                <View style={styles.statusPillRow}>
                  <View
                    style={[
                      styles.heroStatusBadge,
                      {
                        backgroundColor: overallStats.isOverallSafe ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        borderColor: overallStats.isOverallSafe ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                      },
                    ]}
                  >
                    <Ionicons
                      name={overallStats.isOverallSafe ? 'shield-checkmark' : 'warning'}
                      size={13}
                      color={overallStats.isOverallSafe ? '#10b981' : '#ef4444'}
                    />
                    <Text
                      style={[
                        styles.heroStatusText,
                        { color: overallStats.isOverallSafe ? '#10b981' : '#ef4444' },
                      ]}
                    >
                      {overallStats.isOverallSafe ? 'SAFE ZONE' : 'ATTENTION REQUIRED'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.heroRatioText, { color: colors.text }]}>
                  {overallStats.totalAttended}{' '}
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: 'Inter_500Medium' }}>
                    / {overallStats.totalClasses} classes
                  </Text>
                </Text>

                <Text style={[styles.cushionText, { color: overallStats.isOverallSafe ? '#10b981' : '#ef4444' }]}>
                  {overallStats.aggregateCushionText}
                </Text>

                {/* Course Ratio & Leaves tags */}
                <View style={styles.tagRow}>
                  <View style={[styles.metaChip, { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                    <Text style={[styles.metaChipText, { color: '#10b981' }]}>
                      {overallStats.safeCount} Safe
                    </Text>
                  </View>
                  {overallStats.criticalCount > 0 && (
                    <View style={[styles.metaChip, { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
                      <Text style={[styles.metaChipText, { color: '#ef4444' }]}>
                        {overallStats.criticalCount} Low
                      </Text>
                    </View>
                  )}
                  {(overallStats.totalDL > 0 || overallStats.totalML > 0) && (
                    <View style={[styles.metaChip, { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.3)' }]}>
                      <Text style={[styles.metaChipText, { color: '#3b82f6' }]}>
                        {overallStats.totalDL + overallStats.totalML} Leaves
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </LinearGradient>

          {/* Search Input Bar */}
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)',
              },
            ]}
          >
            <Ionicons name="search-outline" size={17} color={colors.primary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search subject or course code..."
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
            />
            {searchQuery !== '' && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={17} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Chips Bar */}
          <View style={styles.filterChipsRow}>
            <TouchableOpacity
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setFilter('all');
              }}
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === 'all' ? colors.primary : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  borderColor: filter === 'all' ? colors.primary : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                },
              ]}
            >
              <Text style={[styles.filterChipText, { color: filter === 'all' ? '#fff' : colors.textMuted }]}>
                All ({subjectStats.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setFilter('critical');
              }}
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === 'critical' ? '#ef4444' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  borderColor: filter === 'critical' ? '#ef4444' : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: filter === 'critical' ? '#fff' : '#ef4444' }} />
                <Text style={[styles.filterChipText, { color: filter === 'critical' ? '#fff' : colors.textMuted }]}>
                  Critical ({overallStats.criticalCount})
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setFilter('safe');
              }}
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === 'safe' ? '#10b981' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  borderColor: filter === 'safe' ? '#10b981' : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: filter === 'safe' ? '#fff' : '#10b981' }} />
                <Text style={[styles.filterChipText, { color: filter === 'safe' ? '#fff' : colors.textMuted }]}>
                  Safe ({overallStats.safeCount})
                </Text>
              </View>
            </TouchableOpacity>

            {(overallStats.totalDL > 0 || overallStats.totalML > 0) && (
              <TouchableOpacity
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setFilter('leaves');
                }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: filter === 'leaves' ? colors.primary : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    borderColor: filter === 'leaves' ? colors.primary : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: filter === 'leaves' ? '#fff' : colors.primary }} />
                  <Text style={[styles.filterChipText, { color: filter === 'leaves' ? '#fff' : colors.textMuted }]}>
                    Leaves
                  </Text>
                </View>
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
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setSort((prev) =>
                    prev === 'critical_first'
                      ? 'highest_first'
                      : prev === 'highest_first'
                      ? 'alphabetical'
                      : 'critical_first'
                  );
                }}
                style={[
                  styles.sortButton,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
              >
                <Ionicons name="swap-vertical" size={13} color={colors.primary} style={{ marginRight: 4 }} />
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
      );
    },
    [
      colors,
      isDark,
      overallStats,
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
      statusBarTranslucent={true}
      onRequestClose={() => {
        if (isDetailOpen) {
          handleCloseDetail();
        } else {
          onClose();
        }
      }}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent={true}
      />
      <View style={[styles.container, { backgroundColor: colors.background, overflow: 'hidden' }]}>
        {/* Ambient Backlight Glow Blobs (Glass Backdrop) */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LinearGradient
            colors={[overallStats.isOverallSafe ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', 'transparent']}
            style={{ position: 'absolute', top: -50, left: -50, width: 260, height: 260, borderRadius: 130 }}
          />
          <LinearGradient
            colors={['rgba(59, 130, 246, 0.08)', 'transparent']}
            style={{ position: 'absolute', top: 180, right: -70, width: 240, height: 240, borderRadius: 120 }}
          />
        </View>

        {/* Base Layer: Attendance Analytics List */}
        <View style={StyleSheet.absoluteFill}>
          {/* Glass Sticky Header */}
          <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  onClose();
                }}
                style={[
                  styles.closeButton,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="arrow-back" size={20} color={colors.text} />
              </TouchableOpacity>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.headerTitle, { color: colors.text }]}>Attendance Analytics</Text>
                  <View style={[styles.liveDot, { backgroundColor: overallStats.isOverallSafe ? '#10b981' : '#ef4444' }]} />
                </View>
                <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                  Semester Intelligence & Prediction Hub
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
    letterSpacing: -0.3,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  headerSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
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
    borderRadius: 24,
    borderWidth: 1.2,
    borderTopWidth: 1.5,
    padding: 18,
    marginBottom: 16,
    overflow: 'hidden',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  radialWrapper: {
    width: 116,
    height: 116,
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
    fontSize: 23,
    letterSpacing: -0.5,
  },
  radialLabelPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginTop: 2,
  },
  radialSubText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8.5,
    letterSpacing: 0.8,
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
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  heroStatusText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9.5,
    letterSpacing: 0.6,
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
    paddingVertical: 3.5,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    marginBottom: 12,
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
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 6.5,
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
    marginBottom: 12,
    paddingHorizontal: 2,
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
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 20,
    borderWidth: 1,
  },
  sortButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  cardOuter: {
    marginBottom: 12,
  },
  subjectCard: {
    borderRadius: 22,
    padding: 15,
    paddingLeft: 18,
    borderWidth: 1,
    borderTopWidth: 1.5,
    position: 'relative',
    overflow: 'hidden',
  },
  cardAccentBar: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 4,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    shadowOffset: { width: 1, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  subjectName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  codeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subjectCode: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  creditPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  creditText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9.5,
  },
  pctBadge: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 66,
  },
  pctBadgeValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16.5,
    letterSpacing: -0.3,
  },
  pctStatusLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8.5,
    marginTop: 1,
    letterSpacing: 0.6,
  },
  barWrapper: {
    marginBottom: 10,
  },
  barTrack: {
    height: 7,
    borderRadius: 3.5,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 3.5,
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
    alignItems: 'center',
    marginTop: 5,
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
    borderRadius: 8,
    borderWidth: 1,
  },
  miniPillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10.5,
  },
  marginBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
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
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
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

