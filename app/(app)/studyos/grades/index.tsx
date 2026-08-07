import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { useHardwareBack } from '../../../../hooks/useHardwareBack';
import { useStudyOSStore } from '../../../../store/studyosStore';
import { useAttendance } from '../../../../hooks/useAttendance';

const LMS_COURSES_CACHE_KEY = 'lms_courses_cache';

// ── Ultra-powerful string cleaner to wipe out any trace of "ALL" or ugly Moodle artifacts ──
const stripAllWord = (text: string) => {
  if (!text) return '';
  return text
    .replace(/\bALL\b/gi, '') // Removes standalone ALL
    .replace(/[-_([/ ]*ALL[-_)/\] ]*/gi, ' ') // Removes -ALL-, _ALL, (ALL), etc.
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/[_-]+$/, '') // Remove trailing dashes or underscores
    .replace(/^[_-]+/, '') // Remove leading dashes or underscores
    .trim();
};

export default function LmsGradesSubjectListScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  useHardwareBack('/studyos/subjects');
  
  const erpSubjects = useStudyOSStore((s) => s.subjects) || [];
  const { data: attendanceData } = useAttendance();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scrapedCourses, setScrapedCourses] = useState<{ fullname: string; shortname: string; id?: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadCachedCourses = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(LMS_COURSES_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setScrapedCourses(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load cached courses for grades:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCachedCourses();
  }, [loadCachedCourses]);

  const onRefresh = () => {
    setRefreshing(true);
    loadCachedCourses();
  };

  // ── 1. Helpers for ERP Verification & Course Cleaning ──
  const getCoreCode = (str: string) => {
    const match = str.match(/[0-9]{2}[A-Z]{2,6}[-_]?[0-9]{2,4}/i);
    return match ? match[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : null;
  };

  const getMeaningfulWords = (str: string): string[] => {
    const clean = str.includes('::') ? str.split('::')[1] : str;
    const words = clean
      .replace(/[0-9]{2}[A-Z]{2,6}[-_]?[0-9]{2,4}/gi, ' ')
      .replace(/[-_([ ]*ALL[-_)\] ]*/gi, ' ')
      .replace(/\b(THEORY|LAB|PRACTICAL|TUTORIAL|CONT|COURSE|WITH|AND|FOR|THE|PART|GROUP|SECTION|BACHELOR|ENGINEERING)\b/gi, ' ')
      .replace(/[^a-zA-Z]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    return Array.from(new Set(words));
  };

  interface ErpTarget {
    key: string;
    code: string | null;
    words: string[];
    originalTitle: string;
    matchedCourses: any[];
  }

  const erpTargets: ErpTarget[] = [];

  const addTarget = (code: string | null, name: string) => {
    if (!name) return;
    const cleanCode = code ? code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : getCoreCode(name);
    const words = getMeaningfulWords(name);
    if (!cleanCode && words.length === 0) return;

    const exists = erpTargets.some((t) => {
      if (cleanCode && t.code && cleanCode === t.code) return true;
      if (t.words.length > 0 && words.length > 0) {
        const matches = words.filter((w) =>
          t.words.some((tw) => tw.startsWith(w.slice(0, 4)) || w.startsWith(tw.slice(0, 4)))
        );
        if (matches.length >= Math.min(words.length, t.words.length, 2)) return true;
      }
      return false;
    });

    if (!exists) {
      erpTargets.push({
        key: cleanCode || words.join('_'),
        code: cleanCode,
        words,
        originalTitle: stripAllWord(name),
        matchedCourses: [],
      });
    }
  };

  if (Array.isArray(erpSubjects)) {
    erpSubjects.forEach((s: any) => addTarget(s.code, s.name));
  }
  if (Array.isArray(attendanceData)) {
    attendanceData.forEach((a: any) => addTarget(null, a.subjectName));
  }

  // ── 2. Match and Sort Courses for Grades (Prioritize ALL / General Link internally, but show clean title!) ──
  const getPriorityScore = (course: any) => {
    const txt = `${course.shortname || ''} ${course.fullname || ''}`.toUpperCase();
    if (/\bALL\b|[-_]ALL|ALL[-_]|_ALL|ALL_|(\(ALL\))/i.test(txt)) return 100;
    if (!txt.includes('CONT_') && !txt.includes('THEORY') && !txt.includes('LAB') && !txt.includes('TUT') && !txt.includes('SEC_')) return 50;
    return 0;
  };

  const mainCourses: { fullname: string; shortname: string; originalName: string; id?: string }[] = [];

  if (erpTargets.length > 0) {
    scrapedCourses.forEach((course) => {
      if (!course || !course.fullname) return;
      if (course.fullname.includes('(ERP)')) return;

      const cCode = getCoreCode(course.shortname || course.fullname);
      const cWords = getMeaningfulWords(course.fullname);

      const target = erpTargets.find((t) => {
        if (cCode && t.code && cCode === t.code) return true;
        if (cWords.length > 0 && t.words.length > 0) {
          const matchedWords = cWords.filter((cw) =>
            t.words.some((tw) => tw.startsWith(cw.slice(0, 4)) || cw.startsWith(tw.slice(0, 4)))
          );
          if (t.words.length === 1 && matchedWords.length === 1) return true;
          if (t.words.length >= 2 && matchedWords.length >= 2) return true;
          const fullTitle = (course.shortname + ' ' + course.fullname).toLowerCase();
          if (t.words.join(' ').length >= 5 && fullTitle.includes(t.words.join(' '))) return true;
        }
        return false;
      });

      if (target) {
        target.matchedCourses.push(course);
      }
    });

    erpTargets.forEach((target) => {
      if (target.matchedCourses.length === 0) return;

      // Internally sort to pick ALL / General ID for Moodle scraping
      target.matchedCourses.sort((a, b) => getPriorityScore(b) - getPriorityScore(a));

      const best = target.matchedCourses[0];
      let rawFullname = best.fullname.replace(/Course is starred|Course name|Backup\s*/gi, '').replace(/\s+/g, ' ').trim();
      let code = best.shortname || target.code?.toUpperCase() || '';
      let cleanName = rawFullname;

      if (rawFullname.includes('::')) {
        const parts = rawFullname.split('::');
        code = parts[0].trim();
        cleanName = parts.slice(1).join('::').trim();
      }

      if (cleanName.includes(code) && code.length > 3) {
        cleanName = cleanName.replace(code, '').trim();
      }

      // If we have a verified ERP title, prefer it over messy Moodle text!
      if (target.originalTitle && target.originalTitle.length >= 3) {
        cleanName = target.originalTitle;
      }

      // Final aggressive wipe of any 'ALL' word from code and title
      code = stripAllWord(code.replace(/_[0-9]{2}[A-Z]{2,6}[-_]?[0-9]+/gi, ''));
      cleanName = stripAllWord(cleanName);

      if (cleanName.length >= 2) {
        mainCourses.push({ fullname: cleanName, shortname: code, originalName: best.fullname, id: best.id });
      }
    });
  }

  // 🛡️ Failsafe 1: If strict ERP matching resulted in zero courses, run fallback on scraped Moodle courses!
  if (mainCourses.length === 0 && scrapedCourses.length > 0) {
    const fallbackBuckets = new Map<string, any[]>();
    scrapedCourses.forEach((c) => {
      if (!c || !c.fullname || c.fullname.includes('(ERP)')) return;
      const coreCode = getCoreCode(c.shortname || c.fullname) || c.id || c.fullname;
      if (!fallbackBuckets.has(String(coreCode))) fallbackBuckets.set(String(coreCode), []);
      fallbackBuckets.get(String(coreCode))!.push(c);
    });
    fallbackBuckets.forEach((versions) => {
      versions.sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
      const best = versions[0];
      let rawFullname = best.fullname.replace(/Course is starred|Course name|Backup\s*/gi, '').replace(/\s+/g, ' ').trim();
      let code = best.shortname || '';
      let cleanName = rawFullname.includes('::') ? rawFullname.split('::')[1].trim() : rawFullname;
      
      cleanName = stripAllWord(cleanName);
      code = stripAllWord(code);

      if (cleanName.length >= 2) {
        mainCourses.push({ fullname: cleanName, shortname: code, originalName: best.fullname, id: best.id });
      }
    });
  }

  // 🛡️ Failsafe 2: If mainCourses is STILL empty (e.g. Moodle cache not ready or empty), directly use ERP/Attendance subjects!
  if (mainCourses.length === 0 && erpTargets.length > 0) {
    erpTargets.forEach((t) => {
      if (t.originalTitle && t.originalTitle.length >= 2) {
        mainCourses.push({
          fullname: t.originalTitle,
          shortname: t.code?.toUpperCase() || '',
          originalName: t.originalTitle,
          id: t.code || undefined,
        });
      }
    });
  }

  const filteredCourses = mainCourses.filter((c) =>
    c.fullname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.shortname.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'LMS Grades & Marks',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                marginLeft: 14,
                marginRight: 14,
                paddingVertical: 6,
                paddingHorizontal: 4,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Sleek Header Banner */}
        <View style={styles.headerBanner}>
          <View style={styles.bannerIconCircle}>
            <Ionicons name="school" size={24} color={colors.primary} />
          </View>
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>Moodle Grade Center</Text>
            <Text style={styles.bannerSubtitle}>
              Select a subject below to inspect all quiz, surprise test, and assignment scores extracted from Moodle in real-time.
            </Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
        ) : filteredCourses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={64} color={colors.primary} />
            <Text style={styles.emptyText}>No subjects found in cache</Text>
            <Text style={[styles.emptyText, { fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 20 }]}>
              Please open the LMS Courses page first to let the app scan your subjects, then return here to view your marks!
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredCourses.map((course, index) => (
              <TouchableOpacity
                key={course.id || index.toString()}
                style={styles.courseCard}
                activeOpacity={0.7}
                onPress={() => {
                  // Prefer the real numeric Moodle course id (most reliable). If it's
                  // missing (e.g. stale cache), fall back to the unique original Moodle
                  // full name so the Grade Center can locate the exact course by name.
                  const numericId = course.id && /^\d+$/.test(String(course.id)) ? String(course.id) : '';
                  const targetId = numericId || course.originalName || course.shortname || course.fullname;
                  const nameParam = encodeURIComponent(course.originalName || course.fullname);
                  router.push(`/studyos/grades/${encodeURIComponent(targetId)}?name=${nameParam}` as any);
                }}
              >
                <View style={styles.cardIconBox}>
                  <Ionicons name="stats-chart" size={22} color={colors.primary} />
                </View>

                <View style={styles.cardContent}>
                  {!!course.shortname && (
                    <View style={styles.codeBadge}>
                      <Text style={styles.codeBadgeText}>{course.shortname}</Text>
                    </View>
                  )}
                  <Text style={styles.subjectTitle} numberOfLines={2}>
                    {course.fullname}
                  </Text>
                  <Text style={styles.viewMarksHint}>Tap to check Quiz & Assignment scores →</Text>
                </View>

                <View style={styles.chevronBox}>
                  <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: Spacing.md,
      paddingTop: 10,
      paddingBottom: Spacing.xl * 2,
    },
    headerBanner: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceHigh,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    bannerIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
      borderWidth: 1,
      borderColor: colors.primary + '40',
    },
    bannerTextContainer: {
      flex: 1,
    },
    bannerTitle: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 17,
      color: colors.text,
      marginBottom: 4,
    },
    bannerSubtitle: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.text,
      lineHeight: 18,
    },
    listContainer: {
      gap: Spacing.sm,
    },
    courseCard: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceHigh,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 5,
      elevation: 3,
    },
    cardIconBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    cardContent: {
      flex: 1,
      justifyContent: 'center',
    },
    codeBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary + '20',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radius.sm,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: colors.primary + '40',
    },
    codeBadgeText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 11,
      color: colors.text,
      textTransform: 'uppercase',
    },
    subjectTitle: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 16,
      color: colors.text,
      marginBottom: 4,
    },
    viewMarksHint: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.primary,
    },
    chevronBox: {
      paddingLeft: Spacing.sm,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 20,
    },
    emptyText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 16,
      color: colors.text,
      marginTop: 12,
    },
  });
