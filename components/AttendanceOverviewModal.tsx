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
  ScrollView,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../store/useThemeStore';
import { useStudyOSStore, CulkoSubject } from '../store/studyosStore';
import { Typography, Spacing, Radius } from '../constants/theme';
import { DetailedAttendanceModal } from './DetailedAttendanceModal';
import { isHolidayOrExam, agendaItems } from '../constants/calendar';

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

interface SubjectForecastItem {
  subject: CulkoSubject;
  currTotal: number;
  currAttended: number;
  currPct: number;
  scheduled: number;
  lectures: number;
  practicals: number;
  newTotal: number;
  projPctAll: number;
  miss1Pct: number | null;
  miss2Pct: number | null;
  maxSafeBunksInPeriod: number;
  isProjSafe: boolean;
  isProjWarning: boolean;
}

interface DayTimelineItem {
  date: Date;
  dateStr: string;
  dayLabel: string;
  formattedDate: string;
  isToday: boolean;
  isTomorrow: boolean;
  isOff: boolean;
  offReason?: string;
  isHoliday?: boolean;
  isExam?: boolean;
  slots: {
    slot: any;
    matchedSubject: CulkoSubject | null;
    classType: 'Practical' | 'Lecture';
  }[];
}

const DAYS_ARRAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getSlotClassType = (slot: any): 'Practical' | 'Lecture' => {
  if (!slot) return 'Lecture';
  if (slot.type) {
    const t = String(slot.type).toLowerCase();
    if (t.includes('prac') || t.includes('lab') || t === 'p') return 'Practical';
    if (t.includes('lec') || t.includes('theory') || t === 'l') return 'Lecture';
  }
  const rawName = String(slot.subjectName || '');
  if (/\b(lab|practical|practicle)\b/i.test(rawName) || rawName.includes('(Lab)')) {
    return 'Practical';
  }
  const codeWord = rawName.split(' ')[0] || '';
  if (/[A-Z0-9]+P-\d+/i.test(codeWord)) {
    return 'Practical';
  }
  return 'Lecture';
};

const getDayEvent = (date: Date) => {
  if (date.getDay() === 0) return { title: 'Sunday (Non-teaching day)', isHoliday: true, isExam: false };
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;
  const events = agendaItems[dateStr];
  if (events && events.length > 0) {
    const ev = events[0];
    return {
      title: ev.activity || (ev.isHoliday ? 'Holiday' : ev.isExam ? 'Exam' : 'Event'),
      isHoliday: !!ev.isHoliday,
      isExam: !!ev.isExam,
    };
  }
  return null;
};

const getDaysUntilSemesterEnd = () => {
  const today = new Date();
  const currentYear = today.getFullYear();
  let semEnd = new Date(currentYear, 10, 16); // 16 Nov
  if (today > semEnd) {
    semEnd = new Date(currentYear + 1, 4, 15);
  }
  const diffDays = Math.ceil((semEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(14, Math.min(90, diffDays));
};

const matchSlotToSubject = (slot: any, subjectList: CulkoSubject[]): CulkoSubject | null => {
  if (!slot || !Array.isArray(subjectList) || subjectList.length === 0) return null;
  const slotText = `${slot.subjectName || ''} ${slot.group || ''}`.toLowerCase().trim();
  if (!slotText) return null;

  for (const s of subjectList) {
    const rawCode = (s.code || '').trim().toLowerCase();
    if (rawCode && slotText.includes(rawCode)) return s;
    const baseCode = rawCode.split(' ')[0].trim();
    if (baseCode.length >= 4 && slotText.includes(baseCode)) return s;
  }

  for (const s of subjectList) {
    const rawName = (s.name || '').trim().toLowerCase();
    if (rawName.length >= 4 && (slotText.includes(rawName) || rawName.includes(slotText))) {
      return s;
    }
  }

  for (const s of subjectList) {
    const words = (s.name || '').toLowerCase().split(/[^a-z0-9]+/i).filter((w) => w.length >= 4);
    if (words.length > 0) {
      const matchCount = words.filter((w) => slotText.includes(w)).length;
      if (matchCount >= Math.min(2, words.length)) return s;
    }
  }

  return null;
};

// Modern Glass Subject Card Item for Overview
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
    ? (['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.02)'] as const)
    : (['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.75)'] as const);

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
        <View
          style={[
            styles.cardAccentBar,
            {
              backgroundColor: statusColor,
              shadowColor: statusColor,
            },
          ]}
        />

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

// Modern Subject Forecast Card Item for Predictor Mode
const PredictorSubjectCardItem = React.memo(({
  item,
  colors,
  isDark,
  onPress,
}: {
  item: SubjectForecastItem;
  colors: any;
  isDark: boolean;
  onPress: () => void;
}) => {
  const sub = item.subject;
  const gain = Math.round((item.projPctAll - item.currPct) * 10) / 10;
  const isPositive = gain >= 0;

  const statusColor = item.isProjSafe ? '#10b981' : item.isProjWarning ? '#f59e0b' : '#ef4444';
  const statusBg = item.isProjSafe ? 'rgba(16, 185, 129, 0.12)' : item.isProjWarning ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)';
  const statusBorder = item.isProjSafe ? 'rgba(16, 185, 129, 0.3)' : item.isProjWarning ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)';

  const cardGradColors = isDark
    ? (['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.02)'] as const)
    : (['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.75)'] as const);

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
            borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.07)',
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(255, 255, 255, 0.95)',
          },
        ]}
      >
        <View style={[styles.cardAccentBar, { backgroundColor: statusColor, shadowColor: statusColor }]} />

        {/* Top Header */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={[styles.subjectName, { color: colors.text }]} numberOfLines={2}>
              {sub.name}
            </Text>
            <View style={styles.codeRow}>
              <View style={[styles.codeBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                <Text style={[styles.subjectCode, { color: colors.textDim }]}>{sub.code}</Text>
              </View>
              <View style={[styles.creditPill, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)' }]}>
                <Text style={[styles.creditText, { color: colors.primary }]}>
                  {item.scheduled} class{item.scheduled !== 1 ? 'es' : ''} scheduled
                </Text>
              </View>
            </View>
          </View>

          {/* Current vs Projected Pill */}
          <View style={[styles.pctBadge, { backgroundColor: statusBg, borderColor: statusBorder }]}>
            <Text style={[styles.pctBadgeValue, { color: statusColor }]}>{item.projPctAll}%</Text>
            <Text style={[styles.pctStatusLabel, { color: statusColor }]}>
              {isPositive ? `+${gain}%` : `${gain}%`}
            </Text>
          </View>
        </View>

        {/* Progress Comparison */}
        <View style={styles.barWrapper}>
          <View style={[styles.barTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}>
            {/* Projected full bar in lighter tone */}
            <LinearGradient
              colors={['#10b98150', '#34d39950']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.barFill,
                { width: `${Math.min(100, Math.max(0, item.projPctAll))}%`, position: 'absolute' },
              ]}
            />
            {/* Current bar solid */}
            <LinearGradient
              colors={
                item.currPct >= 75
                  ? ['#10b981', '#34d399']
                  : item.currPct >= 65
                  ? ['#f59e0b', '#fbbf24']
                  : ['#ef4444', '#f87171']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.barFill,
                { width: `${Math.min(100, Math.max(0, item.currPct))}%` },
              ]}
            />
            <View style={styles.barGoalLine}>
              <View style={[styles.barGoalTick, { backgroundColor: colors.text }]} />
            </View>
          </View>

          <View style={styles.barMetaRow}>
            <Text style={[styles.barMetaText, { color: colors.textMuted }]}>
              Current: <Text style={{ fontFamily: 'SpaceGrotesk_700Bold', color: colors.text }}>{item.currPct}%</Text> ({item.currAttended}/{item.currTotal})
            </Text>
            <Text style={[styles.barMetaText, { color: statusColor, fontFamily: 'Inter_600SemiBold' }]}>
              Max: {item.projPctAll}% ({item.currAttended + item.scheduled}/{item.newTotal})
            </Text>
          </View>
        </View>

        {/* Scenario Analysis Grid (Attend All vs Miss 1 vs Miss 2) */}
        <View style={styles.scenarioGridRow}>
          <View style={[styles.scenarioCol, { backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.2)' }]}>
            <Text style={[styles.scenarioLabel, { color: '#10b981' }]}>Attend All</Text>
            <Text style={[styles.scenarioVal, { color: '#10b981' }]}>{item.projPctAll}%</Text>
          </View>

          <View style={[styles.scenarioCol, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
            <Text style={[styles.scenarioLabel, { color: colors.textMuted }]}>Miss 1 Class</Text>
            <Text style={[styles.scenarioVal, { color: (item.miss1Pct ?? item.currPct) >= 75 ? '#10b981' : '#f59e0b' }]}>
              {item.miss1Pct !== null ? `${item.miss1Pct}%` : '—'}
            </Text>
          </View>

          <View style={[styles.scenarioCol, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
            <Text style={[styles.scenarioLabel, { color: colors.textMuted }]}>Miss 2 Classes</Text>
            <Text style={[styles.scenarioVal, { color: (item.miss2Pct ?? item.currPct) >= 75 ? '#10b981' : (item.miss2Pct ?? 0) >= 65 ? '#f59e0b' : '#ef4444' }]}>
              {item.miss2Pct !== null ? `${item.miss2Pct}%` : '—'}
            </Text>
          </View>
        </View>

        {/* Breakdown of lectures and labs scheduled */}
        {(item.lectures > 0 || item.practicals > 0) && (
          <View style={styles.statsPillRow}>
            {item.lectures > 0 && (
              <View style={[styles.miniPill, { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.25)' }]}>
                <Ionicons name="book-outline" size={12} color="#3b82f6" style={{ marginRight: 4 }} />
                <Text style={[styles.miniPillText, { color: '#3b82f6' }]}>{item.lectures} Lectures</Text>
              </View>
            )}
            {item.practicals > 0 && (
              <View style={[styles.miniPill, { backgroundColor: 'rgba(168, 85, 247, 0.1)', borderColor: 'rgba(168, 85, 247, 0.25)' }]}>
                <Ionicons name="flask-outline" size={12} color="#a855f7" style={{ marginRight: 4 }} />
                <Text style={[styles.miniPillText, { color: '#a855f7' }]}>{item.practicals} Labs</Text>
              </View>
            )}
          </View>
        )}

        {/* Safety Margin Guidance Banner */}
        <View style={[styles.marginBanner, { backgroundColor: statusBg, borderColor: statusBorder }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
            <Ionicons
              name={item.isProjSafe ? 'shield-checkmark' : 'alert-circle'}
              size={15}
              color={statusColor}
            />
            <Text style={[styles.marginBannerText, { color: statusColor }]} numberOfLines={1}>
              {item.maxSafeBunksInPeriod > 0
                ? `Safe to miss ${item.maxSafeBunksInPeriod} class${item.maxSafeBunksInPeriod > 1 ? 'es' : ''} in this period`
                : item.isProjSafe
                ? 'Borderline: Cannot miss any classes in this window'
                : `Need to attend all classes consecutively`}
            </Text>
          </View>

          <View style={[styles.actionPrompt, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
            <Text style={[styles.actionPromptText, { color: colors.primary }]}>Details</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.primary} />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
});

// Modern Day-by-Day Timetable Card Item
const DayTimelineCardItem = React.memo(({
  item,
  colors,
  isDark,
  onSelectSubject,
}: {
  item: DayTimelineItem;
  colors: any;
  isDark: boolean;
  onSelectSubject?: (subject: { code: string; name: string; viewActionTarget?: string }) => void;
}) => {
  const cardGradColors = isDark
    ? (['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.02)'] as const)
    : (['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.75)'] as const);

  if (item.isOff) {
    return (
      <View style={styles.timelineDayCard}>
        <LinearGradient
          colors={cardGradColors}
          style={[
            styles.dayCardInner,
            {
              borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.07)',
              borderTopColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.95)',
            },
          ]}
        >
          <View style={styles.dayCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.dayCircle, { backgroundColor: item.isExam ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons
                  name={item.isExam ? 'document-text' : 'leaf'}
                  size={15}
                  color={item.isExam ? '#ef4444' : '#10b981'}
                />
              </View>
              <View>
                <Text style={[styles.dayTitleText, { color: colors.text }]}>
                  {item.dayLabel} • {item.formattedDate}
                </Text>
                <Text style={[styles.dayOffReason, { color: item.isExam ? '#ef4444' : '#10b981' }]}>
                  {item.offReason}
                </Text>
              </View>
            </View>

            <View style={[styles.dayStatusPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
              <Text style={[styles.dayStatusPillText, { color: colors.textMuted }]}>
                {item.isExam ? 'Exam Period' : 'No Classes'}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.timelineDayCard}>
      <LinearGradient
        colors={cardGradColors}
        style={[
          styles.dayCardInner,
          {
            borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.07)',
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.95)',
          },
        ]}
      >
        {/* Day Card Header */}
        <View style={styles.dayCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.dayCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Ionicons name="calendar-outline" size={15} color={colors.primary} />
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.dayTitleText, { color: colors.text }]}>
                  {item.dayLabel} • {item.formattedDate}
                </Text>
                {item.isTomorrow && (
                  <View style={[styles.tomorrowBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.tomorrowBadgeText}>Tomorrow</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.daySubCount, { color: colors.textMuted }]}>
                {item.slots.length} class{item.slots.length !== 1 ? 'es' : ''} scheduled
              </Text>
            </View>
          </View>

          <View style={[styles.dayClassCountBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)' }]}>
            <Text style={[styles.dayClassCountText, { color: colors.primary }]}>
              +{item.slots.length} Classes
            </Text>
          </View>
        </View>

        {/* List of class slots for this day */}
        <View style={styles.daySlotsList}>
          {item.slots.map((sItem, idx) => {
            const isPractical = sItem.classType === 'Practical';
            const matched = sItem.matchedSubject;
            return (
              <TouchableOpacity
                key={idx}
                activeOpacity={matched ? 0.75 : 1}
                disabled={!matched}
                onPress={() => {
                  if (matched && onSelectSubject) {
                    try { Haptics.selectionAsync(); } catch {}
                    onSelectSubject({
                      code: matched.code,
                      name: matched.name,
                      viewActionTarget: matched.viewActionTarget,
                    });
                  }
                }}
                style={[
                  styles.slotRow,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                  },
                ]}
              >
                {/* Time Strip */}
                <View style={styles.slotTimeCol}>
                  <Text style={[styles.slotTimeText, { color: colors.text }]}>
                    {sItem.slot.time || '—'}
                  </Text>
                  <View
                    style={[
                      styles.slotTypeBadge,
                      {
                        backgroundColor: isPractical ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        borderColor: isPractical ? 'rgba(168, 85, 247, 0.3)' : 'rgba(59, 130, 246, 0.3)',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.slotTypeText,
                        { color: isPractical ? '#a855f7' : '#3b82f6' },
                      ]}
                    >
                      {isPractical ? 'LAB' : 'LEC'}
                    </Text>
                  </View>
                </View>

                {/* Slot Details */}
                <View style={{ flex: 1, paddingLeft: 10 }}>
                  <Text style={[styles.slotSubjectName, { color: colors.text }]} numberOfLines={2}>
                    {matched ? matched.name : sItem.slot.subjectName || 'Scheduled Class'}
                  </Text>
                  <View style={styles.slotMetaRow}>
                    {sItem.slot.room ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="location-outline" size={11} color={colors.textMuted} />
                        <Text style={[styles.slotMetaText, { color: colors.textMuted }]}>{sItem.slot.room}</Text>
                      </View>
                    ) : null}
                    {sItem.slot.teacher ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="person-outline" size={11} color={colors.textMuted} />
                        <Text style={[styles.slotMetaText, { color: colors.textMuted }]} numberOfLines={1}>
                          {sItem.slot.teacher}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Right Attendance Status */}
                {matched && (
                  <View style={styles.slotRightCol}>
                    <Text
                      style={[
                        styles.slotCurrPct,
                        {
                          color:
                            Number(matched.attendancePercentage || 0) >= 75
                              ? '#10b981'
                              : Number(matched.attendancePercentage || 0) >= 65
                              ? '#f59e0b'
                              : '#ef4444',
                        },
                      ]}
                    >
                      {matched.attendancePercentage}%
                    </Text>
                    <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>
    </View>
  );
});

export function AttendanceOverviewModal({
  visible,
  onClose,
  onSelectSubject,
}: AttendanceOverviewModalProps) {
  const { colors, theme } = useThemeStore();
  const isDark = theme === 'black';
  const { subjects, detailedAttendanceCache, timetable, datesheet } = useStudyOSStore();
  const { width: SCREEN_WIDTH } = Dimensions.get('window');
  const slideAnim = React.useRef(new Animated.Value(SCREEN_WIDTH)).current;

  // Active top tab: Overview vs Overall Predictor
  const [activeTab, setActiveTab] = useState<'overview' | 'predictor'>('overview');

  // Overview states
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('critical_first');
  const [searchQuery, setSearchQuery] = useState('');

  // Predictor states
  const [predictDays, setPredictDays] = useState<number>(14);
  const [simulatedMissed, setSimulatedMissed] = useState<number>(0);
  const [predictorSubTab, setPredictorSubTab] = useState<'subjects' | 'schedule'>('subjects');

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
      setActiveTab('overview');
      setSimulatedMissed(0);
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
      if (activeTab === 'predictor') {
        setActiveTab('overview');
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
  }, [visible, isDetailOpen, activeTab, searchQuery, filter, onClose, handleCloseDetail]);

  const safeSubjects = Array.isArray(subjects) ? subjects : [];

  // Compute stats for all subjects (Overview Mode)
  const subjectStats = useMemo<ProcessedSubject[]>(() => {
    return safeSubjects.map((sub) => {
      const attended = Number(sub.attendedClasses || 0);
      const total = Number(sub.totalClasses || 0);
      const percentage = total > 0 ? (attended / total) * 100 : Number(sub.attendancePercentage || 0);
      const isSafe = percentage >= 75;
      const isWarning = percentage >= 65 && percentage < 75;

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

  // Overall aggregate semester stats (Overview Mode)
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

  // Filtered and Sorted list (Overview Mode)
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

  // ─────────────────────────────────────────────────────────────
  // PREDICTIVE ENGINE (Overall Multi-Subject & Day-by-Day Forecast)
  // ─────────────────────────────────────────────────────────────
  const { dayTimeline, subjectForecasts, overallForecast, totalScheduledInWindow } = useMemo(() => {
    const today = new Date();
    const timeline: DayTimelineItem[] = [];

    const subjectClassCounts: Record<string, { lectures: number; practicals: number; total: number }> = {};
    safeSubjects.forEach((s) => {
      subjectClassCounts[s.code] = { lectures: 0, practicals: 0, total: 0 };
    });

    let totalScheduled = 0;

    for (let i = 1; i <= predictDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      d.setHours(0, 0, 0, 0);

      const dayName = DAYS_ARRAY[d.getDay()];
      const isSun = d.getDay() === 0;
      const formattedDate = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
      const dayLabel = i === 1 ? 'Tomorrow' : dayName;

      const offEvent = getDayEvent(d);
      const isOffDay = isHolidayOrExam(d);

      if (isOffDay) {
        timeline.push({
          date: d,
          dateStr: d.toISOString().split('T')[0],
          dayLabel,
          formattedDate,
          isToday: false,
          isTomorrow: i === 1,
          isOff: true,
          offReason: offEvent?.title || (isSun ? 'Sunday • Non-teaching day' : 'Academic Holiday / Exam'),
          isHoliday: offEvent?.isHoliday ?? isSun,
          isExam: offEvent?.isExam ?? false,
          slots: [],
        });
      } else {
        const daySlots = (timetable || {})[dayName];
        const safeSlots = Array.isArray(daySlots) ? daySlots : [];
        const dayClasses: {
          slot: any;
          matchedSubject: CulkoSubject | null;
          classType: 'Practical' | 'Lecture';
        }[] = [];

        safeSlots.forEach((slot: any) => {
          const matched = matchSlotToSubject(slot, safeSubjects);
          const classType = getSlotClassType(slot);
          dayClasses.push({ slot, matchedSubject: matched, classType });

          if (matched) {
            if (!subjectClassCounts[matched.code]) {
              subjectClassCounts[matched.code] = { lectures: 0, practicals: 0, total: 0 };
            }
            subjectClassCounts[matched.code].total++;
            if (classType === 'Practical') {
              subjectClassCounts[matched.code].practicals++;
            } else {
              subjectClassCounts[matched.code].lectures++;
            }
          }
          totalScheduled++;
        });

        timeline.push({
          date: d,
          dateStr: d.toISOString().split('T')[0],
          dayLabel,
          formattedDate,
          isToday: false,
          isTomorrow: i === 1,
          isOff: false,
          slots: dayClasses,
        });
      }
    }

    // Per-Subject Forecasts
    const sForecasts: SubjectForecastItem[] = safeSubjects.map((sub) => {
      const currTotal = Number(sub.totalClasses || 0);
      const currAttended = Number(sub.attendedClasses || 0);
      const currPct = currTotal > 0 ? (currAttended / currTotal) * 100 : Number(sub.attendancePercentage || 0);

      const counts = subjectClassCounts[sub.code] || { lectures: 0, practicals: 0, total: 0 };
      const scheduled = counts.total;
      const newTotal = currTotal + scheduled;
      const projAttendedAll = currAttended + scheduled;
      const projPctAll = newTotal > 0 ? Math.round((projAttendedAll / newTotal) * 1000) / 10 : Math.round(currPct * 10) / 10;

      const miss1Attended = currAttended + Math.max(0, scheduled - 1);
      const miss1Pct = scheduled >= 1 && newTotal > 0 ? Math.round((miss1Attended / newTotal) * 1000) / 10 : null;

      const miss2Attended = currAttended + Math.max(0, scheduled - 2);
      const miss2Pct = scheduled >= 2 && newTotal > 0 ? Math.round((miss2Attended / newTotal) * 1000) / 10 : null;

      const maxSafeBunksInPeriod = Math.max(0, Math.min(scheduled, Math.floor((projAttendedAll - 0.75 * newTotal) / 1)));

      return {
        subject: sub,
        currTotal,
        currAttended,
        currPct: Math.round(currPct * 10) / 10,
        scheduled,
        lectures: counts.lectures,
        practicals: counts.practicals,
        newTotal,
        projPctAll,
        miss1Pct,
        miss2Pct,
        maxSafeBunksInPeriod,
        isProjSafe: projPctAll >= 75,
        isProjWarning: projPctAll >= 65 && projPctAll < 75,
      };
    });

    // Overall aggregate computation
    let currTotAttended = 0;
    let currTotClasses = 0;
    safeSubjects.forEach((s) => {
      currTotAttended += Number(s.attendedClasses || 0);
      currTotClasses += Number(s.totalClasses || 0);
    });

    const currOverallPct = currTotClasses > 0 ? Math.round((currTotAttended / currTotClasses) * 1000) / 10 : 0;
    const newOverallTotal = currTotClasses + totalScheduled;
    const projOverallAttendedAll = currTotAttended + totalScheduled;
    const projOverallPctAll = newOverallTotal > 0 ? Math.round((projOverallAttendedAll / newOverallTotal) * 1000) / 10 : currOverallPct;

    const maxOverallBunksInWindow = Math.max(0, Math.min(totalScheduled, Math.floor((projOverallAttendedAll - 0.75 * newOverallTotal) / 1)));

    const clampedSimulatedMissed = Math.min(Math.max(0, simulatedMissed), totalScheduled);
    const simulatedAttended = currTotAttended + Math.max(0, totalScheduled - clampedSimulatedMissed);
    const simulatedOverallPct = newOverallTotal > 0 ? Math.round((simulatedAttended / newOverallTotal) * 1000) / 10 : currOverallPct;

    const isSimSafe = simulatedOverallPct >= 75;
    const isSimWarning = simulatedOverallPct >= 65 && simulatedOverallPct < 75;

    return {
      dayTimeline: timeline,
      subjectForecasts: sForecasts,
      totalScheduledInWindow: totalScheduled,
      overallForecast: {
        currTotAttended,
        currTotClasses,
        currOverallPct,
        newOverallTotal,
        totalScheduled,
        projOverallPctAll,
        maxOverallBunksInWindow,
        simulatedMissed: clampedSimulatedMissed,
        simulatedOverallPct,
        isSimSafe,
        isSimWarning,
      },
    };
  }, [safeSubjects, timetable, predictDays, simulatedMissed]);

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

  const renderPredictorSubject = useCallback(
    ({ item }: { item: SubjectForecastItem }) => (
      <PredictorSubjectCardItem
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

  const renderDayTimeline = useCallback(
    ({ item }: { item: DayTimelineItem }) => (
      <DayTimelineCardItem
        item={item}
        colors={colors}
        isDark={isDark}
        onSelectSubject={(sub) => {
          handleOpenDetail({
            code: sub.code,
            name: sub.name,
            viewActionTarget: sub.viewActionTarget,
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

  // Overview List Header
  const ListHeader = useMemo(() => {
    const heroGradColors = isDark
      ? (['rgba(255, 255, 255, 0.09)', 'rgba(255, 255, 255, 0.02)'] as const)
      : (['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.80)'] as const);
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
                <Circle
                  cx="58"
                  cy="58"
                  r={gaugeRadius}
                  stroke={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.07)'}
                  strokeWidth="9"
                  fill="none"
                />
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
  }, [
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
  ]);

  // Overall Predictor List Header
  const PredictorListHeader = useMemo(() => {
    const semEndDays = getDaysUntilSemesterEnd();
    const horizonOptions = [
      { label: '7 Days', days: 7, subLabel: 'Next 1 wk' },
      { label: '14 Days', days: 14, subLabel: 'Next 2 wks' },
      { label: '30 Days', days: 30, subLabel: 'Next 1 mo' },
      { label: 'Semester End', days: semEndDays, subLabel: 'Till exams' },
    ];

    const heroGradColors = isDark
      ? (['rgba(255, 255, 255, 0.09)', 'rgba(255, 255, 255, 0.02)'] as const)
      : (['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.80)'] as const);

    const gain = Math.round((overallForecast.projOverallPctAll - overallForecast.currOverallPct) * 10) / 10;
    const isGainPositive = gain >= 0;

    return (
      <View style={styles.headerComponentWrapper}>
        {/* Horizon Selector Chips */}
        <View style={styles.horizonRow}>
          {horizonOptions.map((opt) => {
            const isSelected = predictDays === opt.days;
            return (
              <TouchableOpacity
                key={opt.label}
                activeOpacity={0.75}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setPredictDays(opt.days);
                  setSimulatedMissed(0);
                }}
                style={[
                  styles.horizonChip,
                  {
                    backgroundColor: isSelected ? colors.primary : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    borderColor: isSelected ? colors.primary : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.horizonText,
                    { color: isSelected ? '#fff' : colors.text },
                    isSelected && { fontFamily: 'SpaceGrotesk_700Bold' },
                  ]}
                >
                  {opt.label}
                </Text>
                <Text
                  style={[
                    styles.horizonSubText,
                    { color: isSelected ? 'rgba(255,255,255,0.85)' : colors.textMuted },
                  ]}
                >
                  {opt.subLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Hero Forecast Card */}
        <LinearGradient
          colors={heroGradColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.heroCard,
            {
              borderColor: overallForecast.isSimSafe ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)',
              borderTopColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.95)',
            },
          ]}
        >
          <View style={styles.predHeroHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles" size={16} color={colors.primary} />
              <Text style={[styles.predHeroTitle, { color: colors.text }]}>
                Overall Semester Forecast
              </Text>
            </View>
            <View
              style={[
                styles.heroStatusBadge,
                {
                  backgroundColor: overallForecast.isSimSafe ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  borderColor: overallForecast.isSimSafe ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                },
              ]}
            >
              <Text
                style={[
                  styles.heroStatusText,
                  { color: overallForecast.isSimSafe ? '#10b981' : '#ef4444' },
                ]}
              >
                {overallForecast.isSimSafe ? 'SAFE TARGET' : 'ATTENTION'}
              </Text>
            </View>
          </View>

          {/* Current vs Projected comparison cards */}
          <View style={styles.predCompareRow}>
            {/* Current */}
            <View
              style={[
                styles.predCompareBox,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
            >
              <Text style={[styles.predCompareLabel, { color: colors.textMuted }]}>Current Overall</Text>
              <Text style={[styles.predComparePct, { color: colors.text }]}>
                {overallForecast.currOverallPct}%
              </Text>
              <Text style={[styles.predCompareCount, { color: colors.textMuted }]}>
                {overallForecast.currTotAttended}/{overallForecast.currTotClasses} attended
              </Text>
            </View>

            {/* Arrow Divider */}
            <View style={styles.predArrowCol}>
              <Ionicons name="arrow-forward" size={18} color={colors.primary} />
              <View style={[styles.gainBadge, { backgroundColor: isGainPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                <Text style={[styles.gainBadgeText, { color: isGainPositive ? '#10b981' : '#ef4444' }]}>
                  {isGainPositive ? `+${gain}%` : `${gain}%`}
                </Text>
              </View>
            </View>

            {/* Projected If Attend All */}
            <View
              style={[
                styles.predCompareBox,
                {
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  borderColor: 'rgba(16, 185, 129, 0.25)',
                },
              ]}
            >
              <Text style={[styles.predCompareLabel, { color: '#10b981' }]}>Best Case (100%)</Text>
              <Text style={[styles.predComparePct, { color: '#10b981' }]}>
                {overallForecast.projOverallPctAll}%
              </Text>
              <Text style={[styles.predCompareCount, { color: colors.textMuted }]}>
                {overallForecast.currTotAttended + totalScheduledInWindow}/{overallForecast.newOverallTotal} attended
              </Text>
            </View>
          </View>

          {/* Forecast Summary Text */}
          <View style={styles.predMetaFooter}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="calendar-outline" size={13} color={colors.primary} />
              <Text style={[styles.predMetaFooterText, { color: colors.textMuted }]}>
                <Text style={{ color: colors.text, fontFamily: 'SpaceGrotesk_700Bold' }}>
                  {totalScheduledInWindow} classes
                </Text>{' '}
                scheduled across all subjects in the next {predictDays} days
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Interactive Bunk Simulator Card */}
        <View
          style={[
            styles.simCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)',
            },
          ]}
        >
          <View style={styles.simHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Ionicons name="calculator-outline" size={17} color={colors.primary} />
              <Text style={[styles.simTitle, { color: colors.text }]}>
                Simulate Missed Classes
              </Text>
            </View>
            <View style={[styles.simBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
              <Text style={[styles.simBadgeText, { color: colors.textMuted }]}>
                {predictDays} Days Window
              </Text>
            </View>
          </View>

          <Text style={[styles.simSubtitle, { color: colors.textMuted }]}>
            Adjust how many classes you might miss to instantly test your projected semester score:
          </Text>

          {/* Stepper Control */}
          <View style={styles.stepperContainer}>
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={simulatedMissed <= 0}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setSimulatedMissed((prev) => Math.max(0, prev - 1));
              }}
              style={[
                styles.stepperBtn,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  opacity: simulatedMissed <= 0 ? 0.3 : 1,
                },
              ]}
            >
              <Ionicons name="remove" size={20} color={colors.text} />
            </TouchableOpacity>

            <View style={styles.stepperValueContainer}>
              <Text style={[styles.stepperValue, { color: colors.text }]}>
                {simulatedMissed}
              </Text>
              <Text style={[styles.stepperLabel, { color: colors.textMuted }]}>
                {simulatedMissed === 1 ? 'Class Missed' : 'Classes Missed'}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              disabled={simulatedMissed >= totalScheduledInWindow}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                setSimulatedMissed((prev) => Math.min(totalScheduledInWindow, prev + 1));
              }}
              style={[
                styles.stepperBtn,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  opacity: simulatedMissed >= totalScheduledInWindow ? 0.3 : 1,
                },
              ]}
            >
              <Ionicons name="add" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Quick Preset Buttons */}
          <View style={styles.quickPresetRow}>
            {[0, 2, 4, 8].map((preset) => {
              if (preset > totalScheduledInWindow && preset !== 0) return null;
              const isSelected = simulatedMissed === preset;
              return (
                <TouchableOpacity
                  key={preset}
                  activeOpacity={0.7}
                  onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    setSimulatedMissed(preset);
                  }}
                  style={[
                    styles.quickPresetChip,
                    {
                      backgroundColor: isSelected ? colors.primary : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                      borderColor: isSelected ? colors.primary : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.quickPresetText,
                      { color: isSelected ? '#fff' : colors.textMuted },
                    ]}
                  >
                    {preset === 0 ? 'Attend All' : `Miss ${preset}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Simulated Outcome Banner */}
          <View
            style={[
              styles.simOutcomeBanner,
              {
                backgroundColor: overallForecast.isSimSafe
                  ? 'rgba(16, 185, 129, 0.12)'
                  : overallForecast.isSimWarning
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)',
                borderColor: overallForecast.isSimSafe
                  ? 'rgba(16, 185, 129, 0.35)'
                  : overallForecast.isSimWarning
                  ? 'rgba(245, 158, 11, 0.35)'
                  : 'rgba(239, 68, 68, 0.35)',
              },
            ]}
          >
            <View style={styles.simOutcomeLeft}>
              <Text
                style={[
                  styles.simOutcomePct,
                  {
                    color: overallForecast.isSimSafe
                      ? '#10b981'
                      : overallForecast.isSimWarning
                      ? '#f59e0b'
                      : '#ef4444',
                  },
                ]}
              >
                {overallForecast.simulatedOverallPct}%
              </Text>
              <Text
                style={[
                  styles.simOutcomeStatus,
                  {
                    color: overallForecast.isSimSafe
                      ? '#10b981'
                      : overallForecast.isSimWarning
                      ? '#f59e0b'
                      : '#ef4444',
                  },
                ]}
              >
                {overallForecast.isSimSafe ? 'SAFE' : overallForecast.isSimWarning ? 'WARNING' : 'CRITICAL'}
              </Text>
            </View>

            <View style={styles.simOutcomeRight}>
              <Text style={[styles.simOutcomeDesc, { color: colors.text }]}>
                {overallForecast.simulatedMissed === 0
                  ? `Attending all ${totalScheduledInWindow} classes brings your overall attendance to ${overallForecast.projOverallPctAll}%. You can safely miss up to ${overallForecast.maxOverallBunksInWindow} classes while maintaining 75%.`
                  : overallForecast.isSimSafe
                  ? `Missing ${overallForecast.simulatedMissed} class${overallForecast.simulatedMissed > 1 ? 'es' : ''} leaves you safe at ${overallForecast.simulatedOverallPct}%. Safe buffer left: ${Math.max(0, overallForecast.maxOverallBunksInWindow - overallForecast.simulatedMissed)} classes.`
                  : `⚠️ Missing ${overallForecast.simulatedMissed} class${overallForecast.simulatedMissed > 1 ? 'es' : ''} causes attendance to drop to ${overallForecast.simulatedOverallPct}% (Below 75%).`}
              </Text>
            </View>
          </View>
        </View>

        {/* Sub-Tab Switcher: By Subject vs Day-by-Day Schedule */}
        <View style={styles.subTabBar}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              setPredictorSubTab('subjects');
            }}
            style={[
              styles.subTabBtn,
              predictorSubTab === 'subjects' && {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#fff',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1.5 },
                shadowOpacity: isDark ? 0.25 : 0.08,
                shadowRadius: 3,
                elevation: 2,
              },
            ]}
          >
            <Ionicons
              name="book-outline"
              size={14}
              color={predictorSubTab === 'subjects' ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.subTabText,
                { color: predictorSubTab === 'subjects' ? colors.text : colors.textMuted },
                predictorSubTab === 'subjects' && { fontFamily: 'SpaceGrotesk_700Bold' },
              ]}
            >
              By Subject ({subjectForecasts.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              setPredictorSubTab('schedule');
            }}
            style={[
              styles.subTabBtn,
              predictorSubTab === 'schedule' && {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#fff',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1.5 },
                shadowOpacity: isDark ? 0.25 : 0.08,
                shadowRadius: 3,
                elevation: 2,
              },
            ]}
          >
            <Ionicons
              name="calendar-outline"
              size={14}
              color={predictorSubTab === 'schedule' ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.subTabText,
                { color: predictorSubTab === 'schedule' ? colors.text : colors.textMuted },
                predictorSubTab === 'schedule' && { fontFamily: 'SpaceGrotesk_700Bold' },
              ]}
            >
              Day-by-Day ({dayTimeline.length} Days)
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [
    colors,
    isDark,
    predictDays,
    simulatedMissed,
    predictorSubTab,
    overallForecast,
    totalScheduledInWindow,
    subjectForecasts.length,
    dayTimeline.length,
  ]);

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
        {/* Ambient Backlight Glow Blobs */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LinearGradient
            colors={[
              activeTab === 'predictor'
                ? 'rgba(59, 130, 246, 0.12)'
                : overallStats.isOverallSafe
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(239, 68, 68, 0.12)',
              'transparent',
            ]}
            style={{ position: 'absolute', top: -50, left: -50, width: 260, height: 260, borderRadius: 130 }}
          />
          <LinearGradient
            colors={['rgba(168, 85, 247, 0.08)', 'transparent']}
            style={{ position: 'absolute', top: 180, right: -70, width: 240, height: 240, borderRadius: 120 }}
          />
        </View>

        {/* Base Layer */}
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
                  <View
                    style={[
                      styles.liveDot,
                      {
                        backgroundColor:
                          activeTab === 'predictor'
                            ? colors.primary
                            : overallStats.isOverallSafe
                            ? '#10b981'
                            : '#ef4444',
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                  Semester Intelligence & Prediction Hub
                </Text>
              </View>
            </View>
          </View>

          {/* Top Segmented Tab Switcher: Overview vs Overall Predictor */}
          <View style={[styles.topTabBarWrapper, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)' }]}>
            <View style={[styles.topTabBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setActiveTab('overview');
                }}
                style={[
                  styles.topTabBtn,
                  activeTab === 'overview' && {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#fff',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1.5 },
                    shadowOpacity: isDark ? 0.25 : 0.08,
                    shadowRadius: 3,
                    elevation: 2,
                  },
                ]}
              >
                <Ionicons
                  name="bar-chart-outline"
                  size={15}
                  color={activeTab === 'overview' ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.topTabText,
                    { color: activeTab === 'overview' ? colors.text : colors.textMuted },
                    activeTab === 'overview' && { fontFamily: 'SpaceGrotesk_700Bold' },
                  ]}
                >
                  Overview
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch {}
                  setActiveTab('predictor');
                }}
                style={[
                  styles.topTabBtn,
                  activeTab === 'predictor' && {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#fff',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1.5 },
                    shadowOpacity: isDark ? 0.25 : 0.08,
                    shadowRadius: 3,
                    elevation: 2,
                  },
                ]}
              >
                <Ionicons
                  name="sparkles"
                  size={15}
                  color={activeTab === 'predictor' ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.topTabText,
                    { color: activeTab === 'predictor' ? colors.text : colors.textMuted },
                    activeTab === 'predictor' && { fontFamily: 'SpaceGrotesk_700Bold' },
                  ]}
                >
                  Overall Predictor
                </Text>
                <View style={[styles.predictorBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.predictorBadgeText}>AI</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Tab Content */}
          {activeTab === 'overview' ? (
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
          ) : (
            <FlatList
              data={(predictorSubTab === 'subjects' ? subjectForecasts : dayTimeline) as any[]}
              keyExtractor={(item: any, idx) =>
                predictorSubTab === 'subjects' ? item.subject.code : item.dateStr || String(idx)
              }
              renderItem={(predictorSubTab === 'subjects' ? renderPredictorSubject : renderDayTimeline) as any}
              ListHeaderComponent={PredictorListHeader}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              initialNumToRender={6}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={true}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={44} color={colors.textMuted} />
                  <Text style={[styles.emptyStateTitle, { color: colors.text }]}>
                    No Scheduled Classes Found
                  </Text>
                  <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
                    Ensure your timetable is synced from the university portal to enable full predictive intelligence.
                  </Text>
                </View>
              }
            />
          )}
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
  topTabBarWrapper: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
  },
  topTabBar: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 14,
  },
  topTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 11,
    gap: 6,
  },
  topTabText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  predictorBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  predictorBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: 'SpaceGrotesk_700Bold',
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
    marginBottom: 14,
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
  scenarioGridRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  scenarioCol: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  scenarioLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9.5,
    marginBottom: 2,
  },
  scenarioVal: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12.5,
  },

  // Predictor Styles
  horizonRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 12,
  },
  horizonChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
  },
  horizonSubText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    marginTop: 1,
  },
  predHeroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  predHeroTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
  },
  predCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  predCompareBox: {
    flex: 1,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  predCompareLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
    marginBottom: 2,
  },
  predComparePct: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 18,
    letterSpacing: -0.4,
  },
  predCompareCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9.5,
    marginTop: 2,
  },
  predArrowCol: {
    alignItems: 'center',
    gap: 4,
  },
  gainBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  gainBadgeText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
  },
  predMetaFooter: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  predMetaFooterText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    flex: 1,
  },
  simCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  simHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  simTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
  },
  simBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  simBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  simSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 12,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueContainer: {
    alignItems: 'center',
  },
  stepperValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 28,
    lineHeight: 32,
  },
  stepperLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 1,
  },
  quickPresetRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 12,
  },
  quickPresetChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  quickPresetText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  simOutcomeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  simOutcomeLeft: {
    alignItems: 'center',
    minWidth: 54,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.1)',
    paddingRight: 10,
  },
  simOutcomePct: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 18,
    letterSpacing: -0.4,
  },
  simOutcomeStatus: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    marginTop: 1,
    letterSpacing: 0.5,
  },
  simOutcomeRight: {
    flex: 1,
  },
  simOutcomeDesc: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 15.5,
  },
  subTabBar: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 14,
  },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7.5,
    borderRadius: 11,
    gap: 6,
  },
  subTabText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },

  // Day-by-Day Timeline Styles
  timelineDayCard: {
    marginBottom: 12,
  },
  dayCardInner: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderTopWidth: 1.5,
    overflow: 'hidden',
  },
  dayCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayTitleText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
  },
  dayOffReason: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    marginTop: 2,
  },
  daySubCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 1,
  },
  tomorrowBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  tomorrowBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  dayClassCountBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  dayClassCountText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
  },
  dayStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dayStatusPillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10.5,
  },
  daySlotsList: {
    gap: 7,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 9,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  slotTimeCol: {
    alignItems: 'center',
    minWidth: 64,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    paddingRight: 8,
  },
  slotTimeText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    marginBottom: 3,
  },
  slotTypeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 0.8,
  },
  slotTypeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8.5,
    letterSpacing: 0.5,
  },
  slotSubjectName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12.5,
    lineHeight: 16,
  },
  slotMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  slotMetaText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  slotRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 6,
  },
  slotCurrPct: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyStateTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 4,
  },
  emptyStateText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
});
