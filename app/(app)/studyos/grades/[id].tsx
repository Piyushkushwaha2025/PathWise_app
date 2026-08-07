import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { useHardwareBack } from '../../../../hooks/useHardwareBack';

interface GradeItem {
  id: string;
  title: string;
  rawTitle?: string;
  category: string;
  grade: string;
  range: string;
  percentage?: string;
  feedback?: string;
  rank?: string;
}

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

export default function LmsGradeReportScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  useHardwareBack('/studyos/grades');

  const webViewRef = useRef<WebView>(null);
  // `id` may be a numeric Moodle course id (preferred) OR, when missing from cache,
  // the URL-encoded original Moodle full name. expo-router auto-decodes params.
  const rawId = typeof id === 'string' ? id : '';
  const isNumericId = /^\d+$/.test(rawId);
  const cacheKey = `lms_grades_cache_${rawId}`;

  const [grades, setGrades] = useState<GradeItem[]>([]);
  const [courseTotal, setCourseTotal] = useState<GradeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'graded' | 'unscored'>('all');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const cleanSubjectName = name ? stripAllWord(decodeURIComponent(String(name))) : 'Subject Grades';

  const targetUrl = isNumericId
    ? `https://lms.culko.in/grade/report/user/index.php?id=${rawId}`
    : `https://lms.culko.in/my/courses.php`;

  // ── Helper: Robust numerical evaluation of Graded state ──
  const isItemGraded = (grade: string | undefined): boolean => {
    if (!grade) return false;
    const clean = grade.replace(/\s+/g, ' ').trim();
    if (!clean || clean === '-' || clean === '–' || clean === '—' || clean === '&nbsp;' || clean.toLowerCase() === 'n/a') {
      return false;
    }
    // Must contain actual numeric digits to be counted as graded (e.g. 8.00, 10, 35)
    return /[0-9]/.test(clean);
  };

  // ── Helper: Eliminate course headers and subject name rows from showing up as assignment items ──
  const isValidGradeItem = (item: GradeItem, subj: string): boolean => {
    if (!item.title) return false;
    const tLow = item.title.toLowerCase().trim();
    const rLow = (item.rawTitle || '').toLowerCase().trim();

    // Reject standard table headers & keywords
    if (tLow === 'grade item' || tLow === 'category' || tLow === 'course total' || tLow === 'category total') {
      return false;
    }
    // Reject Moodle course header delimiter rows (e.g. CODE :: COURSE NAME)
    if (rLow.includes('::') || tLow.includes('::')) {
      return false;
    }
    // Reject rows that literally represent the subject name itself
    const normSubj = subj.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normTitle = tLow.replace(/[^a-z0-9]/g, '');

    if (normTitle.length >= 3 && normSubj.length >= 3) {
      if (normTitle === normSubj || normSubj.includes(normTitle) || normTitle.includes(normSubj)) {
        // Unless it explicitly contains an assessment keyword, it's a course header row
        if (!/\b(assign|quiz|test|lab|exam|attend|project|viva|tutorial)\b/i.test(item.title)) {
          return false;
        }
      }
    }
    return true;
  };

  // ── Load cached grades immediately on mount ──
  const loadCache = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.items)) {
          const cleanCached = parsed.items.filter((i: GradeItem) => isValidGradeItem(i, cleanSubjectName));
          setGrades(cleanCached);
          setCourseTotal(parsed.courseTotal || null);
          setLastUpdated(parsed.timestamp || null);
          setLoading(false);
        }
      }
    } catch (e) {
      console.error('Failed to read cached grades:', e);
    }
  }, [cacheKey, cleanSubjectName]);

  useEffect(() => {
    loadCache();
    const timer = setTimeout(() => {
      setLoading(false);
      setRefreshing(false);
    }, 35000);
    return () => clearTimeout(timer);
  }, [loadCache]);

  const onRefresh = () => {
    setRefreshing(true);
    webViewRef.current?.reload();
  };


  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'DEBUG_LOG') {
        console.log('[GRADE_SCRAPER]', data.msg);
      } else if (data.type === 'GRADES_RESULT' && Array.isArray(data.items)) {
        const validItems = data.items.filter((item: GradeItem) => isValidGradeItem(item, cleanSubjectName));

        let foundTotal: GradeItem | null = null;
        const cleanItems: GradeItem[] = [];

        validItems.forEach((item: GradeItem) => {
          if (
            item.title.toLowerCase().includes('total') ||
            item.category === 'TOTAL'
          ) {
            // Pick course total or fallback to category total
            if (!foundTotal || item.title.toLowerCase().includes('course')) {
              foundTotal = item;
            }
          } else {
            cleanItems.push(item);
          }
        });

        setGrades(cleanItems);
        setCourseTotal(foundTotal);
        setLoading(false);
        setRefreshing(false);

        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastUpdated(timeString);

        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({
            items: cleanItems,
            courseTotal: foundTotal,
            timestamp: timeString,
          })
        );
      }
    } catch (e) {
      console.error('Failed to process WebView grades message:', e);
    }
  };

  // ── JavaScript Scraper Injected into Moodle Grade Report ──
  const injectedJs = `
    (function() {
      function extractGrades() {
        var url = window.location.href;

        // Auto-Login Step 1: If on Moodle login page, redirect to ERP Dashboard to establish session
        if (url.indexOf('login') !== -1 && url.indexOf('lms.culko.in') !== -1) {
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'LMS Session expired! Auto-navigating to ERP...' }));
           window.location.href = 'https://student.culko.in/StudentHome.aspx';
           return;
        }

        // Auto-Login Step 2: If on ERP Dashboard, find and click the LMS button!
        if (url.indexOf('student.culko.in') !== -1) {
           var links = document.querySelectorAll('a');
           for (var i = 0; i < links.length; i++) {
              var txt = links[i].innerText ? links[i].innerText.toUpperCase().trim() : '';
              var href = links[i].href ? links[i].href.toLowerCase() : '';
              if (txt === 'CU-LMS' || txt === 'MY LMS' || txt === 'LMS' || txt === 'CU LMS' || txt.indexOf('LMS') !== -1 || href.indexOf('lms') !== -1) {
                 window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Found LMS button on ERP, clicking it!' }));
                 if (href && !href.startsWith('javascript:')) {
                    window.location.href = links[i].href;
                 } else {
                    links[i].click();
                 }
                 return;
              }
           }
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Could not find LMS button on ERP!' }));
           return;
        }

        // Step 1: If on My Courses or dashboard, find the exact course matching our title and prioritize ALL link!
        if (url.indexOf('my/courses') !== -1 || url.indexOf('my/') !== -1) {
          var targetName = "${String(name).replace(/"/g, '')}".toLowerCase();
          var targetId = "${String(id).replace(/"/g, '')}".toLowerCase();
          var targetTerm = targetName + " " + targetId.replace(/-/g, ' ');
          var words = targetTerm.split(/\s+/).filter(function(w){ return w.length >= 3; });
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Searching for words: ' + words.join(',') }));

          var links = document.querySelectorAll('a[href*="course/view.php?id="], a[href*="grade/report/user/index.php?id="], a[href*="/course/"]');
          var bestMatch = null;
          var bestScore = -1;
          
          var foundLinks = [];
          for(var j=0; j<links.length; j++) {
             var txt = (links[j].innerText + " " + links[j].href).toLowerCase();
             if (links[j].innerText && links[j].innerText.trim().length > 2) {
                foundLinks.push(links[j].innerText.trim().replace(/\n/g, ' '));
             }
             var matchCount = 0;
             for(var w=0; w<words.length; w++) { if(txt.indexOf(words[w]) !== -1) matchCount += 10; }
             if (/\ball\b|[-_]all|all[-_]|_all|all_/i.test(links[j].innerText)) matchCount += 50;
             if(words.length > 0 && matchCount > bestScore && matchCount >= 10) {
                bestScore = matchCount;
                bestMatch = links[j];
             }
          }
          
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Found ' + links.length + ' course links. Names: ' + foundLinks.join(' | ') }));

          if (bestMatch) {
             window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Best Match: ' + bestMatch.innerText + ' with score: ' + bestScore }));
             var m = bestMatch.href.match(/[?&]id=(\d+)/);
             if (m && m[1]) {
                window.location.href = "https://lms.culko.in/grade/report/user/index.php?id=" + m[1];
                return;
             }
          } else {
             window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'No match found for: ' + targetTerm }));
          }
        }

        // Step 2: If we are inside an ALL course view page (course/view.php), automatically find and open its Grades tab!
        if (window.location.href.indexOf('course/view.php') !== -1 || window.location.href.indexOf('/course/') !== -1) {
          var gradeTabs = document.querySelectorAll('a[href*="/grade/"], a[href*="grade/report"]');
          for(var g=0; g<gradeTabs.length; g++) {
             var gText = gradeTabs[g].innerText ? gradeTabs[g].innerText.trim().toLowerCase() : '';
             if (gText === 'grades' || gText === 'grade' || gradeTabs[g].href.indexOf('grade/report') !== -1) {
                window.location.href = gradeTabs[g].href;
                return;
             }
          }
        }

        var results = [];
        var added = {};
        
        // Strategy 1: Table rows in standard Moodle grade reports
        var rows = document.querySelectorAll('tr.grade_item, table.user-grade tr, table.generaltable tr, tr');
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (row.classList && (row.classList.contains('category') || row.classList.contains('heading') || row.classList.contains('level1') || row.classList.contains('header'))) {
            continue;
          }
          var headerCell = row.querySelector('th.item, td.item, th.column-itemname, td.column-itemname, .itemname, th[id*="grade_item_"]');
          if (!headerCell) continue;
          if (headerCell.classList && headerCell.classList.contains('category')) continue;

          var titleText = headerCell.innerText ? headerCell.innerText.replace(/\\s+/g, ' ').trim() : '';
          if (!titleText || titleText.length < 2 || titleText === 'Grade item' || titleText === 'Category' || titleText === 'Percentage') continue;

          var gradeCell = row.querySelector('.column-grade, .grade, td[headers*="grade"]');
          var grade = gradeCell ? gradeCell.innerText.replace(/\\s+/g, ' ').trim() : '-';
          if (grade === '' || grade === '&nbsp;' || grade.toLowerCase() === 'grade') continue;

          var rangeCell = row.querySelector('.column-range, .range, td[headers*="range"]');
          var range = rangeCell ? rangeCell.innerText.replace(/\\s+/g, ' ').trim() : '-';

          var percCell = row.querySelector('.column-percentage, .percentage, td[headers*="percentage"]');
          var perc = percCell ? percCell.innerText.replace(/\\s+/g, ' ').trim() : '';

          var feedbackCell = row.querySelector('.column-feedback, .feedback, td[headers*="feedback"]');
          var feedback = feedbackCell ? feedbackCell.innerText.replace(/\\s+/g, ' ').trim() : '';
          if (feedback === '&nbsp;' || feedback === '-') feedback = '';

          var cat = 'ASSIGNMENT';
          if (titleText.toUpperCase().includes('QUIZ') || titleText.toUpperCase().includes('TEST')) cat = 'QUIZ';
          else if (titleText.toUpperCase().includes('SURPRISE')) cat = 'SURPRISE TEST';
          else if (titleText.toUpperCase().includes('ATTENDANCE') || titleText.toUpperCase().includes('PRESENCE')) cat = 'ATTENDANCE';
          else if (titleText.toUpperCase().includes('TOTAL') || titleText.toUpperCase().includes('COURSE GRADE')) cat = 'TOTAL';

          var cleanTitle = titleText
            .replace(/^QUIZ\\s*/i, '')
            .replace(/^ASSIGNMENT\\s*/i, 'Assignment ')
            .trim();
          if (!cleanTitle) cleanTitle = titleText;

          var key = titleText + '_' + range;
          if (!added[key]) {
            added[key] = true;
            results.push({
              id: 'g_' + results.length + '_' + Math.random().toString(36).substr(2, 5),
              title: cleanTitle,
              rawTitle: titleText,
              category: cat,
              grade: grade,
              range: range,
              percentage: perc,
              feedback: feedback
            });
          }
        }

        // Strategy 2 (Fallback for generic tables without standard Moodle class names):
        if (results.length === 0) {
          var allRows = document.querySelectorAll('table tr');
          for (var r = 0; r < allRows.length; r++) {
             var cells = allRows[r].querySelectorAll('th, td');
             if (cells.length >= 2) {
               var t = cells[0].innerText ? cells[0].innerText.replace(/\\s+/g, ' ').trim() : '';
               if (!t || t.length < 2 || t.toLowerCase().includes('grade item') || t.toLowerCase() === 'category') continue;
               var g = cells[1].innerText ? cells[1].innerText.replace(/\\s+/g, ' ').trim() : '-';
               if (g === '' || g === '&nbsp;' || g.toLowerCase() === 'grade') continue;
               var rng = cells.length >= 3 ? (cells[2].innerText ? cells[2].innerText.replace(/\\s+/g, ' ').trim() : '-') : '-';
               var k = t + '_' + rng;
               if (!added[k]) {
                 added[k] = true;
                 var cCat = 'ASSIGNMENT';
                 if (t.toUpperCase().includes('QUIZ') || t.toUpperCase().includes('TEST')) cCat = 'QUIZ';
                 else if (t.toUpperCase().includes('SURPRISE')) cCat = 'SURPRISE TEST';
                 else if (t.toUpperCase().includes('ATTENDANCE')) cCat = 'ATTENDANCE';
                 else if (t.toUpperCase().includes('TOTAL')) cCat = 'TOTAL';
                 results.push({
                   id: 'gf_' + results.length + '_' + Math.random().toString(36).substr(2, 5),
                   title: t,
                   rawTitle: t,
                   category: cCat,
                   grade: g,
                   range: rng,
                   percentage: '',
                   feedback: ''
                 });
               }
             }
          }
        }

        // Send back results
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'GRADES_RESULT',
          items: results
        }));
      }

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        extractGrades();
      } else {
        window.addEventListener('DOMContentLoaded', extractGrades);
      }
      setTimeout(extractGrades, 1500);
      setTimeout(extractGrades, 3500);
    })();
    true;
  `;

  // Filter items using robust digit check
  const gradedItems = grades.filter((i) => isItemGraded(i.grade));
  const unscoredItems = grades.filter((i) => !isItemGraded(i.grade));

  const filteredList =
    activeFilter === 'graded' ? gradedItems : activeFilter === 'unscored' ? unscoredItems : grades;

  const getCategoryColor = (cat: string) => {
    switch (cat.toUpperCase()) {
      case 'QUIZ':
        return colors.primary; // dynamic accent color
      case 'SURPRISE TEST':
        return colors.warning || '#f59e0b'; // theme warning color
      case 'ATTENDANCE':
        return colors.success || '#22c55e'; // theme success color
      case 'TOTAL':
        return colors.xpGold || colors.warning || '#fbbf24'; // theme gold
      default:
        return colors.accent || colors.primary; // dynamic secondary accent color
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat.toUpperCase()) {
      case 'QUIZ':
        return 'help-circle';
      case 'SURPRISE TEST':
        return 'flash';
      case 'ATTENDANCE':
        return 'people';
      case 'TOTAL':
        return 'ribbon';
      default:
        return 'document-text';
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Grade Center',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.replace('/studyos/grades' as any)}
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

      {/* Hidden WebView to extract grades in background */}
      <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute', top: 0, left: 0 }}>
        <WebView
          ref={webViewRef}
          source={{ uri: targetUrl }}
          injectedJavaScript={injectedJs}
          onMessage={handleWebViewMessage}
          onNavigationStateChange={(state) => {
            console.log('[GRADE_SCRAPER_NAV]', state.url);
          }}
          onLoadEnd={() => {
            webViewRef.current?.injectJavaScript(injectedJs);
          }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Subject Header & Total Marks Display */}
        <View style={styles.subjectHeader}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.subjectNameText} numberOfLines={2}>
              {cleanSubjectName}
            </Text>
            {!!courseTotal && (
              <View style={styles.totalBadgeBox}>
                <Text style={styles.totalLabelText}>TOTAL MARKS</Text>
                <View style={styles.totalScoreRow}>
                  <Text style={styles.totalScoreNumber}>
                    {isItemGraded(courseTotal.grade) ? courseTotal.grade : '—'}
                  </Text>
                  {!!courseTotal.range && courseTotal.range !== '-' && (
                    <Text style={styles.totalRangeText}>
                      {' '}/ {courseTotal.range.replace(/^0[-–—]/, '').trim()}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          <View style={styles.headerStatusBar}>
            <Text style={styles.statusHelperText}>
              {lastUpdated ? `Sync complete (${lastUpdated})` : 'Scanning Moodle...'}
            </Text>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshBadge}>
              <Ionicons name="refresh" size={14} color="#ffffff" />
              <Text style={styles.refreshText}>Sync Now</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Analytics Overview Cards */}
        <View style={styles.analyticsRow}>
          <View style={[styles.statBox, { borderLeftColor: colors.primary }]}>
            <Text style={styles.statNumber}>{grades.length}</Text>
            <Text style={styles.statLabel}>Total Listed</Text>
          </View>
          <View style={[styles.statBox, { borderLeftColor: colors.success || '#22c55e' }]}>
            <Text style={[styles.statNumber, { color: colors.success || '#22c55e' }]}>{gradedItems.length}</Text>
            <Text style={styles.statLabel}>Graded</Text>
          </View>
          <View style={[styles.statBox, { borderLeftColor: colors.accent || colors.primary }]}>
            <Text style={[styles.statNumber, { color: colors.text }]}>{unscoredItems.length}</Text>
            <Text style={styles.statLabel}>Not Scored</Text>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeFilter === 'all' && styles.activeTab]}
            onPress={() => setActiveFilter('all')}
          >
            <Text style={[styles.tabText, activeFilter === 'all' && styles.activeTabText]}>
              All ({grades.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeFilter === 'graded' && styles.activeTab]}
            onPress={() => setActiveFilter('graded')}
          >
            <Text style={[styles.tabText, activeFilter === 'graded' && styles.activeTabText]}>
              Graded ({gradedItems.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeFilter === 'unscored' && styles.activeTab]}
            onPress={() => setActiveFilter('unscored')}
          >
            <Text style={[styles.tabText, activeFilter === 'unscored' && styles.activeTabText]}>
              Not Scored ({unscoredItems.length})
            </Text>
          </TouchableOpacity>
        </View>

        {loading && grades.length === 0 ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading Grade Records...</Text>
            <Text style={styles.loadingSubtext}>Fetching quiz & assignment scores directly from Moodle Gradebook</Text>
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="documents-outline" size={64} color={colors.primary} />
            <Text style={styles.emptyText}>No {activeFilter} records found!</Text>
            <Text style={[styles.emptyText, { fontSize: 13, marginTop: 6, textAlign: 'center', color: colors.text }]}>
              {activeFilter === 'unscored'
                ? 'All your listed assessments for this subject have been graded!'
                : 'Your professor has not uploaded any scores for this section yet.'}
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredList.map((item) => {
              const isGraded = isItemGraded(item.grade);
              const catColor = getCategoryColor(item.category);
              const catIcon = getCategoryIcon(item.category) as any;
              const cleanRange = item.range && item.range !== '-' ? item.range.replace(/^0[-–—]/, '').trim() : '';
              
              // Format grade nicely: ensure something/something display for graded items
              const formattedScore = item.grade ? item.grade.replace(/\s+/g, ' ').trim() : '';

              return (
                <View key={item.id} style={styles.gradeCard}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.leftMeta}>
                      <View style={[styles.categoryIconCircle, { backgroundColor: catColor + '25', borderColor: catColor + '50', borderWidth: 1 }]}>
                        <Ionicons name={catIcon} size={20} color={catColor} />
                      </View>
                      <View style={styles.titleContainer}>
                        <View style={[styles.categoryBadge, { backgroundColor: catColor + '20', borderColor: catColor + '40', borderWidth: 1 }]}>
                          <Text style={[styles.categoryBadgeText, { color: catColor }]}>{item.category}</Text>
                        </View>
                        <Text style={styles.itemTitle}>{item.title}</Text>
                      </View>
                    </View>

                    <View style={styles.scoreBox}>
                      {isGraded ? (
                        <View style={styles.gradedChip}>
                          <Text style={styles.scoreText}>{formattedScore}</Text>
                          {!!cleanRange && !formattedScore.includes('/') && (
                            <Text style={styles.rangeText}> / {cleanRange}</Text>
                          )}
                        </View>
                      ) : (
                        <View style={styles.unscoredChip}>
                          <Text style={styles.unscoredDashText}>—</Text>
                          {!!cleanRange && (
                            <Text style={styles.unscoredRangeText}> / {cleanRange}</Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Teacher Feedback Quote Box if present */}
                  {!!item.feedback && item.feedback.trim().length > 0 && (
                    <View style={styles.feedbackBox}>
                      <Ionicons name="chatbubble-ellipses" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.feedbackText} numberOfLines={3}>
                        <Text style={{ fontFamily: Typography.h3.fontFamily, color: colors.text }}>Teacher Note: </Text>
                        {item.feedback}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
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
    subjectHeader: {
      backgroundColor: colors.surfaceHigh,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    subjectNameText: {
      flex: 1,
      fontFamily: Typography.h2.fontFamily,
      fontSize: 20,
      color: colors.text,
      marginRight: 12,
    },
    totalBadgeBox: {
      backgroundColor: (colors.xpGold || colors.warning || '#fbbf24') + '20',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: Radius.lg,
      borderWidth: 1.5,
      borderColor: colors.xpGold || colors.warning || '#fbbf24',
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    totalLabelText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 10,
      color: colors.xpGold || colors.warning || '#fbbf24',
      letterSpacing: 1,
      marginBottom: 2,
    },
    totalScoreRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    totalScoreNumber: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 19,
      color: colors.text,
    },
    totalRangeText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.text,
    },
    headerStatusBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 10,
    },
    statusHelperText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.text,
    },
    refreshBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    refreshText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 12,
      color: '#ffffff',
      marginLeft: 6,
    },
    analyticsRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.md,
    },
    statBox: {
      flex: 1,
      backgroundColor: colors.surfaceHigh,
      padding: Spacing.sm,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 4,
      alignItems: 'center',
    },
    statNumber: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 22,
      color: colors.text,
    },
    statLabel: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.text,
      marginTop: 2,
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceHigh,
      borderRadius: Radius.lg,
      padding: 4,
      marginTop: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: Radius.md,
    },
    activeTab: {
      backgroundColor: colors.primary,
    },
    tabText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.text,
    },
    activeTabText: {
      fontFamily: Typography.h3.fontFamily,
      color: '#ffffff',
    },
    listContainer: {
      gap: Spacing.sm,
    },
    gradeCard: {
      backgroundColor: colors.surfaceHigh,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
    cardTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    leftMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: Spacing.sm,
    },
    categoryIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    titleContainer: {
      flex: 1,
    },
    categoryBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: Radius.sm,
      marginBottom: 5,
    },
    categoryBadgeText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 10,
      textTransform: 'uppercase',
    },
    itemTitle: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 16,
      color: colors.text,
    },
    scoreBox: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    gradedChip: {
      flexDirection: 'row',
      alignItems: 'baseline',
      backgroundColor: (colors.success || '#22c55e') + '25',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.success || '#4ade80',
    },
    scoreText: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 18,
      color: colors.success || '#4ade80',
    },
    rangeText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 14,
      color: colors.text,
    },
    unscoredChip: {
      flexDirection: 'row',
      alignItems: 'baseline',
      backgroundColor: colors.surface || '#334155',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border || '#475569',
    },
    unscoredDashText: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 18,
      color: colors.text,
    },
    unscoredRangeText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.text,
    },
    feedbackBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '15',
      padding: Spacing.sm,
      borderRadius: Radius.md,
      marginTop: Spacing.md,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    feedbackText: {
      flex: 1,
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.text,
      lineHeight: 18,
    },
    loadingState: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 60,
      paddingHorizontal: 20,
    },
    loadingText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 17,
      color: colors.text,
      marginTop: 16,
    },
    loadingSubtext: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 13,
      color: colors.text,
      textAlign: 'center',
      marginTop: 6,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 60,
      paddingHorizontal: 20,
    },
    emptyText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 16,
      color: colors.text,
      marginTop: 12,
    },
  });
