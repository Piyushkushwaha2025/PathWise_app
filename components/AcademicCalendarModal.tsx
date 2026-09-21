import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeStore } from '../store/useThemeStore';
import { Typography, Spacing, Radius } from '../constants/theme';
import { ACADEMIC_CALENDAR, agendaItems, markedDates } from '../constants/calendar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AcademicCalendarModalProps {
  visible: boolean;
  onClose: () => void;
}

type EventFilterType = 'all' | 'holiday' | 'exam' | 'event';
type ScopeType = 'month' | 'semester';

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseEventDate(rawDate: string) {
  const parts = rawDate.split('-');
  const day = parts[0] || '01';
  const monthRaw = parts[1] || 'Jan';
  const monthAbbr = monthRaw.toUpperCase();
  const year = parts[2] || '2026';
  const monthNum = MONTH_MAP[monthRaw] || '01';
  const isoDate = `${year}-${monthNum}-${day.padStart(2, '0')}`;
  return { day, monthAbbr, year, isoDate };
}

function getRelativeDateLabel(isoDate: string) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [y, m, d] = isoDate.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return { label: 'Today', isToday: true, isPast: false };
    if (diffDays === 1) return { label: 'Tomorrow', isToday: false, isPast: false };
    if (diffDays > 1 && diffDays <= 30) return { label: `In ${diffDays}d`, isToday: false, isPast: false };
    if (diffDays < 0) return { label: 'Past', isToday: false, isPast: true };
    return { label: '', isToday: false, isPast: false };
  } catch {
    return { label: '', isToday: false, isPast: false };
  }
}

export function AcademicCalendarModal({ visible, onClose }: AcademicCalendarModalProps) {
  const { colors, theme } = useThemeStore();
  const insets = useSafeAreaInsets();
  const isDark = theme === 'black';

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [currentMonth, setCurrentMonth] = useState<string>(todayIso.substring(0, 7));
  const [activeFilter, setActiveFilter] = useState<EventFilterType>('all');
  const [scope, setScope] = useState<ScopeType>('month');

  // Flatten all events across odd semester
  const allEvents = useMemo(() => {
    return ACADEMIC_CALENDAR.flatMap((sec) =>
      sec.data.map((item) => {
        const parsed = parseEventDate(item.date);
        return {
          ...item,
          ...parsed,
        };
      })
    );
  }, []);

  // Filter counts
  const counts = useMemo(() => {
    let holidays = 0;
    let exams = 0;
    let events = 0;
    allEvents.forEach((ev) => {
      if (ev.isHoliday) holidays++;
      else if (ev.isExam) exams++;
      else events++;
    });
    return {
      all: allEvents.length,
      holiday: holidays,
      exam: exams,
      event: events,
    };
  }, [allEvents]);

  // Filtered events based on scope and category
  const displayedEvents = useMemo(() => {
    let list = allEvents;

    if (scope === 'month') {
      list = list.filter((ev) => ev.isoDate.startsWith(currentMonth));
    }

    if (activeFilter === 'holiday') {
      list = list.filter((ev) => ev.isHoliday);
    } else if (activeFilter === 'exam') {
      list = list.filter((ev) => ev.isExam);
    } else if (activeFilter === 'event') {
      list = list.filter((ev) => !ev.isHoliday && !ev.isExam);
    }

    return list.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  }, [allEvents, currentMonth, scope, activeFilter]);

  // Selected date events
  const selectedDateEvents = useMemo(() => {
    return agendaItems[selectedDate] || [];
  }, [selectedDate]);

  // Marked dates map with high-contrast glowing dots + selected style
  const computedMarkedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    Object.keys(markedDates).forEach((dateKey) => {
      const orig = markedDates[dateKey];
      marks[dateKey] = {
        ...orig,
        dotColor: orig.dotColor || colors.primary,
      };
    });

    const isExisting = marks[selectedDate] || {};
    marks[selectedDate] = {
      ...isExisting,
      selected: true,
      selectedColor: isDark ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.22)',
      selectedTextColor: isDark ? '#ffffff' : colors.primary,
    };

    return marks;
  }, [selectedDate, isDark, colors.primary]);

  // Current month label (e.g. "August 2026")
  const currentMonthLabel = useMemo(() => {
    try {
      const [y, m] = currentMonth.split('-').map(Number);
      return `${MONTH_NAMES_FULL[m - 1]} ${y}`;
    } catch {
      return currentMonth;
    }
  }, [currentMonth]);

  const handleDayPress = useCallback((day: any) => {
    try { Haptics.selectionAsync(); } catch {}
    setSelectedDate(day.dateString);
    if (day.dateString.substring(0, 7) !== currentMonth) {
      setCurrentMonth(day.dateString.substring(0, 7));
    }
  }, [currentMonth]);

  const handleMonthChange = useCallback((month: any) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setCurrentMonth(month.dateString.substring(0, 7));
  }, []);

  const handleFilterChange = useCallback((filter: EventFilterType) => {
    try { Haptics.selectionAsync(); } catch {}
    setActiveFilter(filter);
  }, []);

  const handleScopeChange = useCallback((newScope: ScopeType) => {
    try { Haptics.selectionAsync(); } catch {}
    setScope(newScope);
  }, []);

  const handleSelectEvent = useCallback((isoDate: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setSelectedDate(isoDate);
    const m = isoDate.substring(0, 7);
    if (m !== currentMonth) {
      setCurrentMonth(m);
    }
  }, [currentMonth]);

  const handleJumpToToday = useCallback(() => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    setSelectedDate(todayIso);
    setCurrentMonth(todayIso.substring(0, 7));
  }, [todayIso]);

  // Theme glass palette
  const glassCardGrad = isDark
    ? (['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.02)'] as const)
    : (['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.85)'] as const);

  const glassBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const glassBorderTop = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.95)';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent={true}
      />
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop: Platform.OS === 'android' ? Math.max(insets.top, 28) : insets.top,
            paddingBottom: Platform.OS === 'android' ? insets.bottom : 0,
          },
        ]}
      >
        
        {/* Ambient Backlight Glow Blobs */}
        <View pointerEvents="none" style={styles.glowContainer}>
          <LinearGradient
            colors={isDark ? ['rgba(99, 102, 241, 0.16)', 'transparent'] : ['rgba(99, 102, 241, 0.08)', 'transparent']}
            style={styles.ambientTopRight}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <LinearGradient
            colors={isDark ? ['rgba(16, 185, 129, 0.12)', 'transparent'] : ['rgba(16, 185, 129, 0.06)', 'transparent']}
            style={styles.ambientMidLeft}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </View>

        {/* Top Sheet Drag Indicator */}
        <View style={styles.sheetHandleWrapper}>
          <View style={[styles.sheetHandle, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.18)' }]} />
        </View>

        {/* Frosted Glass Header */}
        <View style={[styles.header, { borderBottomColor: glassBorder }]}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={['#6366f1', '#8b5cf6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerIconTile}
            >
              <Ionicons name="calendar" size={20} color="#ffffff" />
            </LinearGradient>
            <View>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: colors.text }]}>Academic Calendar</Text>
                <View style={[styles.semesterBadge, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.16)' : 'rgba(99, 102, 241, 0.1)' }]}>
                  <Text style={[styles.semesterBadgeText, { color: isDark ? '#a5b4fc' : '#4f46e5' }]}>ODD SEM</Text>
                </View>
              </View>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>Session 2026-27 • Chandigarh University</Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              onClose();
            }}
            style={[
              styles.closeBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                borderColor: glassBorder,
              },
            ]}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Interactive Filter Pills (Legend + Filter in One) */}
          <View style={styles.filterSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {/* All */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleFilterChange('all')}
                style={[
                  styles.filterPill,
                  activeFilter === 'all'
                    ? [styles.filterPillActive, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.08)', borderColor: isDark ? '#ffffff40' : '#00000030' }]
                    : [styles.filterPillInactive, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', borderColor: glassBorder }],
                ]}
              >
                <Ionicons
                  name="apps-outline"
                  size={13}
                  color={activeFilter === 'all' ? colors.text : colors.textMuted}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.filterText, { color: activeFilter === 'all' ? colors.text : colors.textMuted }]}>
                  All
                </Text>
                <View style={[styles.countBadge, { backgroundColor: activeFilter === 'all' ? (isDark ? '#ffffff25' : '#00000015') : (isDark ? '#ffffff10' : '#00000008') }]}>
                  <Text style={[styles.countText, { color: activeFilter === 'all' ? colors.text : colors.textMuted }]}>
                    {counts.all}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Holidays */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleFilterChange('holiday')}
                style={[
                  styles.filterPill,
                  activeFilter === 'holiday'
                    ? [styles.filterPillActive, { backgroundColor: 'rgba(16, 185, 129, 0.18)', borderColor: 'rgba(16, 185, 129, 0.5)' }]
                    : [styles.filterPillInactive, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', borderColor: glassBorder }],
                ]}
              >
                <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                <Text style={[styles.filterText, { color: activeFilter === 'holiday' ? '#10b981' : colors.textMuted }]}>
                  Holidays
                </Text>
                <View style={[styles.countBadge, { backgroundColor: activeFilter === 'holiday' ? 'rgba(16, 185, 129, 0.25)' : (isDark ? '#ffffff10' : '#00000008') }]}>
                  <Text style={[styles.countText, { color: activeFilter === 'holiday' ? '#10b981' : colors.textMuted }]}>
                    {counts.holiday}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Exams */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleFilterChange('exam')}
                style={[
                  styles.filterPill,
                  activeFilter === 'exam'
                    ? [styles.filterPillActive, { backgroundColor: 'rgba(244, 63, 94, 0.18)', borderColor: 'rgba(244, 63, 94, 0.5)' }]
                    : [styles.filterPillInactive, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', borderColor: glassBorder }],
                ]}
              >
                <View style={[styles.legendDot, { backgroundColor: '#f43f5e' }]} />
                <Text style={[styles.filterText, { color: activeFilter === 'exam' ? '#f43f5e' : colors.textMuted }]}>
                  Exams
                </Text>
                <View style={[styles.countBadge, { backgroundColor: activeFilter === 'exam' ? 'rgba(244, 63, 94, 0.25)' : (isDark ? '#ffffff10' : '#00000008') }]}>
                  <Text style={[styles.countText, { color: activeFilter === 'exam' ? '#f43f5e' : colors.textMuted }]}>
                    {counts.exam}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Events */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleFilterChange('event')}
                style={[
                  styles.filterPill,
                  activeFilter === 'event'
                    ? [styles.filterPillActive, { backgroundColor: 'rgba(99, 102, 241, 0.18)', borderColor: 'rgba(99, 102, 241, 0.5)' }]
                    : [styles.filterPillInactive, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', borderColor: glassBorder }],
                ]}
              >
                <View style={[styles.legendDot, { backgroundColor: '#6366f1' }]} />
                <Text style={[styles.filterText, { color: activeFilter === 'event' ? '#818cf8' : colors.textMuted }]}>
                  Events
                </Text>
                <View style={[styles.countBadge, { backgroundColor: activeFilter === 'event' ? 'rgba(99, 102, 241, 0.25)' : (isDark ? '#ffffff10' : '#00000008') }]}>
                  <Text style={[styles.countText, { color: activeFilter === 'event' ? '#818cf8' : colors.textMuted }]}>
                    {counts.event}
                  </Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Glass Calendar Card */}
          <View style={styles.calendarCardWrapper}>
            <LinearGradient
              colors={glassCardGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.calendarCard,
                {
                  borderColor: glassBorder,
                  borderTopColor: glassBorderTop,
                },
              ]}
            >
              <Calendar
                key={visible ? 'cal-open' : 'cal-closed'}
                current={selectedDate}
                minDate={'2026-07-01'}
                maxDate={'2027-01-31'}
                onDayPress={handleDayPress}
                onMonthChange={handleMonthChange}
                hideExtraDays={true}
                markedDates={computedMarkedDates}
                renderArrow={(direction: 'left' | 'right') => (
                  <View
                    style={[
                      styles.calendarArrowBox,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                        borderColor: glassBorder,
                      },
                    ]}
                  >
                    <Ionicons
                      name={direction === 'left' ? 'chevron-back' : 'chevron-forward'}
                      size={18}
                      color={colors.text}
                    />
                  </View>
                )}
                theme={{
                  backgroundColor: 'transparent',
                  calendarBackground: 'transparent',
                  textSectionTitleColor: colors.textMuted,
                  selectedDayBackgroundColor: isDark ? 'rgba(99, 102, 241, 0.45)' : 'rgba(99, 102, 241, 0.25)',
                  selectedDayTextColor: isDark ? '#ffffff' : colors.primary,
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.2)',
                  dotColor: colors.primary,
                  arrowColor: colors.text,
                  monthTextColor: colors.text,
                  indicatorColor: colors.primary,
                  textMonthFontFamily: 'SpaceGrotesk_700Bold',
                  textDayHeaderFontFamily: 'Inter_600SemiBold',
                  textDayFontFamily: 'SpaceGrotesk_600SemiBold',
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 11,
                  textDayFontSize: 13.5,
                } as any}
              />
            </LinearGradient>
          </View>

          {/* Selected Date Inspector Banner */}
          <View style={styles.inspectorWrapper}>
            <LinearGradient
              colors={isDark ? ['rgba(255, 255, 255, 0.04)', 'rgba(255, 255, 255, 0.015)'] : ['rgba(0, 0, 0, 0.03)', 'rgba(0, 0, 0, 0.01)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.inspectorCard,
                {
                  borderColor: glassBorder,
                  borderTopColor: glassBorderTop,
                },
              ]}
            >
              <View style={styles.inspectorLeft}>
                <View style={[styles.inspectorDateTile, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.16)' : 'rgba(99, 102, 241, 0.1)' }]}>
                  <Ionicons name="calendar-clear-outline" size={16} color={isDark ? '#a5b4fc' : '#4f46e5'} />
                  <Text style={[styles.inspectorDateText, { color: isDark ? '#c7d2fe' : '#4338ca' }]}>
                    {selectedDate.split('-')[2]} {MONTH_NAMES_FULL[Number(selectedDate.split('-')[1]) - 1]?.substring(0, 3)}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  {selectedDateEvents.length > 0 ? (
                    selectedDateEvents.map((ev: any, idx: number) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View
                          style={[
                            styles.miniCategoryPill,
                            {
                              backgroundColor: ev.isHoliday
                                ? 'rgba(16, 185, 129, 0.15)'
                                : ev.isExam
                                ? 'rgba(244, 63, 94, 0.15)'
                                : 'rgba(99, 102, 241, 0.15)',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.miniCategoryText,
                              {
                                color: ev.isHoliday ? '#10b981' : ev.isExam ? '#f43f5e' : '#818cf8',
                              },
                            ]}
                          >
                            {ev.isHoliday ? 'Holiday' : ev.isExam ? 'Exam' : 'Event'}
                          </Text>
                        </View>
                        <Text style={[styles.inspectorEventTitle, { color: colors.text }]} numberOfLines={1}>
                          {ev.activity}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={[styles.inspectorEmptyText, { color: colors.textMuted }]}>
                      Regular Teaching Day • No special event
                    </Text>
                  )}
                </View>
              </View>

              {selectedDate !== todayIso && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleJumpToToday}
                  style={[styles.jumpTodayBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]}
                >
                  <Text style={[styles.jumpTodayText, { color: colors.primary }]}>Today</Text>
                </TouchableOpacity>
              )}
            </LinearGradient>
          </View>

          {/* Scope Toggle & Events List Header */}
          <View style={styles.eventsHeaderRow}>
            <View>
              <Text style={[styles.eventsSectionTitle, { color: colors.text }]}>
                {scope === 'month' ? currentMonthLabel : 'Odd Semester Events'}
              </Text>
              <Text style={[styles.eventsCountSubtitle, { color: colors.textMuted }]}>
                {displayedEvents.length} {displayedEvents.length === 1 ? 'entry' : 'entries'} scheduled
              </Text>
            </View>

            {/* Scope Switcher: Month vs All */}
            <View
              style={[
                styles.scopeSwitcher,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                  borderColor: glassBorder,
                },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleScopeChange('month')}
                style={[
                  styles.scopeOption,
                  scope === 'month' && [styles.scopeOptionActive, { backgroundColor: isDark ? '#ffffff18' : '#ffffff' }],
                ]}
              >
                <Text
                  style={[
                    styles.scopeOptionText,
                    {
                      color: scope === 'month' ? colors.text : colors.textMuted,
                      fontFamily: scope === 'month' ? 'Inter_600SemiBold' : 'Inter_500Medium',
                    },
                  ]}
                >
                  Month
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleScopeChange('semester')}
                style={[
                  styles.scopeOption,
                  scope === 'semester' && [styles.scopeOptionActive, { backgroundColor: isDark ? '#ffffff18' : '#ffffff' }],
                ]}
              >
                <Text
                  style={[
                    styles.scopeOptionText,
                    {
                      color: scope === 'semester' ? colors.text : colors.textMuted,
                      fontFamily: scope === 'semester' ? 'Inter_600SemiBold' : 'Inter_500Medium',
                    },
                  ]}
                >
                  Semester
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Events List */}
          {displayedEvents.length > 0 ? (
            <View style={styles.eventsList}>
              {displayedEvents.map((item, idx) => {
                const isItemHoliday = !!item.isHoliday;
                const isItemExam = !!item.isExam;
                const accentColor = isItemHoliday ? '#10b981' : isItemExam ? '#f43f5e' : '#6366f1';
                const accentBg = isItemHoliday
                  ? 'rgba(16, 185, 129, 0.12)'
                  : isItemExam
                  ? 'rgba(244, 63, 94, 0.12)'
                  : 'rgba(99, 102, 241, 0.12)';
                const tagLabel = isItemHoliday ? 'HOLIDAY' : isItemExam ? 'EXAM' : 'CAMPUS EVENT';
                const tagIcon = isItemHoliday ? 'sparkles-outline' : isItemExam ? 'document-text-outline' : 'flag-outline';
                const isSelected = item.isoDate === selectedDate;
                const rel = getRelativeDateLabel(item.isoDate);

                return (
                  <TouchableOpacity
                    key={`${item.isoDate}-${idx}`}
                    activeOpacity={0.78}
                    onPress={() => handleSelectEvent(item.isoDate)}
                    style={styles.eventCardOuter}
                  >
                    <LinearGradient
                      colors={glassCardGrad}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                        styles.eventCard,
                        {
                          borderColor: isSelected ? accentColor : glassBorder,
                          borderTopColor: isSelected ? accentColor : glassBorderTop,
                          borderWidth: isSelected ? 1.5 : 1,
                        },
                      ]}
                    >
                      {/* Left glowing neon strip */}
                      <View style={[styles.eventAccentStrip, { backgroundColor: accentColor }]} />

                      {/* Date Badge Block */}
                      <View
                        style={[
                          styles.dateBadgeBlock,
                          {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                            borderColor: glassBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.dateDayNumber, { color: colors.text }]}>{item.day}</Text>
                        <Text style={[styles.dateMonthName, { color: colors.textMuted }]}>{item.monthAbbr}</Text>
                        <View style={[styles.weekdayCapsule, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]}>
                          <Text style={[styles.weekdayText, { color: colors.textMuted }]}>
                            {item.day.substring(0, 3).toUpperCase()}
                          </Text>
                        </View>
                      </View>

                      {/* Event Details */}
                      <View style={styles.eventDetails}>
                        <View style={styles.eventCategoryRow}>
                          <View style={[styles.categoryTagPill, { backgroundColor: accentBg, borderColor: accentColor + '40' }]}>
                            <Ionicons name={tagIcon as any} size={11} color={accentColor} style={{ marginRight: 4 }} />
                            <Text style={[styles.categoryTagText, { color: accentColor }]}>{tagLabel}</Text>
                          </View>

                          {rel.label ? (
                            <View
                              style={[
                                styles.relativePill,
                                {
                                  backgroundColor: rel.isToday
                                    ? 'rgba(16, 185, 129, 0.18)'
                                    : isDark
                                    ? 'rgba(255, 255, 255, 0.06)'
                                    : 'rgba(0, 0, 0, 0.04)',
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.relativeText,
                                  {
                                    color: rel.isToday ? '#10b981' : colors.textMuted,
                                    fontFamily: rel.isToday ? 'Inter_600SemiBold' : 'Inter_500Medium',
                                  },
                                ]}
                              >
                                {rel.label}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <Text style={[styles.eventActivityTitle, { color: colors.text }]}>
                          {item.activity}
                        </Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View
              style={[
                styles.emptyStateCard,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                  borderColor: glassBorder,
                },
              ]}
            >
              <Ionicons name="calendar-outline" size={32} color={colors.textMuted} style={{ opacity: 0.6, marginBottom: 8 }} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No events found</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                {scope === 'month'
                  ? `There are no scheduled ${activeFilter !== 'all' ? activeFilter + 's' : 'events'} for ${currentMonthLabel}.`
                  : `No ${activeFilter} items found in this semester.`}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  glowContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  ambientTopRight: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  ambientMidLeft: {
    position: 'absolute',
    top: 360,
    left: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  sheetHandleWrapper: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  sheetHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: 12,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconTile: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: -0.3,
  },
  semesterBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  semesterBadgeText: {
    fontSize: 9.5,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12.5,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  filterSection: {
    marginBottom: Spacing.md,
  },
  filterRow: {
    gap: 8,
    paddingRight: Spacing.md,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  filterPillActive: {},
  filterPillInactive: {},
  filterText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    marginRight: 6,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  countText: {
    fontSize: 10.5,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  calendarCardWrapper: {
    marginBottom: Spacing.md,
  },
  calendarCard: {
    borderRadius: Radius.xl,
    padding: Spacing.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  calendarArrowBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inspectorWrapper: {
    marginBottom: Spacing.lg,
  },
  inspectorCard: {
    borderRadius: Radius.lg,
    padding: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inspectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  inspectorDateTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  inspectorDateText: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  miniCategoryPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  miniCategoryText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  inspectorEventTitle: {
    fontSize: 12.5,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  inspectorEmptyText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  jumpTodayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    marginLeft: 8,
  },
  jumpTodayText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  eventsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  eventsSectionTitle: {
    fontSize: 17,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: -0.2,
  },
  eventsCountSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  scopeSwitcher: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    padding: 3,
    borderWidth: 1,
  },
  scopeOption: {
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    borderRadius: Radius.full,
  },
  scopeOptionActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  scopeOptionText: {
    fontSize: 11.5,
  },
  eventsList: {
    gap: 10,
  },
  eventCardOuter: {
    borderRadius: Radius.lg,
  },
  eventCard: {
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    overflow: 'hidden',
  },
  eventAccentStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3.5,
  },
  dateBadgeBlock: {
    width: 58,
    borderRadius: Radius.md,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginRight: 12,
  },
  dateDayNumber: {
    fontSize: 18,
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 22,
  },
  dateMonthName: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 0.5,
    marginTop: -2,
  },
  weekdayCapsule: {
    marginTop: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  weekdayText: {
    fontSize: 8.5,
    fontFamily: 'Inter_600SemiBold',
  },
  eventDetails: {
    flex: 1,
  },
  eventCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  categoryTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  categoryTagText: {
    fontSize: 9.5,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 0.4,
  },
  relativePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  relativeText: {
    fontSize: 10,
  },
  eventActivityTitle: {
    fontSize: 13.5,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    lineHeight: 18,
  },
  emptyStateCard: {
    borderRadius: Radius.lg,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12.5,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 17,
  },
});
