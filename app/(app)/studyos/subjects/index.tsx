import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { useThemeStore } from '../../../../store/useThemeStore';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useStudySessionStore } from '../../../../store/studySessionStore';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LMS_COURSES_CACHE_KEY = 'lms_courses_cache';

export default function LmsCoursesScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { clearSession } = useStudySessionStore();

  const webViewRef = useRef<WebView>(null);
  const [scrapedCourses, setScrapedCourses] = useState<{fullname: string, shortname: string, id?: string}[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // True only when no cache exists
  const [isRefreshing, setIsRefreshing] = useState(false); // For pull-to-refresh
  const [isScraping, setIsScraping] = useState(false); // True when WebView is scraping in BG
  const [debugLog, setDebugLog] = useState<string[]>([]);

  // Load cached courses on mount — show instantly!
  useEffect(() => {
    AsyncStorage.getItem(LMS_COURSES_CACHE_KEY)
      .then(raw => {
        if (raw) {
          const cached = JSON.parse(raw);
          setScrapedCourses(cached);
          setIsLoading(false);
          setIsScraping(true); // Still scrape in background for fresh data
        } else {
          setIsScraping(true); // No cache — show loading and scrape
        }
      })
      .catch(() => {
        setIsScraping(true); // On error, just scrape fresh
      });
  }, []);

  const addDebug = (msg: string) => {
     setDebugLog(prev => [...prev, msg].slice(-10)); // Keep last 10 logs
  };

  const extractScript = `
    try {
      var url = window.location.href.toLowerCase();
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Current URL: ' + url }));
      
      if (url.includes('student.culko.in') && url.includes('login')) {
         window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Found ERP Login, session expired' }));
         window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COURSES_DATA', error: 'SESSION_EXPIRED' }));
      }
      else if (url.includes('lms.culko.in') && url.includes('login')) {
         window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Found LMS Login, redirecting to StudentHome' }));
         window.location.href = 'https://student.culko.in/StudentHome.aspx';
      } 
      else if (url.includes('studenthome.aspx')) {
         window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'On StudentHome, searching for LMS button...' }));
         
         var found = false;
         // 1. Search for 'a' tags first (safest and most reliable)
         var allA = document.querySelectorAll('a');
         for (var j = 0; j < allA.length; j++) {
            var txt = allA[j].innerText ? allA[j].innerText.toUpperCase() : '';
            var href = allA[j].href ? allA[j].href.toUpperCase() : '';
            if (txt.includes('CU-LMS') || txt.includes('MY LMS') || href.includes('LMS')) {
                if (allA[j].href) {
                   window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Navigating to A tag: ' + allA[j].href }));
                   window.location.href = allA[j].href;
                } else {
                   window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Clicking A tag without href' }));
                   allA[j].click();
                }
                found = true;
                break;
            }
         }
         
         // 2. Fallback to buttons or small divs/spans (length < 50 prevents clicking the whole page)
         if (!found) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'A tag not found. Checking small divs/buttons...' }));
            var els = document.querySelectorAll('button, div, span, li');
            // search backwards to find the innermost element first
            for (var i = els.length - 1; i >= 0; i--) {
               var txt = els[i].innerText ? els[i].innerText.toUpperCase().trim() : '';
               if ((txt.includes('CU-LMS') || txt.includes('MY LMS')) && txt.length < 50) {
                  var parentA = els[i].closest('a');
                  if (parentA && parentA.href) {
                     window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Found parent A: ' + parentA.href }));
                     window.location.href = parentA.href;
                  } else {
                     window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Calling .click() on ' + els[i].tagName }));
                     els[i].click();
                  }
                  found = true;
                  break;
               }
            }
         }
         
         if (!found) {
             window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'No LMS button found on StudentHome at all.' }));
             window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COURSES_DATA', error: 'SESSION_EXPIRED' }));
         }
      }
      else if (url.includes('lms.culko.in') && !url.includes('my/courses.php')) {
         window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'On LMS but not courses page, redirecting...' }));
         window.location.href = 'https://lms.culko.in/my/courses.php';
      }
      else if (url.includes('my/courses.php')) {
        function extractCourses() {
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Extracting courses...' }));
           var courses = [];
           var added = {};
           
           // Strategy 1: Find all course links explicitly (Moodle standard)
           var links = document.querySelectorAll('a[href*="course/view.php"]');
           for(var k=0; k<links.length; k++) {
               // Skip recently accessed courses or sidebar blocks so we don't get past semester subjects
               if (links[k].closest('[data-region="recentlyaccessedcourses"]') || 
                   links[k].closest('.block_recentlyaccessedcourses') ||
                   links[k].closest('aside') || 
                   links[k].closest('#block-region-side-pre')) {
                   continue;
               }
               
               var text = links[k].innerText.trim();
               if (text && text.length > 3 && !text.includes('Dashboard')) {
                   var href = links[k].href || '';
                   var idMatch = href.match(/id=(\\d+)/);
                   var courseId = idMatch ? idMatch[1] : '';
                   text = text.replace(/\\n/g, ' ').trim();
                   if (!added[text]) {
                      var shortname = text.includes('::') ? text.split('::')[0].trim() : 'COURSE';
                      courses.push({ fullname: text, shortname: shortname, id: courseId });
                      added[text] = true;
                   }
               }
           }
           
           // Strategy 2: Fallback to titles (Run this ALWAYS to ensure no missed courses)
           var titles = document.querySelectorAll('.card-title, .coursename, h4, h5, h6, .text-truncate, .multiline');
           for (var i = 0; i < titles.length; i++) {
              if (titles[i].closest('[data-region="recentlyaccessedcourses"]') || titles[i].closest('.block_recentlyaccessedcourses')) {
                  continue;
              }
              
              var text = titles[i].innerText.trim();
              if (text && text.length > 5 && text !== 'My Courses' && text !== 'Active Courses' && text !== 'Dashboard') {
                 var aTag = titles[i].closest('a');
                 var href = aTag ? (aTag.href || '') : '';
                 var idMatch = href.match(/id=(\\d+)/);
                 var courseId = idMatch ? idMatch[1] : '';
                 
                 text = text.replace(/\\n/g, ' ').trim();
                 if (!added[text]) {
                    var shortname = text.includes('::') ? text.split('::')[0].trim() : 'COURSE';
                    courses.push({ fullname: text, shortname: shortname, id: courseId });
                    added[text] = true;
                 }
              }
           }
           
           // If courses still 0, Moodle might be loading them via AJAX. Retry up to 5 times.
           if (courses.length === 0 && !window.__retryCount) window.__retryCount = 0;
           if (courses.length === 0 && window.__retryCount < 5) {
               window.__retryCount++;
               window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'AJAX loading... retry ' + window.__retryCount }));
               setTimeout(extractCourses, 1500); // wait 1.5 seconds and try again
               return;
           }
           
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Found ' + courses.length + ' courses' }));
           window.ReactNativeWebView.postMessage(JSON.stringify({
             type: 'COURSES_DATA',
             courses: courses
           }));
        }
        
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'On Courses page! Waiting for AJAX...' }));
        setTimeout(extractCourses, 1000);
      }
      else {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Unhandled URL: ' + url }));
      }
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'ERROR: ' + e.toString() }));
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'COURSES_DATA',
        error: e.toString()
      }));
    }
    true;
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'DEBUG_LOG') {
         addDebug(data.msg);
         console.log('[LMS WEBVIEW DEBUG]', data.msg);
      }
      else if (data.type === 'COURSES_DATA') {
        if (data.error === 'SESSION_EXPIRED') {
           if (!scrapedCourses) { // Only show error if there's no cached data
             setErrorMsg('SESSION_EXPIRED');
             setIsLoading(false);
           }
           setIsRefreshing(false);
           setIsScraping(false);
           return;
        }
        if (data.courses) {
           setScrapedCourses(data.courses);
           // Save to cache for next time
           AsyncStorage.setItem(LMS_COURSES_CACHE_KEY, JSON.stringify(data.courses)).catch(() => {});
        } else {
           if (!scrapedCourses) setScrapedCourses([]); // Don't clear existing cache
        }
        setIsLoading(false);
        setIsRefreshing(false);
        setIsScraping(false);
      }
    } catch (e) {}
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    addDebug('NavState: loading=' + navState.loading + ' url=' + navState.url);
    if (!navState.loading) {
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(extractScript);
      }, 2000); 
    }
  };

  const handleLogout = async () => {
    await clearSession();
    router.replace('/(app)' as any);
  };

  const mainCourses: any[] = [];
  const seenNames = new Set<string>();
  
  (scrapedCourses || []).forEach(course => {
     let rawFullname = course.fullname;
     
     // 1. Remove Moodle screen reader junk and extra spaces
     rawFullname = rawFullname.replace(/Course is starred/gi, '')
                              .replace(/Course name/gi, '')
                              .replace(/\\n/g, ' ')
                              .replace(/\\s+/g, ' ')
                              .trim();
                              
     // 2. Remove "Backup" prefix
     rawFullname = rawFullname.replace(/Backup\\s*/gi, '').trim();
     
     let cleanName = rawFullname;
     let code = course.shortname;
     
     if (rawFullname.includes('::')) {
        const parts = rawFullname.split('::');
        code = parts[0].trim();
        cleanName = parts.slice(1).join('::').trim(); 
     }
     
     // Remove code from the end of the name if Moodle appended it
     if (cleanName.includes(code) && code.length > 3) {
         cleanName = cleanName.replace(code, '').trim();
     }
     
     // Completely ignore any subject that has "ALL" or "OBJECT ORIENTED" or "OOPS"
     const upperFull = rawFullname.toUpperCase();
     if (upperFull.includes('ALL') || upperFull.includes('OBJECT ORIENTED') || upperFull.includes('OOPS')) {
        return; 
     }
     
     // Deduplicate by CODE to prevent the duplicate card issue
     // If code is somehow generic "COURSE", fallback to name
     const dedupeKey = (!code || code === 'COURSE') ? cleanName.toLowerCase() : code.toLowerCase();
     
     if (!seenNames.has(dedupeKey)) {
        seenNames.add(dedupeKey);
        const item = { fullname: cleanName, shortname: code, originalName: course.fullname, id: course.id };
        mainCourses.push(item);
     }
  });

  // Manually add the subjects provided by the user if the scraper missed them
  const manualSubjects = [
     { fullname: 'ENVIRONMENTAL STUDIES', shortname: 'CONT_25UCT-201', originalName: 'CONT_25UCT-201 :: ENVIRONMENTAL STUDIES', id: '22508' },
     { fullname: 'DISCRETE MATHEMATICS', shortname: 'CONT_25MTT-202', originalName: 'CONT_25MTT-202 :: DISCRETE MATHEMATICS', id: '22653' },
     { fullname: 'COMPUTER ORGANIZATION & ARCHITECTURE', shortname: 'CONT_25CST-208', originalName: 'CONT_25CST-208 :: COMPUTER ORGANIZATION & ARCHITECTURE', id: 'COA_ID' },
     { fullname: 'DATA STRUCTURES', shortname: 'CONT_25CSH-209', originalName: 'CONT_25CSH-209 :: DATA STRUCTURES', id: 'DS_ID' },
     { fullname: 'PYTHON PROGRAMMING', shortname: 'CONT_25CSH-214', originalName: 'CONT_25CSH-214 :: PYTHON PROGRAMMING', id: 'PY_ID' }
  ];

  manualSubjects.forEach(manualCourse => {
     const dedupeKey = manualCourse.shortname.toLowerCase();
     if (!seenNames.has(dedupeKey)) {
        seenNames.add(dedupeKey);
        mainCourses.push(manualCourse);
     }
  });

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              // Clear cache and force fresh scrape
              AsyncStorage.removeItem(LMS_COURSES_CACHE_KEY).catch(() => {});
              setIsScraping(true);
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.headerRow}>
           <View>
              <Text style={styles.header}>LMS Courses</Text>
              <Text style={styles.subheader}>Access your study materials from university.</Text>
           </View>
           <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* Subtle background sync spinner */}
              {isScraping && !isLoading && <ActivityIndicator size="small" color={colors.primary} />}
              
              <TouchableOpacity onPress={() => router.push('/studyos/assignments' as any)} style={[styles.iconCircle, { width: 40, height: 40 }]}>
                 <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
              </TouchableOpacity>

              <View style={[styles.iconCircle, { width: 40, height: 40 }]}>
                 <Ionicons name="book" size={20} color={colors.primary} />
              </View>
           </View>
        </View>

        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.textMuted, marginTop: Spacing.md, textAlign: 'center' }}>
               Connecting to LMS... Please wait, this may take a few seconds.
            </Text>
          </View>
        ) : errorMsg === 'SESSION_EXPIRED' ? (
          <View style={styles.centerBox}>
            <Ionicons name="cloud-offline-outline" size={48} color={colors.error} />
            <Text style={{ color: colors.error, marginTop: Spacing.md, textAlign: 'center' }}>
              Failed to connect to LMS. Your session has expired.
            </Text>
            <TouchableOpacity 
              style={{ marginTop: Spacing.xl, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 }}
              onPress={handleLogout}
            >
              <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold' }}>Logout & Re-connect</Text>
            </TouchableOpacity>
          </View>
        ) : mainCourses.length > 0 ? (
          <>
            {mainCourses.map((course, index) => (
              <TouchableOpacity 
                key={'main-'+index} 
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => router.push(`/studyos/subjects/${course.id || course.shortname}?name=${encodeURIComponent(course.fullname)}` as any)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardIconBox}>
                    <Ionicons name="book-outline" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.subjectName}>{course.fullname}</Text>
                    <Text style={styles.subjectCode}>{course.shortname}</Text>
                  </View>
                  
                  <TouchableOpacity 
                    style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, marginRight: 8, flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => router.push(`/studyos/subjects/chat/${course.shortname}?name=${encodeURIComponent(course.fullname)}` as any)}
                  >
                    <Ionicons name="sparkles" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>AI</Text>
                  </TouchableOpacity>
                  
                  <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
                </View>
              </TouchableOpacity>
            ))}

          </>
        ) : (
          <View style={styles.centerBox}>
            <Ionicons name="folder-open-outline" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: Spacing.md }}>
              No enrolled courses found on LMS.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Hidden WebView for scraping — only active when needed */}
      {isScraping && (
        <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute', left: -1000 }}>
           <WebView
             ref={webViewRef}
             source={{ uri: 'https://lms.culko.in/my/courses.php' }}
             onNavigationStateChange={handleNavigationStateChange}
             onMessage={handleMessage}
             javaScriptEnabled={true}
             domStorageEnabled={true}
             sharedCookiesEnabled={true}
           />
        </View>
      )}
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background, 
  },
  content: {
    padding: Spacing.lg,
    paddingTop: 60,
    paddingBottom: 100,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  header: {
    ...Typography.h1,
    color: colors.text,
    marginBottom: Spacing.xs,
  },
  subheader: {
    ...Typography.body,
    color: colors.textMuted,
    fontSize: 13,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  cardInfo: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  subjectName: {
    ...Typography.h3,
    color: colors.text,
    marginBottom: 4,
    fontSize: 15,
  },
  subjectCode: {
    ...Typography.small,
    color: colors.textMuted,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    padding: Spacing.xl,
  }
});
