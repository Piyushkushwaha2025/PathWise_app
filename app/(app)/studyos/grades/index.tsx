import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
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

const getSubjectIcon = (name: string): keyof typeof Ionicons.glyphMap => {
  const n = (name || '').toLowerCase();
  if (n.includes('program') || n.includes('python') || n.includes('java') || n.includes('code') || n.includes('data structure') || n.includes('algorithm')) {
    return 'code-slash';
  }
  if (n.includes('math') || n.includes('discrete') || n.includes('stat') || n.includes('calculus')) {
    return 'calculator';
  }
  if (n.includes('network') || n.includes('cloud') || n.includes('security') || n.includes('web') || n.includes('internet')) {
    return 'globe-outline';
  }
  if (n.includes('database') || n.includes('dbms') || n.includes('sql')) {
    return 'server';
  }
  if (n.includes('hardware') || n.includes('circuit') || n.includes('microprocessor') || n.includes('digital') || n.includes('architecture')) {
    return 'hardware-chip';
  }
  if (n.includes('ai') || n.includes('intelligence') || n.includes('machine learn') || n.includes('neural')) {
    return 'sparkles';
  }
  return 'school';
};

export default function LmsGradesSubjectListScreen() {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';
  const styles = useStyles(colors, isDark);
  const router = useRouter();
  useHardwareBack('/studyos');

  const erpSubjects = useStudyOSStore((s) => s.subjects) || [];
  const { data: attendanceData } = useAttendance();

  // Primary: read from global store (set by Subjects tab in real-time)
  const lmsCoursesFromStore = useStudyOSStore((s) => s.lmsCourses);
  const setLmsCourses = useStudyOSStore((s) => s.setLmsCourses);

  const webViewRef = useRef<WebView>(null);
  const [webViewUrl, setWebViewUrl] = useState('https://lms.culko.in/my/courses.php?paged=0');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scraperStatus, setScraperStatus] = useState<'syncing' | 'error'>('syncing');
  const [searchQuery, setSearchQuery] = useState('');

  // Fallback: load from AsyncStorage cache if store is empty (first open before Subjects tab)
  const loadFromCache = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(LMS_COURSES_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLmsCourses(parsed);
        }
      }
      // Ensure erpSubjects is hydrated from studyos_scraped_data if currently empty
      if (useStudyOSStore.getState().subjects.length === 0) {
        const stored = await AsyncStorage.getItem('studyos_scraped_data');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.subjects && Array.isArray(parsed.subjects)) {
            await useStudyOSStore.getState().setScrapedData({ subjects: parsed.subjects });
          }
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
      if (lmsCoursesFromStore.length > 0 || erpSubjects.length > 0) {
        setLoading(false);
      }
      loadFromCache();
    }, [lmsCoursesFromStore.length, erpSubjects.length, loadFromCache])
  );

  const onRefresh = () => {
    try { Haptics.selectionAsync(); } catch {}
    setRefreshing(true);
    loadFromCache();
  };

  const scrapedCourses = lmsCoursesFromStore;

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if ((data.type === 'COURSES_DATA' || data.type === 'COURSES') && data.courses && data.courses.length > 0) {
        setLmsCourses(data.courses);
        setScraperStatus('syncing');
        await AsyncStorage.setItem(LMS_COURSES_CACHE_KEY, JSON.stringify(data.courses));
      } else if (data.type === 'ERROR' || data.error === 'SESSION_EXPIRED') {
        setScraperStatus('error');
      }
    } catch (e) {}
  };

  const handleNavigationStateChange = (navState: any) => {
    if (!navState.loading) {
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(injectedCourseScraper);
      }, 700);
    }
  };

  const injectedCourseScraper = `
    (function checkReady() {
      if (!window.ReactNativeWebView) {
        setTimeout(checkReady, 500);
        return;
      }
      try {
        var url = window.location.href.toLowerCase();
        
        if (url.includes('student.culko.in') && url.includes('login')) {
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', error: 'SESSION_EXPIRED' }));
           return;
        }
        else if (url.includes('lms.culko.in') && url.includes('login')) {
           window.location.href = 'https://student.culko.in/StudentHome.aspx';
           return;
        } 
        else if (url.includes('studenthome.aspx')) {
           var found = false;
           var allA = document.querySelectorAll('a');
           for (var j = 0; j < allA.length; j++) {
              var txt = allA[j].innerText ? allA[j].innerText.toUpperCase().trim() : '';
              if (txt === 'CU-LMS' || txt === 'MY LMS' || txt === 'LMS' || txt === 'CU LMS') {
                  if (allA[j].href && !allA[j].href.toLowerCase().startsWith('javascript:')) {
                     window.location.href = allA[j].href;
                  } else {
                     allA[j].click();
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
                    if (parentA && parentA.href) {
                       window.location.href = parentA.href;
                    } else {
                       els[i].click();
                    }
                    found = true;
                    break;
                 }
              }
           }
           if (!found) {
              window.location.href = 'https://student.culko.in/frmmycourse.aspx';
           }
           return;
        }
        else if (url.includes('frmmycourse.aspx')) {
           var courses = [];
           var added = {};
           var rows = document.querySelectorAll('table tr');
           for (var i = 1; i < rows.length; i++) {
               var cells = rows[i].querySelectorAll('td, th');
               var code = '';
               var name = '';
               for (var c = 0; c < cells.length; c++) {
                   var text = cells[c].innerText.trim();
                   if (text.length >= 4 && text.length <= 25 && /[a-zA-Z]/.test(text) && /[0-9]/.test(text) && !text.includes(' ') && !text.includes('\\n')) {
                       code = text;
                       if (c + 1 < cells.length) name = cells[c+1].innerText.trim();
                       break;
                   }
               }
               if (code && name && name.length > 3 && !added[code]) {
                   courses.push({ fullname: name + ' (ERP)', shortname: code, id: code });
                   added[code] = true;
               }
           }
           if (courses.length > 0) {
               window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COURSES_DATA', courses: courses }));
           }
           return;
        }
        else if (url.includes('lms.culko.in') && !url.includes('my/courses.php')) {
           window.location.href = 'https://lms.culko.in/my/courses.php?paged=0';
           return;
        }
        else if (url.includes('my/courses.php')) {
           function extractPageCourses() {
              var courses = [];
              var added = {};
              
              var links = document.querySelectorAll('a[href*="course/view.php"]');
              for (var k = 0; k < links.length; k++) {
                  if (links[k].closest('[data-region="recentlyaccessedcourses"]') || links[k].closest('.block_recentlyaccessedcourses') || links[k].closest('aside')) continue;
                  var text = links[k].innerText ? links[k].innerText.trim() : '';
                  if (text && text.length > 3 && !text.includes('Dashboard')) {
                       var href = links[k].href || '';
                       var idMatch = href.match(/id=(\\d+)/);
                       var courseId = idMatch ? idMatch[1] : '';
                       text = text.replace(/\\n/g, ' ').trim();
                       var uniqueKey = text + "_" + courseId;
                       if (!added[uniqueKey]) {
                          var shortname = text.includes('::') ? text.split('::')[0].trim() : 'COURSE';
                          courses.push({ fullname: text, shortname: shortname, id: courseId });
                          added[uniqueKey] = true;
                       }
                  }
              }
              
              var titles = document.querySelectorAll('.card-title, .coursename, h4, h5, h6, .text-truncate, .multiline');
              for (var i = 0; i < titles.length; i++) {
                 if (titles[i].closest('[data-region="recentlyaccessedcourses"]') || titles[i].closest('.block_recentlyaccessedcourses')) continue;
                 var text = titles[i].innerText ? titles[i].innerText.trim() : '';
                 if (!text || text.length < 4 || text === 'My Courses' || text === 'Active Courses' || text === 'Dashboard') continue;
                 var aTag = titles[i].closest('a') || titles[i].closest('.card, .coursebox, .course')?.querySelector('a[href*="course/view.php"]');
                 var href = aTag ? (aTag.href || '') : '';
                 var idMatch = href.match(/id=(\\d+)/);
                 var courseId = idMatch ? idMatch[1] : '';
                 var hasSubjectCode = /[0-9]{2}[A-Z]{2,6}[-_]?[0-9]{2,4}/i.test(text);
                 if (!aTag && !hasSubjectCode) continue;

                 text = text.replace(/\\n/g, ' ').trim();
                 var uniqueKey = text + "_" + courseId;
                 if (!added[uniqueKey]) {
                    var shortname = text.includes('::') ? text.split('::')[0].trim() : 'COURSE';
                    courses.push({ fullname: text, shortname: shortname, id: courseId });
                    added[uniqueKey] = true;
                 }
              }
              
              if (courses.length > 0) {
                 window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COURSES_DATA', courses: courses }));
              }
           }
           setTimeout(extractPageCourses, 500);
           setTimeout(extractPageCourses, 2000);
        }
      } catch(e) {}
    })();
    true;
  `;

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

  // Priority 3 (Instant Failsafe): If scraped courses are not yet available, immediately show all enrolled ERP / Attendance subjects!
  if (mainCourses.length === 0 && erpTargets.length > 0) {
    erpTargets.forEach((target) => {
      const cleanTitle = target.originalTitle || target.code?.toUpperCase() || 'Subject';
      const code = target.code?.toUpperCase() || '';
      mainCourses.push({
        fullname: cleanTitle,
        shortname: code,
        originalName: cleanTitle,
        id: target.code || cleanTitle,
      });
    });
  }

  useEffect(() => {
    if (mainCourses.length === 0 && !loading && scraperStatus === 'syncing') {
       const timer = setTimeout(() => {
          setScraperStatus('error');
       }, 35000);
       return () => clearTimeout(timer);
    }
  }, [mainCourses.length, loading, scraperStatus]);

  // Filter courses by search query if any
  const displayedCourses = useMemo(() => {
    if (!searchQuery.trim()) return mainCourses;
    const q = searchQuery.toLowerCase().trim();
    return mainCourses.filter(c => 
      c.fullname.toLowerCase().includes(q) || 
      c.shortname.toLowerCase().includes(q)
    );
  }, [mainCourses, searchQuery]);

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
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                router.navigate('/studyos' as any);
              }}
              style={styles.headerBackBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
          ),
          headerRight: () => {
            if (mainCourses.length === 0) return null;
            return (
              <View style={styles.headerCountBadge}>
                <Ionicons name="school" size={13} color={colors.accent || '#8b5cf6'} style={{ marginRight: 5 }} />
                <Text style={styles.headerCountText}>{mainCourses.length} Subjects</Text>
              </View>
            );
          }
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            colors={[colors.primary]} 
            tintColor={colors.primary} 
          />
        }
      >
        {/* Modern Grade Center Hero Card */}
        <View style={styles.heroCardContainer}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(139, 92, 246, 0.18)', 'rgba(59, 130, 246, 0.08)']
                : ['rgba(124, 58, 237, 0.10)', 'rgba(37, 99, 235, 0.04)']
            }
            style={styles.heroGradient}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.heroIconBox}>
                <Ionicons name="stats-chart" size={24} color={colors.accent || '#8b5cf6'} />
              </View>
              <View style={styles.heroTextBox}>
                <View style={styles.heroPillBadge}>
                  <View style={styles.livePulseDot} />
                  <Text style={styles.heroPillText}>MOODLE EVALUATION CENTER</Text>
                </View>
                <Text style={styles.heroTitle}>Academic Marks</Text>
                <Text style={styles.heroSubtitle}>
                  View comprehensive score breakdowns for quizzes, surprise tests, and lab assignments.
                </Text>
              </View>
            </View>

            {/* Micro hint footer */}
            <View style={styles.heroFooterRow}>
              <View style={styles.syncHintBox}>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.syncHintText}>Synced directly with your official CU-LMS Gradebook</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Search Bar (When subjects are loaded) */}
        {mainCourses.length > 4 && (
          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search subjects or course codes..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {loading ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Connecting to LMS...</Text>
            <Text style={styles.emptySubtitle}>
              Scanning your enrolled Moodle courses in the background
            </Text>
          </View>
        ) : mainCourses.length === 0 ? (
          <View style={styles.emptyState}>
            {scraperStatus === 'syncing' ? (
               <>
                 <View style={styles.emptyIconCircle}>
                   <ActivityIndicator size="large" color={colors.primary} />
                 </View>
                 <Text style={styles.emptyTitle}>Syncing LMS Subjects...</Text>
                 <Text style={styles.emptySubtitle}>
                   Please wait while we fetch your academic courses from Moodle. This takes just a few moments.
                 </Text>
               </>
            ) : (
               <>
                 <View style={[styles.emptyIconCircle, { backgroundColor: '#ef444415', borderColor: '#ef444430' }]}>
                   <Ionicons name="alert-circle-outline" size={40} color="#ef4444" />
                 </View>
                 <Text style={styles.emptyTitle}>LMS Session Expired</Text>
                 <Text style={styles.emptySubtitle}>
                   We couldn't sync your courses in the background. Please open the LMS Subjects tab to refresh your credentials.
                 </Text>
                 <TouchableOpacity
                   style={styles.ctaButton}
                   onPress={() => {
                     try { Haptics.selectionAsync(); } catch {}
                     router.push('/studyos/subjects' as any);
                   }}
                   activeOpacity={0.85}
                 >
                   <Ionicons name="sync-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                   <Text style={styles.ctaButtonText}>Open LMS Subjects</Text>
                 </TouchableOpacity>
               </>
            )}
          </View>
        ) : (
          <View style={styles.listContainer}>
            <Text style={styles.sectionHeaderLabel}>ENROLLED SUBJECTS ({displayedCourses.length})</Text>

            {displayedCourses.map((course, index) => {
              const iconName = getSubjectIcon(course.fullname);
              return (
                <TouchableOpacity
                  key={course.id || index.toString()}
                  style={styles.courseCard}
                  activeOpacity={0.75}
                  onPress={() => {
                    try { Haptics.selectionAsync(); } catch {}
                    const numericId = course.id && /^\d+$/.test(String(course.id)) ? String(course.id) : '';
                    const targetId = numericId || course.originalName || course.shortname || course.fullname;
                    const nameParam = encodeURIComponent(course.originalName || course.fullname);
                    router.push(`/studyos/grades/${encodeURIComponent(targetId)}?name=${nameParam}` as any);
                  }}
                >
                  <View style={styles.cardIconBox}>
                    <LinearGradient
                      colors={[colors.primary + '25', (colors.accent || colors.primary) + '15']}
                      style={styles.cardIconGradient}
                    >
                      <Ionicons name={iconName} size={22} color={colors.primary} />
                    </LinearGradient>
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
                    <View style={styles.featuresRow}>
                      <Text style={styles.viewMarksHint}>Quizzes • Tests • Assignments</Text>
                    </View>
                  </View>

                  <View style={styles.chevronBox}>
                    <View style={styles.chevronCircle}>
                      <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Background scraping WebView — only active while Moodle courses are resolving */}
      {lmsCoursesFromStore.length === 0 && (
        <View style={{ width: 2, height: 2, opacity: 0, overflow: 'hidden', position: 'absolute', top: 0, left: 0 }}>
          <WebView
            key="grades-lms-scraper"
            ref={webViewRef}
            source={{ uri: webViewUrl }}
            onNavigationStateChange={handleNavigationStateChange}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
          />
        </View>
      )}
    </View>
  );
}

const useStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerBackBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: colors.surfaceHigh,
      borderWidth: 1, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
      marginLeft: 12,
    },
    headerCountBadge: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: (colors.accent || '#8b5cf6') + '15',
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: Radius.full,
      borderWidth: 1, borderColor: (colors.accent || '#8b5cf6') + '35',
      marginRight: 14,
    },
    headerCountText: {
      color: colors.accent || '#8b5cf6',
      fontFamily: Typography.h3.fontFamily,
      fontSize: 12,
    },
    scrollContent: {
      paddingHorizontal: Spacing.md,
      paddingTop: 4,
      paddingBottom: Spacing.xl * 2,
    },
    heroCardContainer: {
      borderRadius: Radius.xl,
      overflow: 'hidden',
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceHigh,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 10,
      elevation: 4,
    },
    heroGradient: {
      padding: Spacing.md + 2,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: Spacing.md,
    },
    heroIconBox: {
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: (colors.accent || '#8b5cf6') + '20',
      alignItems: 'center', justifyContent: 'center',
      marginRight: 14,
      borderWidth: 1, borderColor: (colors.accent || '#8b5cf6') + '40',
    },
    heroTextBox: { flex: 1 },
    heroPillBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    livePulseDot: {
      width: 7, height: 7, borderRadius: 4,
      backgroundColor: colors.accent || '#8b5cf6',
      marginRight: 6,
    },
    heroPillText: {
      fontFamily: Typography.label.fontFamily,
      fontSize: 10,
      letterSpacing: 0.8,
      color: colors.accent || '#8b5cf6',
    },
    heroTitle: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 20,
      color: colors.text,
      marginBottom: 3,
    },
    heroSubtitle: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },
    heroFooterRow: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: Spacing.sm + 2,
    },
    syncHintBox: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    syncHintText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 11,
      color: colors.textMuted,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceHigh,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: Spacing.md,
    },
    searchInput: {
      flex: 1,
      fontFamily: Typography.body.fontFamily,
      fontSize: 14,
      color: colors.text,
      padding: 0,
    },
    sectionHeaderLabel: {
      fontFamily: Typography.label.fontFamily,
      fontSize: 11,
      letterSpacing: 1,
      color: colors.textMuted,
      marginBottom: 10,
      marginLeft: 4,
    },
    listContainer: {
      gap: Spacing.sm + 2,
    },
    courseCard: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceHigh,
      borderRadius: Radius.xl,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    cardIconBox: {
      width: 48, height: 48, borderRadius: 16,
      overflow: 'hidden',
      marginRight: Spacing.md,
    },
    cardIconGradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.primary + '30',
      borderRadius: 16,
    },
    cardContent: { flex: 1, justifyContent: 'center' },
    codeBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 8, paddingVertical: 2,
      borderRadius: Radius.sm, marginBottom: 5,
      borderWidth: 1, borderColor: colors.primary + '30',
    },
    codeBadgeText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 11,
      color: colors.primary,
      textTransform: 'uppercase',
    },
    subjectTitle: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 15,
      color: colors.text,
      marginBottom: 4,
      lineHeight: 20,
    },
    featuresRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    viewMarksHint: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.textMuted,
    },
    chevronBox: {
      paddingLeft: Spacing.sm,
    },
    chevronCircle: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
    },
    emptyIconCircle: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: colors.primary + '15',
      borderWidth: 1, borderColor: colors.primary + '30',
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 18,
      color: colors.text,
      marginBottom: 6,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
    ctaButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 22,
      paddingVertical: 13,
      borderRadius: Radius.full,
      marginTop: 20,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    ctaButtonText: {
      color: '#fff',
      fontFamily: Typography.h3.fontFamily,
      fontSize: 14,
    },
  });
