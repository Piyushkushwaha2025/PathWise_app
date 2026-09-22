import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
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
  useHardwareBack('/studyos/grades');

  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';
  const styles = useStyles(colors, isDark);

  const webViewRef = useRef<WebView>(null);
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

  const isItemGraded = (grade: string | undefined): boolean => {
    if (!grade) return false;
    const clean = grade.replace(/\s+/g, ' ').trim();
    if (!clean || clean === '-' || clean === '–' || clean === '—' || clean === '&nbsp;' || clean.toLowerCase() === 'n/a') {
      return false;
    }
    return /[0-9]/.test(clean);
  };

  const isValidGradeItem = (item: GradeItem): boolean => {
    if (!item || !item.title) return false;
    const tLow = item.title.toLowerCase().trim();
    const rLow = (item.rawTitle || '').toLowerCase().trim();

    if (
      tLow === 'grade item' || tLow === 'category' || tLow === 'course total' ||
      tLow === 'category total' || tLow === 'grade' || tLow === 'item' || tLow === 'range'
    ) return false;

    if (rLow.includes('::') || tLow.includes('::')) return false;

    const hasGrade = !!item.grade && item.grade !== '-' && item.grade !== '—' &&
      item.grade.toLowerCase() !== 'n/a' && item.grade.trim() !== '';
    const hasKeyword = /\b(assign|quiz|test|lab|exam|attend|project|viva|tutorial|mid|mst|practical|surprise|ct|class\s*test)\b/i.test(item.title);
    if (!hasGrade && !hasKeyword) return false;

    return true;
  };

  const loadCache = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.items)) {
          const cleanCached = parsed.items.filter((i: GradeItem) => isValidGradeItem(i));
          setGrades(cleanCached);
          setCourseTotal(parsed.courseTotal || null);
          setLastUpdated(parsed.timestamp || null);
          setLoading(false);
        }
      }
    } catch (e) {
      console.error('Failed to read cached grades:', e);
    }
  }, [cacheKey]);

  useEffect(() => {
    loadCache();
    const timer = setTimeout(() => {
      setLoading(false);
      setRefreshing(false);
    }, 25000);
    return () => clearTimeout(timer);
  }, [loadCache]);

  const onRefresh = () => {
    try { Haptics.selectionAsync(); } catch {}
    setRefreshing(true);
    webViewRef.current?.reload();
  };

  const handleWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'GRADES_RESULT' && Array.isArray(data.items)) {
        const validItems = data.items.filter((item: GradeItem) => isValidGradeItem(item));

        let foundTotal: GradeItem | null = null;
        const cleanItems: GradeItem[] = [];

        validItems.forEach((item: GradeItem) => {
          if (
            item.title.toLowerCase().includes('total') ||
            item.category === 'TOTAL'
          ) {
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

  const injectedJs = `
    (function() {
      function extractGrades() {
        var url = window.location.href.toLowerCase();
        if (url.includes('student.culko.in') && url.includes('login')) return;
        if (url.includes('lms.culko.in') && url.includes('login')) {
          window.location.href = 'https://student.culko.in/StudentHome.aspx';
          return;
        }
        if (url.includes('studenthome.aspx')) {
          var links = document.querySelectorAll('a');
          for (var j = 0; j < links.length; j++) {
            var txt = links[j].innerText ? links[j].innerText.toUpperCase().trim() : '';
            if (txt === 'CU-LMS' || txt === 'MY LMS' || txt === 'LMS' || txt === 'CU LMS') {
              if (links[j].href && !links[j].href.toLowerCase().startsWith('javascript:')) {
                window.location.href = links[j].href;
              } else {
                links[j].click();
              }
              return;
            }
          }
          return;
        }

        if (url.includes('/my/courses.php') || url.includes('/my/')) {
          var targetName = decodeURIComponent("${encodeURIComponent(rawId)}").toLowerCase().trim();
          var courseLinks = document.querySelectorAll('a[href*="course/view.php"]');
          var matchedCourseId = null;

          for (var i = 0; i < courseLinks.length; i++) {
            var fullText = courseLinks[i].innerText ? courseLinks[i].innerText.toLowerCase().trim() : '';
            var href = courseLinks[i].getAttribute('href') || '';
            var m = href.match(/id=([0-9]+)/);
            if (m && targetName) {
              var cleanT = targetName.replace(/[^a-z0-9]/g, ' ');
              var cleanF = fullText.replace(/[^a-z0-9]/g, ' ');
              var tWords = cleanT.split(/\\s+/).filter(function(w){ return w.length >= 3; });
              var matchCount = 0;
              for (var w = 0; w < tWords.length; w++) {
                if (cleanF.indexOf(tWords[w]) !== -1) matchCount++;
              }
              if (matchCount >= Math.min(2, tWords.length)) {
                matchedCourseId = m[1];
                break;
              }
            }
          }

          if (matchedCourseId) {
            window.location.href = 'https://lms.culko.in/grade/report/user/index.php?id=' + matchedCourseId;
            return;
          }
        }

        var results = [];
        var table = document.querySelector('table.user-grade');
        if (table) {
          var rows = table.querySelectorAll('tbody tr');
          for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            var itemEl = row.querySelector('.column-itemname, th[scope="row"]');
            var rawItem = itemEl ? (itemEl.innerText || '').trim() : '';
            if (!rawItem) continue;

            var cleanItem = rawItem.replace(/Course is starred|Course name|Manual item/gi, '').trim();
            var gradeEl = row.querySelector('.column-grade');
            var rangeEl = row.querySelector('.column-range');
            var pctEl = row.querySelector('.column-percentage');
            var fbEl = row.querySelector('.column-feedback');

            var gradeVal = gradeEl ? gradeEl.innerText.trim() : '';
            var rangeVal = rangeEl ? rangeEl.innerText.trim() : '';
            var pctVal = pctEl ? pctEl.innerText.trim() : '';
            var fbVal = fbEl ? fbEl.innerText.trim() : '';

            var cat = 'ASSIGNMENT';
            var u = cleanItem.toUpperCase();
            if (u.includes('QUIZ')) cat = 'QUIZ';
            else if (u.includes('SURPRISE') || u.includes('TEST')) cat = 'SURPRISE TEST';
            else if (u.includes('ATTEND') || u.includes('PRESENCE')) cat = 'ATTENDANCE';
            else if (u.includes('TOTAL') || row.classList.contains('total') || row.classList.contains('coursetotal')) cat = 'TOTAL';

            results.push({
              id: 'g_' + r + '_' + Math.random().toString(36).substr(2, 5),
              title: cleanItem,
              rawTitle: rawItem,
              category: cat,
              grade: gradeVal,
              range: rangeVal,
              percentage: pctVal,
              feedback: fbVal
            });
          }
        }

        window.__gradeAttempt = (window.__gradeAttempt || 0) + 1;
        var isFinal = window.__gradeAttempt >= 3;
        if (results.length > 0 || isFinal) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'GRADES_RESULT',
            items: results
          }));
        }
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

  const gradedItems = useMemo(() => grades.filter((i) => isItemGraded(i.grade)), [grades]);
  const unscoredItems = useMemo(() => grades.filter((i) => !isItemGraded(i.grade)), [grades]);

  const filteredList = useMemo(() => {
    return activeFilter === 'graded' ? gradedItems : activeFilter === 'unscored' ? unscoredItems : grades;
  }, [activeFilter, gradedItems, unscoredItems, grades]);

  // Compute total percentage and performance standing
  const totalNumericScore = courseTotal && isItemGraded(courseTotal.grade) ? parseFloat(courseTotal.grade) : null;
  const cleanMaxRange = courseTotal?.range && courseTotal.range !== '-' ? parseFloat(courseTotal.range.replace(/^0[-–—]/, '').trim()) : null;
  const totalPercentage = totalNumericScore !== null && cleanMaxRange && cleanMaxRange > 0
    ? Math.round((totalNumericScore / cleanMaxRange) * 100)
    : null;

  const getCategoryColor = (cat: string) => {
    switch (cat.toUpperCase()) {
      case 'QUIZ':
        return '#8b5cf6'; // Purple
      case 'SURPRISE TEST':
        return '#f59e0b'; // Amber
      case 'ATTENDANCE':
        return '#10b981'; // Green
      case 'LAB':
      case 'PRACTICAL':
        return '#06b6d4'; // Cyan
      case 'MID-TERM':
      case 'MST':
      case 'EXAM':
        return '#f43f5e'; // Rose
      case 'TOTAL':
        return colors.xpGold || colors.warning || '#fbbf24';
      default:
        return colors.primary; // Blue
    }
  };

  const getCategoryIcon = (cat: string): keyof typeof Ionicons.glyphMap => {
    switch (cat.toUpperCase()) {
      case 'QUIZ':
        return 'help-circle';
      case 'SURPRISE TEST':
        return 'flash';
      case 'ATTENDANCE':
        return 'people';
      case 'LAB':
      case 'PRACTICAL':
        return 'flask';
      case 'MID-TERM':
      case 'MST':
      case 'EXAM':
        return 'school';
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
          title: 'Grade Report',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                router.navigate('/studyos/grades' as any);
              }} 
              style={styles.headerBackBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity 
              onPress={onRefresh} 
              style={styles.headerRefreshBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="sync" size={17} color={colors.primary} />
            </TouchableOpacity>
          )
        }}
      />

      {/* Hidden WebView scraper */}
      {(!grades || grades.length === 0 || refreshing) && (
        <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute', top: 0, left: 0 }}>
          <WebView
            ref={webViewRef}
            source={{ uri: targetUrl }}
            onMessage={handleWebViewMessage}
            onLoadEnd={() => {
              webViewRef.current?.injectJavaScript(injectedJs);
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
          />
        </View>
      )}

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
        {/* Subject Header Console */}
        <View style={styles.subjectHeroCard}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(59, 130, 246, 0.16)', 'rgba(139, 92, 246, 0.08)']
                : ['rgba(37, 99, 235, 0.10)', 'rgba(124, 58, 237, 0.04)']
            }
            style={styles.heroGradient}
          >
            <View style={styles.heroTopRow}>
              <View style={styles.heroTitleColumn}>
                <View style={styles.subjectBadge}>
                  <Ionicons name="book" size={12} color={colors.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.subjectBadgeText}>COURSE EVALUATION</Text>
                </View>
                <Text style={styles.subjectTitleText} numberOfLines={2}>
                  {cleanSubjectName}
                </Text>
              </View>

              {/* Total Marks Pill */}
              {!!courseTotal && (
                <View style={styles.totalScoreBox}>
                  <Text style={styles.totalScoreLabel}>COURSE TOTAL</Text>
                  <View style={styles.totalScoreRow}>
                    <Text style={styles.totalScoreNum}>
                      {isItemGraded(courseTotal.grade) ? courseTotal.grade : '—'}
                    </Text>
                    {!!courseTotal.range && courseTotal.range !== '-' && (
                      <Text style={styles.totalScoreMax}>
                        {' '}/ {courseTotal.range.replace(/^0[-–—]/, '').trim()}
                      </Text>
                    )}
                  </View>
                  {totalPercentage !== null && (
                    <View style={styles.percentagePill}>
                      <Text style={styles.percentagePillText}>{totalPercentage}%</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Sync Status Bar */}
            <View style={styles.heroStatusBar}>
              <View style={styles.syncStatusLeft}>
                <Ionicons 
                  name={lastUpdated ? "checkmark-circle" : "time-outline"} 
                  size={14} 
                  color={lastUpdated ? '#10b981' : colors.textMuted} 
                  style={{ marginRight: 6 }} 
                />
                <Text style={styles.syncStatusText}>
                  {lastUpdated ? `Live synced at ${lastUpdated}` : 'Scanning Moodle LMS...'}
                </Text>
              </View>

              <TouchableOpacity 
                onPress={onRefresh} 
                style={styles.syncNowBtn}
                activeOpacity={0.75}
              >
                <Ionicons name="refresh" size={13} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.syncNowBtnText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* 3 Metric Analytics Tiles */}
        <View style={styles.analyticsRow}>
          <View style={styles.statTile}>
            <View style={styles.statTileTop}>
              <Ionicons name="layers-outline" size={16} color={colors.primary} />
              <Text style={styles.statTileNumber}>{grades.length}</Text>
            </View>
            <Text style={styles.statTileLabel}>Total Items</Text>
          </View>

          <View style={[styles.statTile, styles.statTileGraded]}>
            <View style={styles.statTileTop}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#10b981" />
              <Text style={[styles.statTileNumber, { color: '#10b981' }]}>{gradedItems.length}</Text>
            </View>
            <Text style={styles.statTileLabel}>Graded</Text>
          </View>

          <View style={[styles.statTile, styles.statTileUnscored]}>
            <View style={styles.statTileTop}>
              <Ionicons name="hourglass-outline" size={16} color={colors.warning || '#f59e0b'} />
              <Text style={[styles.statTileNumber, { color: colors.warning || '#f59e0b' }]}>{unscoredItems.length}</Text>
            </View>
            <Text style={styles.statTileLabel}>Not Scored</Text>
          </View>
        </View>

        {/* Filter Segmented Control */}
        <View style={styles.segmentedContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeFilter === 'all' && styles.segmentBtnActive]}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              setActiveFilter('all');
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeFilter === 'all' && styles.segmentTextActive]}>
              All ({grades.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeFilter === 'graded' && styles.segmentBtnActive]}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              setActiveFilter('graded');
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeFilter === 'graded' && styles.segmentTextActive]}>
              Graded ({gradedItems.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeFilter === 'unscored' && styles.segmentBtnActive]}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch {}
              setActiveFilter('unscored');
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeFilter === 'unscored' && styles.segmentTextActive]}>
              Pending ({unscoredItems.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Grade Items List */}
        {loading && grades.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Fetching Grade Records...</Text>
            <Text style={styles.emptySubtitle}>
              Pulling your quiz, test, and assignment marks directly from Moodle Gradebook
            </Text>
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="folder-open-outline" size={38} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No {activeFilter} records found</Text>
            <Text style={styles.emptySubtitle}>
              {activeFilter === 'unscored'
                ? 'All listed assessments for this subject have been evaluated!'
                : 'No evaluation records available under this filter.'}
            </Text>
          </View>
        ) : (
          <View style={styles.gradesList}>
            {filteredList.map((item) => {
              const isGraded = isItemGraded(item.grade);
              const catColor = getCategoryColor(item.category);
              const catIcon = getCategoryIcon(item.category);
              const cleanRange = item.range && item.range !== '-' ? item.range.replace(/^0[-–—]/, '').trim() : '';
              const formattedScore = item.grade ? item.grade.replace(/\s+/g, ' ').trim() : '';

              // Mini score bar calculation
              const numScore = isGraded ? parseFloat(formattedScore) : null;
              const numRange = cleanRange ? parseFloat(cleanRange) : null;
              const itemPct = numScore !== null && numRange && numRange > 0 ? Math.min(Math.round((numScore / numRange) * 100), 100) : null;

              return (
                <View key={item.id} style={styles.gradeCard}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.leftMetaColumn}>
                      <View style={styles.categoryRow}>
                        <View style={[styles.categoryIconCircle, { backgroundColor: catColor + '18', borderColor: catColor + '35' }]}>
                          <Ionicons name={catIcon} size={15} color={catColor} />
                        </View>
                        <View style={[styles.categoryBadge, { backgroundColor: catColor + '15', borderColor: catColor + '30' }]}>
                          <Text style={[styles.categoryBadgeText, { color: catColor }]}>{item.category}</Text>
                        </View>
                      </View>

                      <Text style={styles.itemTitleText}>{item.title}</Text>
                    </View>

                    {/* Score Chip */}
                    <View style={styles.scoreContainer}>
                      {isGraded ? (
                        <View style={styles.gradedScorePill}>
                          <Text style={styles.gradedScoreNumber}>{formattedScore}</Text>
                          {!!cleanRange && !formattedScore.includes('/') && (
                            <Text style={styles.gradedScoreRange}> / {cleanRange}</Text>
                          )}
                        </View>
                      ) : (
                        <View style={styles.unscoredPill}>
                          <Ionicons name="hourglass-outline" size={13} color={colors.textMuted} style={{ marginRight: 4 }} />
                          <Text style={styles.unscoredPillText}>Pending</Text>
                          {!!cleanRange && (
                            <Text style={styles.unscoredRangeText}> /{cleanRange}</Text>
                          )}
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Optional Mini Progress Bar for Graded Item */}
                  {itemPct !== null && (
                    <View style={styles.itemProgressBarTrack}>
                      <View style={[styles.itemProgressBarFill, { width: `${itemPct}%`, backgroundColor: itemPct >= 70 ? '#10b981' : itemPct >= 40 ? colors.primary : '#ef4444' }]} />
                    </View>
                  )}

                  {/* Teacher Feedback Quote Box */}
                  {!!item.feedback && item.feedback.trim().length > 0 && (
                    <View style={styles.feedbackBubble}>
                      <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.primary} style={{ marginRight: 8, marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.feedbackLabel}>Instructor Evaluation:</Text>
                        <Text style={styles.feedbackText}>{item.feedback}</Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
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
    headerRefreshBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: colors.primary + '15',
      borderWidth: 1, borderColor: colors.primary + '30',
      alignItems: 'center', justifyContent: 'center',
      marginRight: 14,
    },
    scrollContent: {
      paddingHorizontal: Spacing.md,
      paddingTop: 4,
      paddingBottom: Spacing.xl * 2,
    },
    subjectHeroCard: {
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
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: Spacing.md,
    },
    heroTitleColumn: {
      flex: 1,
      marginRight: 12,
    },
    subjectBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.primary + '18',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radius.full,
      marginBottom: 6,
    },
    subjectBadgeText: {
      fontFamily: Typography.label.fontFamily,
      fontSize: 10,
      color: colors.primary,
      letterSpacing: 0.8,
    },
    subjectTitleText: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 19,
      color: colors.text,
      lineHeight: 25,
    },
    totalScoreBox: {
      alignItems: 'flex-end',
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: (colors.xpGold || colors.warning || '#fbbf24') + '50',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radius.lg,
      minWidth: 84,
    },
    totalScoreLabel: {
      fontFamily: Typography.label.fontFamily,
      fontSize: 9,
      letterSpacing: 0.8,
      color: colors.xpGold || colors.warning || '#fbbf24',
      marginBottom: 2,
    },
    totalScoreRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    totalScoreNum: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 19,
      color: colors.text,
    },
    totalScoreMax: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.textMuted,
    },
    percentagePill: {
      backgroundColor: (colors.xpGold || colors.warning || '#fbbf24') + '20',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: Radius.full,
      marginTop: 4,
    },
    percentagePillText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 10,
      color: colors.xpGold || colors.warning || '#fbbf24',
    },
    heroStatusBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 10,
    },
    syncStatusLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    syncStatusText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.textMuted,
    },
    syncNowBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radius.full,
    },
    syncNowBtnText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 11,
      color: '#fff',
    },
    analyticsRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginBottom: Spacing.md,
    },
    statTile: {
      flex: 1,
      backgroundColor: colors.surfaceHigh,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      padding: Spacing.sm + 2,
    },
    statTileGraded: {
      borderColor: '#10b98135',
    },
    statTileUnscored: {
      borderColor: (colors.warning || '#f59e0b') + '35',
    },
    statTileTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    statTileNumber: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 18,
      color: colors.text,
    },
    statTileLabel: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 11,
      color: colors.textMuted,
    },
    segmentedContainer: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceHigh,
      borderRadius: Radius.full,
      padding: 4,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.full,
    },
    segmentBtnActive: {
      backgroundColor: isDark ? colors.surface : '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    segmentText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.textMuted,
    },
    segmentTextActive: {
      fontFamily: Typography.h3.fontFamily,
      color: colors.text,
    },
    gradesList: {
      gap: Spacing.sm + 2,
    },
    gradeCard: {
      backgroundColor: colors.surfaceHigh,
      borderRadius: Radius.xl,
      padding: Spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 5,
      elevation: 2,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    leftMetaColumn: {
      flex: 1,
      marginRight: 10,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    categoryIconCircle: {
      width: 26, height: 26, borderRadius: 13,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1,
      marginRight: 6,
    },
    categoryBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: Radius.full,
      borderWidth: 1,
    },
    categoryBadgeText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    itemTitleText: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 15,
      color: colors.text,
      lineHeight: 20,
    },
    scoreContainer: {
      alignItems: 'flex-end',
    },
    gradedScorePill: {
      flexDirection: 'row',
      alignItems: 'baseline',
      backgroundColor: '#10b98118',
      borderWidth: 1,
      borderColor: '#10b98140',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radius.full,
    },
    gradedScoreNumber: {
      fontFamily: Typography.h2.fontFamily,
      fontSize: 16,
      color: '#10b981',
    },
    gradedScoreRange: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.text,
    },
    unscoredPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: Radius.full,
    },
    unscoredPillText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 11,
      color: colors.textMuted,
    },
    unscoredRangeText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 11,
      color: colors.textMuted,
    },
    itemProgressBarTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      overflow: 'hidden',
      marginTop: 10,
    },
    itemProgressBarFill: {
      height: '100%',
      borderRadius: 2,
    },
    feedbackBubble: {
      flexDirection: 'row',
      backgroundColor: colors.primary + '10',
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      borderRadius: Radius.md,
      padding: Spacing.sm + 2,
      marginTop: 10,
    },
    feedbackLabel: {
      fontFamily: Typography.h3.fontFamily,
      fontSize: 11,
      color: colors.primary,
      marginBottom: 2,
    },
    feedbackText: {
      fontFamily: Typography.body.fontFamily,
      fontSize: 12,
      color: colors.text,
      lineHeight: 17,
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
  });
