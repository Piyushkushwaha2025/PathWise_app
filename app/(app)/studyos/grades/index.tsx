import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { useHardwareBack } from '../../../../hooks/useHardwareBack';
import { useStudyOSStore } from '../../../../store/studyosStore';
import { useAttendance } from '../../../../hooks/useAttendance';
import { WebView } from 'react-native-webview';

const LMS_COURSES_CACHE_KEY = 'lms_courses_cache';

const stripAllWord = (text: string) => {
  if (!text) return '';
  return text
    .replace(/\bALL\b/gi, '')
    .replace(/[-_([/ ]*ALL[-_)/\] ]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[_-]+$/, '')
    .replace(/^[_-]+/, '')
    .trim();
};

export default function LmsGradesSubjectListScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  useHardwareBack('/studyos');


  const erpSubjects = useStudyOSStore((s) => s.subjects) || [];
  const { data: attendanceData } = useAttendance();

  // Primary: read from global store (set by Subjects tab in real-time)
  const lmsCoursesFromStore = useStudyOSStore((s) => s.lmsCourses);
  const setLmsCourses = useStudyOSStore((s) => s.setLmsCourses);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scraperStatus, setScraperStatus] = useState<'syncing' | 'error'>('syncing');

  // Fallback: load from AsyncStorage cache if store is empty (first open before Subjects tab)
  const loadFromCache = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(LMS_COURSES_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLmsCourses(parsed); // Hydrate global store from cache
        }
      }
    } catch (_) {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setLmsCourses]);

  useFocusEffect(
    useCallback(() => {
      // If store already has data, no loading needed at all
      if (lmsCoursesFromStore.length > 0) {
        setLoading(false);
        return;
      }
      // Otherwise load from cache
      setLoading(true);
      loadFromCache();
    }, [lmsCoursesFromStore.length, loadFromCache])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadFromCache();
  };

  // Use store data (live + instantly updated by Subjects tab)
  const scrapedCourses = lmsCoursesFromStore;

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'COURSES' && data.courses && data.courses.length > 0) {
        setLmsCourses(data.courses);
        setScraperStatus('syncing'); // reset in case of recovery
        await AsyncStorage.setItem(LMS_COURSES_CACHE_KEY, JSON.stringify(data.courses));
      } else if (data.type === 'ERROR') {
        setScraperStatus('error');
      }
    } catch (e) {}
  };

  const injectedCourseScraper = `
    (function() {
      function extract() {
        var url = window.location.href.toLowerCase();
        
        if (url.includes('student.culko.in') && url.includes('login')) {
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR' }));
           return;
        }
        if (url.includes('lms.culko.in') && url.includes('login')) {
           window.location.href = 'https://student.culko.in/StudentHome.aspx';
           return;
        } 
        if (url.includes('studenthome.aspx')) {
           var links = document.querySelectorAll('a');
           var found = false;
           for(var j=0; j<links.length; j++) {
              var txt = links[j].innerText ? links[j].innerText.toUpperCase().trim() : '';
              if (txt === 'CU-LMS' || txt === 'MY LMS' || txt === 'LMS' || txt === 'CU LMS') {
                 if (links[j].href && !links[j].href.toLowerCase().startsWith('javascript:')) {
                    window.location.href = links[j].href;
                 } else {
                    links[j].click();
                 }
                 found = true;
                 break;
              }
           }
           if (!found) {
              var els = document.querySelectorAll('button, div, span, li');
              for (var i = els.length - 1; i >= 0; i--) {
                 var txt = els[i].innerText ? els[i].innerText.toUpperCase().trim() : '';
                 if (txt === 'CU-LMS' || txt === 'MY LMS' || txt === 'LMS' || txt === 'CU LMS') {
                    var parentA = els[i].closest('a');
                    if (parentA && parentA.href) window.location.href = parentA.href;
                    else els[i].click();
                    found = true;
                    break;
                 }
              }
           }
           if (!found) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR' }));
           }
           return;
        }
        var links = document.querySelectorAll('a[href*="course/view.php"]');
        var courses = [];
        var added = {};
        for(var k=0; k<links.length; k++) {
           var text = links[k].innerText ? links[k].innerText.trim() : '';
           if (text && text.length > 3 && !text.includes('Dashboard')) {
                var href = links[k].href || '';
                var idMatch = href.match(/id=(\\d+)/);
                if (idMatch) {
                   var courseId = idMatch[1];
                   text = text.replace(/\\n/g, ' ').trim();
                   if (!added[courseId]) {
                      courses.push({ fullname: text, shortname: text.split('::')[0].trim(), id: courseId });
                      added[courseId] = true;
                   }
                }
            }
        }
        var titles = document.querySelectorAll('.card-title, .coursename, h4, h5, h6, .text-truncate, .multiline');
        for (var i = 0; i < titles.length; i++) {
           var text = titles[i].innerText ? titles[i].innerText.trim() : '';
           if (!text || text.length < 4 || text === 'My Courses') continue;
           var aTag = titles[i].closest('a');
           if (!aTag) {
               var card = titles[i].closest('.card, .coursebox, .course');
               if (card) aTag = card.querySelector('a[href*="course/view.php"]');
           }
           var href = aTag ? (aTag.href || '') : '';
           var idMatch = href.match(/id=(\\d+)/);
           if (idMatch) {
               var courseId = idMatch[1];
               if (!added[courseId]) {
                  courses.push({ fullname: text, shortname: text.split('::')[0].trim(), id: courseId });
                  added[courseId] = true;
               }
           }
        }
        if (courses.length > 0) {
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COURSES', courses: courses }));
        }
      }
      setTimeout(extract, 2000);
      setTimeout(extract, 5000);
      setTimeout(extract, 8000);
      setTimeout(extract, 15000);
      setTimeout(extract, 25000);
    })();
    true;
  `;

  // ── Helpers ──
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
      erpTargets.push({ key: cleanCode || words.join('_'), code: cleanCode, words, originalTitle: stripAllWord(name), matchedCourses: [] });
    }
  };

  if (Array.isArray(erpSubjects)) erpSubjects.forEach((s: any) => addTarget(s.code, s.name));
  if (Array.isArray(attendanceData)) attendanceData.forEach((a: any) => addTarget(null, a.subjectName));

  const getPriorityScore = (course: any) => {
    const txt = `${course.shortname || ''} ${course.fullname || ''}`.toUpperCase();
    if (/\bALL\b|[-_]ALL|ALL[-_]|_ALL|ALL_|(\(ALL\))/i.test(txt)) return 100;
    if (!txt.includes('CONT_') && !txt.includes('THEORY') && !txt.includes('LAB') && !txt.includes('TUT') && !txt.includes('SEC_')) return 50;
    return 0;
  };

  const mainCourses: { fullname: string; shortname: string; originalName: string; id?: string }[] = [];

  if (erpTargets.length > 0 && scrapedCourses.length > 0) {
    scrapedCourses.forEach((course) => {
      if (!course || !course.fullname || course.fullname.includes('(ERP)')) return;
      const cCode = getCoreCode(course.shortname || course.fullname);
      const cWords = getMeaningfulWords(course.fullname);
      const target = erpTargets.find((t) => {
        if (cCode && t.code && cCode === t.code) return true;
        if (cWords.length > 0 && t.words.length > 0) {
          const matched = cWords.filter((cw) => t.words.some((tw) => tw.startsWith(cw.slice(0, 4)) || cw.startsWith(tw.slice(0, 4))));
          if (t.words.length === 1 && matched.length === 1) return true;
          if (t.words.length >= 2 && matched.length >= 2) return true;
        }
        return false;
      });
      if (target) target.matchedCourses.push(course);
    });

    erpTargets.forEach((target) => {
      if (target.matchedCourses.length === 0) return;
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
      if (cleanName.includes(code) && code.length > 3) cleanName = cleanName.replace(code, '').trim();
      if (target.originalTitle && target.originalTitle.length >= 3) cleanName = target.originalTitle;
      code = stripAllWord(code.replace(/_[0-9]{2}[A-Z]{2,6}[-_]?[0-9]+/gi, ''));
      cleanName = stripAllWord(cleanName);
      if (cleanName.length < 2) cleanName = target.originalTitle || rawFullname.trim() || 'Subject';
      mainCourses.push({ fullname: cleanName, shortname: code, originalName: best.fullname, id: best.id });
    });
  }

  // Failsafe: if ERP matching fails, show all scraped courses de-duped
  if (mainCourses.length === 0 && scrapedCourses.length > 0) {
    const buckets = new Map<string, any[]>();
    scrapedCourses.forEach((c) => {
      if (!c || !c.fullname || c.fullname.includes('(ERP)')) return;
      const key = getCoreCode(c.shortname || c.fullname) || c.id || c.fullname;
      if (!buckets.has(String(key))) buckets.set(String(key), []);
      buckets.get(String(key))!.push(c);
    });
    buckets.forEach((versions) => {
      versions.sort((a, b) => getPriorityScore(b) - getPriorityScore(a));
      const best = versions[0];
      let rawFullname = best.fullname.replace(/Course is starred|Course name|Backup\s*/gi, '').replace(/\s+/g, ' ').trim();
      let code = best.shortname || '';
      let cleanName = rawFullname.includes('::') ? rawFullname.split('::')[1].trim() : rawFullname;
      cleanName = stripAllWord(cleanName);
      code = stripAllWord(code);
      if (cleanName.length < 2) cleanName = rawFullname.trim() || best.shortname || 'Subject';
      mainCourses.push({ fullname: cleanName, shortname: code, originalName: best.fullname, id: best.id });
    });
  }

  useEffect(() => {
    if (mainCourses.length === 0 && !loading && scraperStatus === 'syncing') {
       const timer = setTimeout(() => {
          setScraperStatus('error');
       }, 35000); // 35 seconds max wait before showing error
       return () => clearTimeout(timer);
    }
  }, [mainCourses.length, loading, scraperStatus]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Grades',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.navigate('/studyos' as any)}
              style={{ marginLeft: 14 }}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
      >
        <View style={styles.headerBanner}>
          <View style={styles.bannerIconCircle}>
            <Ionicons name="school" size={24} color={colors.primary} />
          </View>
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>Moodle Grade Center</Text>
            <Text style={styles.bannerSubtitle}>
              Select a subject to inspect quiz, surprise test, and assignment scores.
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : mainCourses.length === 0 ? (
          <View style={styles.emptyState}>
            {scraperStatus === 'syncing' ? (
               <>
                 <ActivityIndicator size="large" color={colors.primary} />
                 <Text style={{ ...styles.emptyTitle, marginTop: 16 }}>Syncing LMS Subjects...</Text>
                 <Text style={styles.emptySubtitle}>
                   Please wait while we automatically fetch your subjects from Moodle. This happens in the background.
                 </Text>
               </>
            ) : (
               <>
                 <Ionicons name="alert-circle-outline" size={56} color={colors.primary} />
                 <Text style={styles.emptyTitle}>LMS Session Expired</Text>
                 <Text style={styles.emptySubtitle}>
                   We couldn't sync your subjects in the background. Please open the LMS Subjects tab to re-authenticate manually.
                 </Text>
                 <TouchableOpacity
                   style={styles.ctaButton}
                   onPress={() => router.push('/studyos/subjects' as any)}
                 >
                   <Ionicons name="sync-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                   <Text style={styles.ctaButtonText}>Open LMS Subjects</Text>
                 </TouchableOpacity>
               </>
            )}
          </View>
        ) : (
          <View style={styles.listContainer}>
            {mainCourses.map((course, index) => (
              <TouchableOpacity
                key={course.id || index.toString()}
                style={styles.courseCard}
                activeOpacity={0.7}
                onPress={() => {
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

      {mainCourses.length === 0 && !loading && (
        <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute', top: 0, left: 0 }}>
          <WebView
            source={{ uri: 'https://lms.culko.in/my/courses.php?paged=0' }}
            onMessage={handleWebViewMessage}
            injectedJavaScript={injectedCourseScraper}
            javaScriptEnabled={true}
            sharedCookiesEnabled={true}
          />
        </View>
      )}
    </View>
  );
}

const useStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingHorizontal: Spacing.md, paddingTop: 10, paddingBottom: Spacing.xl * 2 },
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
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: colors.primary + '20',
      alignItems: 'center', justifyContent: 'center',
      marginRight: Spacing.md, borderWidth: 1, borderColor: colors.primary + '40',
    },
    bannerTextContainer: { flex: 1 },
    bannerTitle: { fontFamily: Typography.h3.fontFamily, fontSize: 17, color: colors.text, marginBottom: 4 },
    bannerSubtitle: { fontFamily: Typography.body.fontFamily, fontSize: 13, color: colors.text, lineHeight: 18 },
    listContainer: { gap: Spacing.sm },
    courseCard: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceHigh,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      borderWidth: 1, borderColor: colors.border,
      alignItems: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 3,
    },
    cardIconBox: {
      width: 44, height: 44, borderRadius: 12,
      backgroundColor: colors.primary + '15',
      alignItems: 'center', justifyContent: 'center',
      marginRight: Spacing.md, borderWidth: 1, borderColor: colors.primary + '30',
    },
    cardContent: { flex: 1, justifyContent: 'center' },
    codeBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary + '20',
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: Radius.sm, marginBottom: 6,
      borderWidth: 1, borderColor: colors.primary + '40',
    },
    codeBadgeText: { fontFamily: Typography.h3.fontFamily, fontSize: 11, color: colors.text, textTransform: 'uppercase' },
    subjectTitle: { fontFamily: Typography.h3.fontFamily, fontSize: 16, color: colors.text, marginBottom: 4 },
    viewMarksHint: { fontFamily: Typography.body.fontFamily, fontSize: 13, color: colors.primary },
    chevronBox: { paddingLeft: Spacing.sm },
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 40, paddingHorizontal: 20 },
    emptyTitle: { fontFamily: Typography.h3.fontFamily, fontSize: 18, color: colors.text, marginTop: 16 },
    emptySubtitle: { fontFamily: Typography.body.fontFamily, fontSize: 14, color: colors.textMuted || colors.text, marginTop: 8, textAlign: 'center', lineHeight: 20 },
    ctaButton: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 20, paddingVertical: 12,
      borderRadius: Radius.lg, marginTop: 20,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
    },
    ctaButtonText: { color: '#fff', fontFamily: Typography.h3.fontFamily, fontSize: 15 },
  });
