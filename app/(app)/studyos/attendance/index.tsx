import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CheckCircle2, AlertTriangle, ShieldCheck, Search, X, BookOpen } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useAttendance } from '../../../../hooks/useAttendance';
import { useThemeStore } from '../../../../store/useThemeStore';
import { useStudyOSStore, CulkoSubject } from '../../../../store/studyosStore';
import { useStudySessionStore } from '../../../../store/studySessionStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { DetailedAttendanceModal } from '../../../../components/DetailedAttendanceModal';

interface SubjectItem {
  code: string;
  name: string;
  credits?: string;
  totalClasses: number;
  attendedClasses: number;
  percentage: number;
  isSafe: boolean;
  isWarning: boolean;
  safeBunks: number;
  recoveryNeeded: number;
  bunkMsg: string;
  viewActionTarget?: string;
}

export default function AttendanceScreen() {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';

  const router = useRouter();
  const { clearSession } = useStudySessionStore();
  const storeSubjects = useStudyOSStore((s) => s.subjects) || [];
  const { data: attendanceApiData, isLoading, isFetching, error, refetch } = useAttendance();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'safe' | 'critical'>('all');
  const [selectedSubject, setSelectedSubject] = useState<{
    code: string;
    name: string;
    viewActionTarget?: string;
  } | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Build unified and validated subject list
  const subjectsList = useMemo<SubjectItem[]>(() => {
    // Prefer store subjects (richer with codes, credits, viewActionTarget)
    if (storeSubjects.length > 0) {
      return storeSubjects.map((sub: CulkoSubject) => {
        const total = Number(sub.totalClasses || 0);
        const attended = Number(sub.attendedClasses || 0);
        const rawPct = total > 0 ? (attended / total) * 100 : Number(sub.attendancePercentage || 0);
        const percentage = Math.round(rawPct * 10) / 10;
        const isSafe = percentage >= 75;
        const isWarning = percentage >= 65 && percentage < 75;

        let safeBunks = 0;
        let recoveryNeeded = 0;
        let bunkMsg = '';

        if (isSafe) {
          safeBunks = total > 0 ? Math.floor((attended - 0.75 * total) / 0.75) : 0;
          bunkMsg = safeBunks > 0
            ? `Safe to skip next ${safeBunks} class${safeBunks > 1 ? 'es' : ''}`
            : 'On track for 75% — cannot miss next class';
        } else {
          recoveryNeeded = total > 0 ? Math.ceil((0.75 * total - attended) / 0.25) : 1;
          bunkMsg = `Attend next ${recoveryNeeded} class${recoveryNeeded > 1 ? 'es' : ''} to reach 75%`;
        }

        return {
          code: sub.code,
          name: sub.name,
          credits: sub.credits,
          totalClasses: total,
          attendedClasses: attended,
          percentage,
          isSafe,
          isWarning,
          safeBunks,
          recoveryNeeded,
          bunkMsg,
          viewActionTarget: sub.viewActionTarget,
        };
      });
    }

    // Fallback to useAttendance API data
    if (Array.isArray(attendanceApiData) && attendanceApiData.length > 0) {
      return attendanceApiData.map((item) => {
        const nameParts = item.subjectName.split('-');
        const code = nameParts.length > 1 ? nameParts[0].trim() : '';
        const name = nameParts.length > 1 ? nameParts.slice(1).join('-').trim() : item.subjectName;
        const total = Number(item.totalClasses || 0);
        const attended = Number(item.attendedClasses || 0);
        const pct = typeof item.percentage === 'number'
          ? item.percentage
          : total > 0 ? (attended / total) * 100 : 0;
        const percentage = Math.round(pct * 10) / 10;
        const isSafe = percentage >= 75;
        const isWarning = percentage >= 65 && percentage < 75;

        let safeBunks = 0;
        let recoveryNeeded = 0;
        let bunkMsg = '';

        if (isSafe) {
          safeBunks = total > 0 ? Math.floor((attended - 0.75 * total) / 0.75) : 0;
          bunkMsg = safeBunks > 0
            ? `Safe to skip next ${safeBunks} class${safeBunks > 1 ? 'es' : ''}`
            : 'On track for 75% — cannot miss next class';
        } else {
          recoveryNeeded = total > 0 ? Math.ceil((0.75 * total - attended) / 0.25) : 1;
          bunkMsg = `Attend next ${recoveryNeeded} class${recoveryNeeded > 1 ? 'es' : ''} to reach 75%`;
        }

        return {
          code: code || item.subjectName.slice(0, 10),
          name: name || item.subjectName,
          credits: '',
          totalClasses: total,
          attendedClasses: attended,
          percentage,
          isSafe,
          isWarning,
          safeBunks,
          recoveryNeeded,
          bunkMsg,
          viewActionTarget: undefined,
        };
      });
    }

    return [];
  }, [storeSubjects, attendanceApiData]);

  // Aggregate stats across semester
  const overallStats = useMemo(() => {
    let totalAttended = 0;
    let totalClasses = 0;
    let safeCount = 0;
    let criticalCount = 0;

    subjectsList.forEach((s) => {
      totalAttended += s.attendedClasses;
      totalClasses += s.totalClasses;
      if (s.isSafe) safeCount++;
      else criticalCount++;
    });

    const overallPct = totalClasses > 0 ? Math.round((totalAttended / totalClasses) * 1000) / 10 : 0;
    const isOverallSafe = overallPct >= 75;

    let aggregateCushionText = '';
    if (isOverallSafe) {
      const netBunks = Math.floor((totalAttended - 0.75 * totalClasses) / 0.75);
      aggregateCushionText = netBunks > 0 ? `+${netBunks} classes cushion across semester` : 'At 75% threshold margin';
    } else {
      const netRecovery = Math.ceil((0.75 * totalClasses - totalAttended) / 0.25);
      aggregateCushionText = `-${netRecovery} classes needed across semester`;
    }

    return {
      totalAttended,
      totalClasses,
      overallPct,
      safeCount,
      criticalCount,
      isOverallSafe,
      aggregateCushionText,
    };
  }, [subjectsList]);

  // Filter & search
  const filteredSubjects = useMemo(() => {
    return subjectsList.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (filter === 'safe') return s.isSafe;
      if (filter === 'critical') return !s.isSafe;
      return true;
    });
  }, [subjectsList, searchQuery, filter]);

  // SVG Gauge calculations
  const gaugeRadius = 42;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference - (gaugeCircumference * Math.min(100, Math.max(0, overallStats.overallPct))) / 100;

  // Loading skeleton
  if (isLoading && subjectsList.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, paddingHorizontal: 8 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Attendance Checker</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>Loading your attendance...</Text>
          </View>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Fetching attendance data from portal...</Text>
        </View>
      </View>
    );
  }

  // Session expired or error state
  if (error && subjectsList.length === 0) {
    if ((error as Error).message.includes('expired') || error.name === 'SessionExpiredError') {
      setTimeout(() => {
        clearSession(true).then(() => {
          router.replace('/(app)/studyos/connect');
        });
      }, 100);
      return (
        <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Session expired. Reconnecting...</Text>
        </View>
      );
    }

    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text style={[styles.errorText, { color: colors.text }]}>Failed to load attendance.</Text>
        <Text style={[styles.errorSub, { color: colors.textMuted }]}>{(error as Error).message}</Text>
        <TouchableOpacity onPress={handleRefresh} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
          <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Modern Frosted Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, paddingHorizontal: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Attendance Checker</Text>
            <View style={[styles.liveDot, { backgroundColor: overallStats.isOverallSafe ? '#22c55e' : '#ef4444' }]} />
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            Bunk calculator & semester analytics
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleRefresh}
          disabled={isRefreshing || isFetching}
          style={[styles.refreshBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}
        >
          {isRefreshing || isFetching ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="refresh" size={17} color={colors.text} />
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredSubjects}
        keyExtractor={(item, index) => `${item.code}-${index}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ marginBottom: 14 }}>
            {/* Top Semester Overview Hero Card */}
            <LinearGradient
              colors={isDark ? ['#1e1e24', '#111115'] : ['#ffffff', '#f8fafc']}
              style={[
                styles.heroCard,
                {
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                  shadowColor: overallStats.isOverallSafe ? '#22c55e' : '#ef4444',
                },
              ]}
            >
              <View style={styles.heroRow}>
                {/* SVG Radial Progress Ring */}
                <View style={styles.radialWrapper}>
                  <Svg width={100} height={100} viewBox="0 0 100 100">
                    <Defs>
                      <SvgLinearGradient id="heroGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor={overallStats.isOverallSafe ? '#22c55e' : '#ef4444'} />
                        <Stop offset="100%" stopColor={overallStats.isOverallSafe ? '#06b6d4' : '#f97316'} />
                      </SvgLinearGradient>
                    </Defs>
                    {/* Track Circle */}
                    <Circle
                      cx="50"
                      cy="50"
                      r={gaugeRadius}
                      stroke={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.07)'}
                      strokeWidth="8"
                      fill="none"
                    />
                    {/* Progress Circle with Gradient */}
                    <Circle
                      cx="50"
                      cy="50"
                      r={gaugeRadius}
                      stroke="url(#heroGaugeGrad)"
                      strokeWidth="8"
                      strokeDasharray={gaugeCircumference}
                      strokeDashoffset={gaugeOffset}
                      strokeLinecap="round"
                      fill="none"
                      transform="rotate(-90 50 50)"
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

                {/* Right: Summary Metrics */}
                <View style={styles.heroStatsRight}>
                  <View style={styles.statusPillRow}>
                    <View
                      style={[
                        styles.heroStatusBadge,
                        {
                          backgroundColor: overallStats.isOverallSafe ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          borderColor: overallStats.isOverallSafe ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
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

                  <Text style={[styles.cushionText, { color: overallStats.isOverallSafe ? '#22c55e' : '#ef4444' }]} numberOfLines={1}>
                    {overallStats.aggregateCushionText}
                  </Text>

                  {/* Tags */}
                  <View style={styles.tagRow}>
                    <View style={[styles.metaChip, { backgroundColor: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.3)' }]}>
                      <Text style={[styles.metaChipText, { color: '#22c55e' }]}>
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
              <Search size={15} color={colors.primary} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search subject or course code..."
                placeholderTextColor={colors.textMuted}
                style={[styles.searchInput, { color: colors.text }]}
              />
              {searchQuery !== '' && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={15} color={colors.textMuted} />
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
                  All ({subjectsList.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setFilter('safe');
                }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: filter === 'safe' ? '#22c55e' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    borderColor: filter === 'safe' ? '#22c55e' : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: filter === 'safe' ? '#fff' : '#22c55e' }} />
                  <Text style={[styles.filterChipText, { color: filter === 'safe' ? '#fff' : colors.textMuted }]}>
                    Safe ({overallStats.safeCount})
                  </Text>
                </View>
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
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const statusColor = item.isSafe ? '#22c55e' : item.isWarning ? '#f59e0b' : '#ef4444';
          const statusBg = item.isSafe ? 'rgba(34, 197, 94, 0.12)' : item.isWarning ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)';
          const statusBorder = item.isSafe ? 'rgba(34, 197, 94, 0.25)' : item.isWarning ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.25)';
          const statusLabel = item.isSafe ? 'SAFE' : item.isWarning ? 'WARNING' : 'CRITICAL';

          return (
            <TouchableOpacity
              activeOpacity={0.78}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setSelectedSubject({
                  code: item.code,
                  name: item.name,
                  viewActionTarget: item.viewActionTarget,
                });
              }}
              style={[
                styles.subjectCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  borderLeftColor: statusColor,
                },
              ]}
            >
              {/* Top Header: Title, Code & Percentage Badge */}
              <View style={styles.cardHeader}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={[styles.subjectName, { color: colors.text }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <View style={styles.codeRow}>
                    <View style={[styles.codeBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                      <Text style={[styles.subjectCode, { color: colors.textDim }]}>{item.code}</Text>
                    </View>
                    {item.credits && item.credits !== '0' && (
                      <View style={[styles.creditPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }]}>
                        <Text style={[styles.creditText, { color: colors.textMuted }]}>{item.credits} Credits</Text>
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
                        ? ['#22c55e', '#16a34a']
                        : item.isWarning
                        ? ['#f59e0b', '#d97706']
                        : ['#ef4444', '#dc2626']
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
                  {/* 75% Goal Marker */}
                  <View style={styles.barGoalLine}>
                    <View style={[styles.barGoalTick, { backgroundColor: colors.text }]} />
                  </View>
                </View>

                <View style={styles.barMetaRow}>
                  <Text style={[styles.barMetaText, { color: colors.textMuted }]}>
                    <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: colors.text }}>{item.attendedClasses}</Text> attended of {item.totalClasses} classes
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.primary }} />
                    <Text style={[styles.barGoalText, { color: colors.primary }]}>75% Target</Text>
                  </View>
                </View>
              </View>

              {/* Smart Bunk Margin Banner */}
              <View style={[styles.marginBanner, { backgroundColor: statusBg, borderColor: statusBorder }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                  {item.isSafe ? (
                    <CheckCircle2 size={14} color={statusColor} />
                  ) : (
                    <AlertTriangle size={14} color={statusColor} />
                  )}
                  <Text style={[styles.marginText, { color: statusColor }]} numberOfLines={1}>
                    {item.bunkMsg}
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={14} color={statusColor} />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
              No subjects found matching "{searchQuery}"
            </Text>
          </View>
        }
      />

      {/* Slide-over Detailed Attendance Modal */}
      {selectedSubject && (
        <DetailedAttendanceModal
          visible={!!selectedSubject}
          onClose={() => setSelectedSubject(null)}
          subjectCode={selectedSubject.code}
          subjectName={selectedSubject.name}
          viewActionTarget={selectedSubject.viewActionTarget}
          initialPredicting={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 8,
    borderRadius: 20,
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginTop: 1,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
    marginTop: 12,
  },
  errorSub: {
    fontSize: 12.5,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },

  // Hero Card
  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radialWrapper: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialCenterContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialPctText: {
    fontSize: 20,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  radialLabelPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  radialSubText: {
    fontSize: 8.5,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  heroStatsRight: {
    flex: 1,
    paddingLeft: 14,
  },
  statusPillRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  heroStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  heroStatusText: {
    fontSize: 9.5,
    fontFamily: 'Inter_700Bold',
  },
  heroRatioText: {
    fontSize: 17,
    fontFamily: 'SpaceGrotesk_700Bold',
    marginTop: 2,
  },
  cushionText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 2,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  metaChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  metaChipText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },

  // Search & Filter
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
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
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11.5,
    fontFamily: 'Inter_600SemiBold',
  },

  // Subject Card
  subjectCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  subjectName: {
    fontSize: 14.5,
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 19,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  codeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  subjectCode: {
    fontSize: 10.5,
    fontFamily: 'SpaceGrotesk_600SemiBold',
  },
  creditPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  creditText: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  pctBadge: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  pctBadgeValue: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 20,
  },
  pctStatusLabel: {
    fontSize: 8.5,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
  },

  // Bar
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
    justifyContent: 'center',
  },
  barGoalTick: {
    width: 2,
    height: '100%',
    opacity: 0.8,
  },
  barMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  barMetaText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  barGoalText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },

  // Margin Banner
  marginBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  marginText: {
    fontSize: 11.5,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
  },
  emptyStateText: {
    marginTop: 10,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
});
