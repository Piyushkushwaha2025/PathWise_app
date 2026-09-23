import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, TextInput, Platform, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { useThemeStore } from '../../../../store/useThemeStore';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useStudySessionStore } from '../../../../store/studySessionStore';
import { useStudyOSStore } from '../../../../store/studyosStore';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/clerk-expo';
import { fetchAssignments, useDBProfile } from '../../../../lib/db';
import { useSubscription } from '../../../../hooks/useSubscription';
import { usePaywallStore } from '../../../../store/usePaywallStore';
import { useAttendance } from '../../../../hooks/useAttendance';

const LMS_COURSES_CACHE_KEY = 'lms_courses_cache';

export default function LmsCoursesScreen() {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black' || theme === 'emerald';
  const styles = useStyles(colors);
  const router = useRouter();
  const { clearSession } = useStudySessionStore();
  const { userId } = useAuth();
  const { dbUser } = useDBProfile();
  const profile = useStudyOSStore((s) => s.profile);
  const erpSubjects = useStudyOSStore((s) => s.subjects) || [];
  const setLmsCourses = useStudyOSStore((s) => s.setLmsCourses);
  const { data: attendanceData } = useAttendance();
  const { isSubscriptionRequired } = useSubscription();
  const activeSection = dbUser?.section_code || profile?.section || null;
  const [pendingCount, setPendingCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'theory' | 'lab' | 'low'>('all');

  // AI Tutor Chat Choice Modal State
  const [selectedSubjectForChat, setSelectedSubjectForChat] = useState<any | null>(null);
  const [subjectChatSessions, setSubjectChatSessions] = useState<any[]>([]);
  const [showChatChoiceModal, setShowChatChoiceModal] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const handleOpenChatOptions = async (sub: any) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    if (isSubscriptionRequired) {
      usePaywallStore.getState().showPaywall("AI Tutor is a Pro feature. Upgrade to get instant answers and explanations for any subject.");
      return;
    }
    setSelectedSubjectForChat(sub);
    setIsLoadingSessions(true);
    setShowChatChoiceModal(true);

    try {
      const storageKey = `@chat_history_${sub.code}_${sub.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
          setSubjectChatSessions(parsed);
        } else {
          setSubjectChatSessions([]);
        }
      } else {
        setSubjectChatSessions([]);
      }
    } catch (e) {
      setSubjectChatSessions([]);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleStartNewChat = () => {
    if (!selectedSubjectForChat) return;
    setShowChatChoiceModal(false);
    router.push(`/studyos/subjects/chat/${encodeURIComponent(selectedSubjectForChat.code)}?name=${encodeURIComponent(selectedSubjectForChat.name)}&mode=new_chat` as any);
  };

  const handleOpenExistingSession = (sessionId: string) => {
    if (!selectedSubjectForChat) return;
    setShowChatChoiceModal(false);
    router.push(`/studyos/subjects/chat/${encodeURIComponent(selectedSubjectForChat.code)}?name=${encodeURIComponent(selectedSubjectForChat.name)}&sessionId=${encodeURIComponent(sessionId)}` as any);
  };

  useEffect(() => {
    if (userId) {
       fetchAssignments(userId, activeSection || undefined).then(data => {
          const pending = data.filter(a => a.status === 'pending').length;
          setPendingCount(pending);
       }).catch(e => console.log('Failed to fetch assignments:', e));
    }
  }, [userId, activeSection]);

  const webViewRef = useRef<WebView>(null);
  const accumulatedCoursesRef = useRef<any[]>([]);
  const [scrapedCourses, setScrapedCourses] = useState<{fullname: string, shortname: string, id?: string}[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // True only when no cache exists
  const [isRefreshing, setIsRefreshing] = useState(false); // For pull-to-refresh
  const [isScraping, setIsScraping] = useState(false); // True when WebView is scraping in BG
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [webViewUrl, setWebViewUrl] = useState('https://lms.culko.in/my/courses.php?paged=0');
  const [sourceType, setSourceType] = useState<'lms' | 'erp'>('lms');

  // Timeout Logic for dual-fallback
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isScraping) {
      timer = setTimeout(() => {
        if (sourceType === 'lms') {
           setSourceType('erp');
           setWebViewUrl('https://student.culko.in/frmMyCourse.aspx');
           addDebug('LMS timeout, falling back to ERP...');
        } else {
           if (!scrapedCourses || scrapedCourses.length === 0) {
             setErrorMsg('SESSION_EXPIRED');
           }
           setIsLoading(false);
           setIsScraping(false);
           setIsRefreshing(false);
        }
      }, 35000); // 35 seconds timeout (LMS pages load slowly)
    }
    return () => clearTimeout(timer);
  }, [isScraping, sourceType]);

  // Load cached courses on mount — show instantly!
  useEffect(() => {
    AsyncStorage.getItem(LMS_COURSES_CACHE_KEY)
      .then(raw => {
        accumulatedCoursesRef.current = [];
        setWebViewUrl('https://lms.culko.in/my/courses.php?paged=0');
        if (raw) {
          const cached = JSON.parse(raw);
          setScrapedCourses(cached);
          setLmsCourses(cached); // Hydrate global store from cache immediately
          setIsLoading(false);
          // Only scrape manually via Pull-To-Refresh once loaded!
          setIsScraping(false); 
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
    (function checkReady() {
      if (!window.ReactNativeWebView) {
        setTimeout(checkReady, 500);
        return;
      }
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
              var txt = allA[j].innerText ? allA[j].innerText.toUpperCase().trim() : '';
              var href = allA[j].href ? allA[j].href.toUpperCase() : '';
              
              // Only match strict button names to avoid clicking random ERP menus
              if (txt === 'CU-LMS' || txt === 'MY LMS' || txt === 'LMS' || txt === 'CU LMS') {
                  if (allA[j].href && !allA[j].href.toLowerCase().startsWith('javascript:')) {
                     window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Navigating to strict A tag: ' + allA[j].href }));
                     window.location.href = allA[j].href;
                  } else {
                     window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Clicking strict A tag (javascript or no href) - Text: ' + txt }));
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
                 if (txt === 'CU-LMS' || txt === 'MY LMS' || txt === 'LMS' || txt === 'CU LMS') {
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
               window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'No LMS button found on StudentHome at all. Falling back to ERP.' }));
               window.location.href = 'https://student.culko.in/frmmycourse.aspx';
           }
        }
        else if (url.includes('frmmycourse.aspx')) {
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Extracting ERP courses...' }));
           var courses = [];
           var added = {};
           var rows = document.querySelectorAll('table tr');
           for (var i = 1; i < rows.length; i++) {
               var cells = rows[i].querySelectorAll('td, th');
               var code = '';
               var name = '';
               
               for (var c = 0; c < cells.length; c++) {
                   var text = cells[c].innerText.trim();
                   // A real university course code usually has letters, numbers, and no spaces (e.g. 21CSH-214)
                   if (text.length >= 4 && text.length <= 25 && /[a-zA-Z]/.test(text) && /[0-9]/.test(text) && !text.includes(' ') && !text.includes('\\n')) {
                       code = text;
                       if (c + 1 < cells.length) {
                           name = cells[c+1].innerText.trim();
                       }
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
           } else {
               window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'No courses found in ERP table' }));
               window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COURSES_DATA', courses: [] }));
           }
        }
        else if (url.includes('lms.culko.in') && !url.includes('my/courses.php')) {
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'On LMS but not courses page, redirecting...' }));
           window.location.href = 'https://lms.culko.in/my/courses.php?paged=0';
        }
        else if (url.includes('my/courses.php')) {
           function extractPageCourses() {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Extracting courses on ' + window.location.href }));
              var courses = [];
              var added = {};

              // Determine current page index from URL FIRST (used by merge-retry below)
              var matchPage = window.location.href.match(/paged=(\\d+)/i) || window.location.href.match(/page=(\\d+)/i);
              var currentPage = matchPage ? parseInt(matchPage[1], 10) : 0;
              
              // Strategy 1: Find all course links explicitly (Moodle standard)
              var links = document.querySelectorAll('a[href*="course/view.php"]');
              for(var k=0; k<links.length; k++) {
                  if (links[k].closest('[data-region="recentlyaccessedcourses"]') || 
                      links[k].closest('.block_recentlyaccessedcourses') ||
                      links[k].closest('aside') || 
                      links[k].closest('#block-region-side-pre')) {
                      continue;
                  }
                  
                  var text = links[k].innerText ? links[k].innerText.trim() : '';
                  if (text && text.length > 3 && !text.includes('Dashboard')) {
                       var href = links[k].href || '';
                       var idMatch = href.match(/id=(\d+)/);
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
               
               // Strategy 2: Fallback to titles — but ONLY real course cards.
               // Require either a course/view.php href (real Moodle course card) OR a
               // core subject code in the text. This drops UI labels ("My Courses",
               // "Active Courses", banners) that are not actual subjects.
               var titles = document.querySelectorAll('.card-title, .coursename, h4, h5, h6, .text-truncate, .multiline');
               for (var i = 0; i < titles.length; i++) {
                  if (titles[i].closest('[data-region="recentlyaccessedcourses"]') || titles[i].closest('.block_recentlyaccessedcourses')) {
                      continue;
                  }
                 
                  var text = titles[i].innerText ? titles[i].innerText.trim() : '';
                  if (!text || text.length < 4) continue;
                  if (text === 'My Courses' || text === 'Active Courses' || text === 'Dashboard' || text === 'Course Categories' || text.startsWith('Search')) continue;

                  var aTag = titles[i].closest('a');
                  if (!aTag) {
                      var card = titles[i].closest('.card, .coursebox, .course');
                      if (card) {
                          aTag = card.querySelector('a[href*="course/view.php"]');
                      }
                  }
                  
                  var href = aTag ? (aTag.href || '') : '';
                  var idMatch = href.match(/id=(\d+)/);
                  var courseId = idMatch ? idMatch[1] : '';
                  // Must be a genuine course link OR contain a subject code (e.g. 25CSH211)
                  var hasCourseLink = /course\/view\.php\?id=\d+/.test(href);
                  var hasSubjectCode = /[0-9]{2}[A-Z]{2,6}[-_]?[0-9]{2,4}/i.test(text);
                  // Accept any title inside a course anchor (<a>), or one carrying a subject code.
                  if (!aTag && !hasSubjectCode) continue;

                  text = text.replace(/\n/g, ' ').trim();
                  var uniqueKey = text + "_" + courseId;
                  if (!added[uniqueKey]) {
                     var shortname = text.includes('::') ? text.split('::')[0].trim() : 'COURSE';
                     courses.push({ fullname: text, shortname: shortname, id: courseId });
                     added[uniqueKey] = true;
                  }
               }
              
              // Some courses (e.g. paged=1 late loads) appear only after AJAX.
              // Merge-retry: if this attempt added NEW courses vs the last snapshot,
              // wait briefly and re-scan so late-loading subjects are captured too.
              if (!window.__retryCount) window.__retryCount = 0;
              if (!window.__pageMerged) window.__pageMerged = {};
              var prevSig = (window.__pageMerged[currentPage] || []).join('|');
              var curSig = courses.map(function(c){return (c.id||'')+'_'+c.fullname;}).join('|');
              if (window.__retryCount < 2 && curSig !== prevSig) {
                  window.__retryCount++;
                  window.__pageMerged[currentPage] = courses.map(function(c){return (c.id||'')+'_'+c.fullname;});
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'More courses still loading (page ' + currentPage + ')... retry ' + window.__retryCount }));
                  setTimeout(extractPageCourses, 500);
                  return;
              }

              // Check if there is another page to scrape
              var nextPageIndex = currentPage + 1;
              var nextLink = document.querySelector('a[href*="paged=' + nextPageIndex + '"], a[href*="page=' + nextPageIndex + '"]');
              var hasNextPage = false;
              
              // Crawl exactly the two enrolled-course pages: paged=0 then paged=1, then stop.
              var hasNextPage = (currentPage === 0);

              var nextPageUrl = 'https://lms.culko.in/my/courses.php?paged=' + nextPageIndex;

              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Scraped Page ' + currentPage + ' (' + courses.length + ' courses). Has next: ' + hasNextPage }));
              window.ReactNativeWebView.postMessage(JSON.stringify({
                 type: 'COURSES_DATA',
                 courses: courses,
                 currentPage: currentPage,
                 hasNextPage: hasNextPage,
                 nextPageUrl: nextPageUrl
              }));
           }
           
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'On Courses page! Waiting for live DOM...' }));
           setTimeout(extractPageCourses, 400);
        }
        else {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'Unhandled URL: ' + url }));
        }
      } catch(e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG_LOG', msg: 'ERROR: ' + e.toString() }));
        }
      }
    })();
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
           // Merge courses into accumulated ref across page navigations!
            if (!accumulatedCoursesRef.current) {
               accumulatedCoursesRef.current = [];
            }
           
           const courseMap = new Map<string, any>();
           const keyOf = (c: any) => {
             const m = `${c.shortname || ''} ${c.fullname || ''}`.match(/[0-9]{2}[A-Z]{2,6}[-_]?[0-9]{2,4}/i);
             const core = m ? m[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() : null;
             return core || (c.id || c.shortname || c.fullname || '');
           };
           accumulatedCoursesRef.current.forEach(c => courseMap.set(keyOf(c), c));
           data.courses.forEach((c: any) => courseMap.set(keyOf(c), c));
           const mergedCourses = Array.from(courseMap.values());
           accumulatedCoursesRef.current = mergedCourses;

           setScrapedCourses(mergedCourses);
           setLmsCourses(mergedCourses); // Push to global store → Grade Center reads instantly
           // Save to cache for next time
           AsyncStorage.setItem(LMS_COURSES_CACHE_KEY, JSON.stringify(mergedCourses)).catch(() => {});
        } else {
           // No courses from this scrape pass. Only blank out if we have NO cached
           // data at all — otherwise keep showing previously synced subjects.
           if (!scrapedCourses || scrapedCourses.length === 0) setScrapedCourses([]);
        }
        setIsLoading(false);

        // If there is a next page, command the PERSISTENT WebView to load it directly!
        // NOTE: do NOT setWebViewUrl() here — changing `source` reloads the WebView and
        // resets the RN bridge mid-scrape, which drops in-flight COURSES_DATA and triggers
        // the "Servers Unreachable" (SESSION_EXPIRED) error. Navigate via injectJavaScript only.
        if (data.hasNextPage && data.nextPageUrl && data.currentPage < 6) {
           addDebug(`Moving to scrap next page: ${data.nextPageUrl}`);
           webViewRef.current?.injectJavaScript(`window.location.href = '${data.nextPageUrl}'; true;`);
           // Keep isScraping true so WebView stays alive and loads deeper pages!
        } else {
           addDebug('All Moodle pages scraped successfully!');
           setIsRefreshing(false);
           setIsScraping(false);
        }
      }
    } catch (e) {}
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    addDebug('NavState: loading=' + navState.loading + ' url=' + navState.url);
    if (!navState.loading) {
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(extractScript);
      }, 800); 
    }
  };

  const handleLogout = async () => {
    await clearSession(true);
    router.replace('/(app)' as any);
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
        .filter(w => w.length >= 3);
     return Array.from(new Set(words));
  };

  // ── 2. Build Verification Targets from official ERP records (UIMS Subjects & Attendance) ──
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

     const exists = erpTargets.some(t => {
        if (cleanCode && t.code && cleanCode === t.code) return true;
        if (t.words.length > 0 && words.length > 0) {
           const matches = words.filter(w => t.words.some(tw => tw.startsWith(w.slice(0, 4)) || w.startsWith(tw.slice(0, 4))));
           if (matches.length >= Math.min(words.length, t.words.length, 2)) return true;
        }
        return false;
     });

     if (!exists) {
        erpTargets.push({
           key: cleanCode || words.join('_'),
           code: cleanCode,
           words,
           originalTitle: name,
           matchedCourses: []
        });
     }
  };

  if (Array.isArray(erpSubjects)) {
     erpSubjects.forEach((s: any) => addTarget(s.code, s.name));
  }
  if (Array.isArray(attendanceData)) {
     attendanceData.forEach((a: any) => addTarget(null, a.subjectName));
  }

  // ── 3. Filter and Match Moodle Courses against ERP Targets ──
  const validLmsCourses = (Array.isArray(scrapedCourses) ? scrapedCourses : []).filter(c => {
     if (!c || !c.fullname) return false;
     if (c.fullname.includes('(ERP)')) return false;
     return true;
  });

  // ALL-suffix courses (e.g. "25CSH-211_25BCS-3_ALL") are the aggregate Moodle
  // grade/marks links — they belong ONLY in the LMS Grades & Marks tab, never in
  // the LMS classroom/AI tab. Detect them so we can drop them from this list.
  // Also catches the single-"A" aggregate variant some soft-skill courses use
  // instead of ALL (e.g. "25CSH-211_25BCS-3_A", "SOFT SKILL A", "(A)").
  const isAllCourse = (course: any) => {
     const txt = `${course.shortname || ''} ${course.fullname || ''}`.toUpperCase();
     if (/\bALL\b|[-_]ALL|ALL[-_]|_ALL|ALL_|(\(ALL\))/i.test(txt)) return true;
     return false;
  };

  // ── Active Section Priority Elimination ──
  // Distinguish active classroom streams (CONT_, THEORY, LAB, TUT) from general university broadcasts/shell courses
  const isActiveSection = (course: any) => {
     const txt = `${course.shortname || ''} ${course.fullname || ''}`.toUpperCase();
     if (isAllCourse(course)) return false; // ALL courses are grades-only, excluded here
     return txt.includes('CONT_') || txt.includes('THEORY') || txt.includes('LAB') || txt.includes('TUT') || txt.includes('SEC_');
  };

  const activeCourses = validLmsCourses.filter(c => isActiveSection(c));
  // Exclude ALL courses entirely from the LMS tab — they are grades-only (handled by grades/index.tsx).
  const generalOrAllCourses = validLmsCourses.filter(c => !isActiveSection(c) && !isAllCourse(c));

  // Destroy ANY general or ALL shell course whose subject matches an active classroom stream!
  const survivingGeneralCourses = generalOrAllCourses.filter(generalCourse => {
     const genWords = getMeaningfulWords(generalCourse.fullname);
     const genCode = getCoreCode(generalCourse.shortname || generalCourse.fullname);

     const hasActiveAlternative = activeCourses.some(actCourse => {
        const actWords = getMeaningfulWords(actCourse.fullname);
        const actCode = getCoreCode(actCourse.shortname || actCourse.fullname);

        // 1. Match by Core Subject Code (e.g. 25DCP211, 25MTT202, 25UCT201)
        if (genCode && actCode && genCode === actCode) return true;

        // 2. Match by Subject Topic Keywords (e.g. "soft", "skills", "discrete", "mathematics", "environmental", "studies")
        if (genWords.length > 0 && actWords.length > 0) {
           const shared = genWords.filter(gw => actWords.some(aw => aw.startsWith(gw.slice(0, 4)) || gw.startsWith(aw.slice(0, 4))));
           if (shared.length >= 2) return true; // Require 2+ shared keywords so distinct subjects are NOT deleted
        }
        return false;
     });

     return !hasActiveAlternative; // Survive ONLY if zero active section alternatives exist!
  });

  const refinedLmsCourses = [...activeCourses, ...survivingGeneralCourses];

  // De-duplicate by core subject code so a subject that appears as both a
  // CONT_/THEORY stream and a generic shell is not shown twice.
  const seenCoreCodes = new Set<string>();
  const dedupedLmsCourses: any[] = [];
  for (const c of refinedLmsCourses) {
    const code = getCoreCode(c.shortname || c.fullname) || (c.fullname || '').trim();
    const key = code || (c.fullname || '').trim();
    if (seenCoreCodes.has(key)) continue;
    seenCoreCodes.add(key);
    dedupedLmsCourses.push(c);
  }

  const mainCourses: any[] = [];

  // Show EVERY enrolled non-aggregate LMS course (ALL/A-suffix grade links excluded).
  // Each course keeps its REAL Moodle course id so tapping opens the correct link.
  // ERP data is used ONLY to clean up the displayed name/code — never to hide a
  // subject the user is actually enrolled in.
  dedupedLmsCourses.forEach((c: any) => {
    if (!c || !c.fullname) return;
    let rawFullname = (c.fullname || '').replace(/Course is starred|Course name|Backup\s*/gi, '').replace(/\n|\s+/g, ' ').trim();
    let code = c.shortname || '';
    let cleanName = rawFullname.includes('::') ? rawFullname.split('::')[1].trim() : rawFullname;

    cleanName = cleanName.replace(/[-_([ ]*ALL[-_)\] ]*/gi, ' ').replace(/\s+/g, ' ').trim();
    code = code.replace(/[-_([ ]*ALL[-_)\] ]*/gi, '').replace(/[_-]+$/, '').replace(/^[_-]+/, '').trim();

    // Optional ERP enhancement: use the official subject name/code when this
    // course maps to an ERP record. Drops the course if it doesn't match an ERP subject!
    const cCode = getCoreCode(c.shortname || c.fullname);
    const erpMatch = erpTargets.find((t: any) => {
      if (cCode && t.code && cCode === t.code) return true;
      const cWords = getMeaningfulWords(c.fullname);
      if (cWords.length > 0 && t.words.length > 0) {
        const shared = cWords.filter((cw: string) => t.words.some((tw: string) => tw.startsWith(cw.slice(0, 4)) || cw.startsWith(tw.slice(0, 4))));
        if (t.words.length === 1 && shared.length === 1) return true;
        if (t.words.length >= 2 && shared.length >= 2) return true;
      }
      return false;
    });
    if (erpMatch) {
      if (erpMatch.originalTitle && erpMatch.originalTitle.length >= 2) cleanName = erpMatch.originalTitle;
      if (erpMatch.code) code = erpMatch.code.toUpperCase();
    } else if (erpTargets.length > 0) {
      // If ERP data exists but this LMS course didn't match any ERP subject, skip it!
      return;
    }

    if (cleanName.length >= 2) {
      mainCourses.push({ fullname: cleanName, shortname: code, originalName: c.fullname, id: c.id });
    }
  });

  // ── Helpers for Subject Attendance & Match Logic ──
  const getSubjectAttendance = (sub: any) => {
    const subCore = getCoreCode(sub.code || sub.name);
    const subWords = getMeaningfulWords(sub.name);

    if (Array.isArray(attendanceData) && attendanceData.length > 0) {
      const matched = attendanceData.find(a => {
        const aCore = getCoreCode(a.subjectName);
        if (subCore && aCore && subCore === aCore) return true;
        const aWords = getMeaningfulWords(a.subjectName);
        const shared = aWords.filter((w: string) => subWords.includes(w));
        return shared.length >= 2;
      });

      if (matched) {
        return {
          percentage: Math.round(matched.percentage),
          attended: matched.attendedClasses,
          total: matched.totalClasses,
        };
      }
    }

    if (sub.attendancePercentage !== undefined && sub.attendancePercentage !== null) {
      return {
        percentage: Math.round(sub.attendancePercentage),
        attended: sub.attendedClasses ?? 0,
        total: sub.totalClasses ?? 0,
      };
    }

    return null;
  };

  const getAttendanceAdvice = (attended: number, total: number, percentage: number) => {
    if (total === 0) return null;
    if (percentage >= 75) {
      const canSkip = Math.floor((attended - 0.75 * total) / 0.75);
      if (canSkip > 0) {
        return { text: `Can skip ${canSkip} lecture${canSkip > 1 ? 's' : ''}`, type: 'safe' as const };
      }
      return { text: 'On margin (75%)', type: 'warning' as const };
    } else {
      const need = Math.ceil((0.75 * total - attended) / 0.25);
      return { text: `Need ${Math.max(1, need)} lecture${need > 1 ? 's' : ''}`, type: 'danger' as const };
    }
  };

  const getMatchedMoodleCourse = (sub: any) => {
    const coursesToSearch = scrapedCourses || mainCourses || [];
    if (!coursesToSearch.length) return null;

    const subCore = getCoreCode(sub.code || sub.name);
    const subWords = getMeaningfulWords(sub.name);

    const matched = coursesToSearch.find(c => {
      if (!c || !c.id) return false;
      const cCore = getCoreCode(c.shortname || c.fullname);
      if (subCore && cCore && subCore === cCore) return true;
      const cWords = getMeaningfulWords(c.fullname);
      const shared = cWords.filter((w: string) => subWords.includes(w));
      return shared.length >= 2;
    });

    return matched || null;
  };

  const overallAttendance = useMemo(() => {
    if (!attendanceData || attendanceData.length === 0) {
      if (erpSubjects && erpSubjects.length > 0) {
        let totAttended = 0;
        let totClasses = 0;
        erpSubjects.forEach(s => {
          totAttended += s.attendedClasses || 0;
          totClasses += s.totalClasses || 0;
        });
        if (totClasses > 0) return Math.round((totAttended / totClasses) * 100);
      }
      return null;
    }
    let totalAttended = 0;
    let totalLectures = 0;
    attendanceData.forEach(a => {
      totalAttended += a.attendedClasses || 0;
      totalLectures += a.totalClasses || 0;
    });
    if (totalLectures === 0) return null;
    return Math.round((totalAttended / totalLectures) * 100);
  }, [attendanceData, erpSubjects]);

  const filteredSubjects = useMemo(() => {
    return erpSubjects.filter((sub) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (sub.name || '').toLowerCase().includes(q);
        const codeMatch = (sub.code || '').toLowerCase().includes(q);
        if (!nameMatch && !codeMatch) return false;
      }

      const isLab = /lab|practical|workshop/i.test(sub.name || '') || /lab|practical/i.test(sub.code || '');
      if (selectedFilter === 'theory' && isLab) return false;
      if (selectedFilter === 'lab' && !isLab) return false;

      if (selectedFilter === 'low') {
        const att = getSubjectAttendance(sub);
        if (!att || att.percentage >= 75) return false;
      }

      return true;
    });
  }, [erpSubjects, searchQuery, selectedFilter, attendanceData]);

  const theoryCount = useMemo(() => {
    return erpSubjects.filter(sub => !(/lab|practical|workshop/i.test(sub.name || '') || /lab|practical/i.test(sub.code || ''))).length;
  }, [erpSubjects]);

  const labCount = useMemo(() => {
    return erpSubjects.filter(sub => /lab|practical|workshop/i.test(sub.name || '') || /lab|practical/i.test(sub.code || '')).length;
  }, [erpSubjects]);

  const lowAttendanceCount = useMemo(() => {
    return erpSubjects.filter(sub => {
      const att = getSubjectAttendance(sub);
      return att && att.percentage < 75;
    }).length;
  }, [erpSubjects, attendanceData]);

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
              accumulatedCoursesRef.current = [];
              setWebViewUrl('https://lms.culko.in/my/courses.php?paged=0');
              setIsScraping(true);
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Modern Ambient Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <Ionicons name="sparkles" size={13} color={colors.primary} />
              <Text style={[styles.headerCategory, { color: colors.primary }]}>ACADEMIC LMS & SYLLABUS</Text>
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>Subjects & LMS</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity 
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                router.push('/studyos/assignments' as any);
              }} 
              style={styles.headerPillBtn}
              activeOpacity={0.75}
            >
              <Ionicons name="reader" size={14} color={colors.primary} />
              <Text style={[styles.headerPillText, { color: colors.primary }]}>Assignments</Text>
              {pendingCount > 0 && (
                <View style={[styles.badgeCounter, { backgroundColor: colors.warning || '#f59e0b' }]}>
                  <Text style={styles.badgeCounterText}>{pendingCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                try { Haptics.selectionAsync(); } catch {}
                router.push('/studyos/grades' as any);
              }}
              style={styles.headerPillBtn}
              activeOpacity={0.75}
            >
              <Ionicons name="stats-chart" size={14} color={colors.accent || '#8b5cf6'} />
              <Text style={[styles.headerPillText, { color: colors.accent || '#8b5cf6' }]}>Grades</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Overview Hero Console Card */}
        <View style={styles.heroCardWrapper}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.02)']
                : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.85)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.heroCard,
              {
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                borderTopColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.95)',
              }
            ]}
          >
            <View style={styles.heroTopRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.liveDot, { backgroundColor: isScraping ? colors.warning : '#22c55e' }]} />
                <Text style={[styles.heroSubtext, { color: colors.textMuted }]}>
                  {isScraping ? 'Syncing Courses...' : 'All Courses Synced'}
                </Text>
              </View>
              {activeSection && (
                <View style={[styles.sectionBadge, { backgroundColor: colors.primary + '18' }]}>
                  <Text style={[styles.sectionBadgeText, { color: colors.primary }]}>{activeSection}</Text>
                </View>
              )}
            </View>

            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatItem}>
                <Text style={[styles.heroStatValue, { color: colors.text }]}>{erpSubjects.length}</Text>
                <Text style={[styles.heroStatLabel, { color: colors.textMuted }]}>Enrolled Courses</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={[
                  styles.heroStatValue, 
                  { color: overallAttendance !== null ? (overallAttendance >= 75 ? '#22c55e' : (colors.warning || '#f59e0b')) : colors.text }
                ]}>
                  {overallAttendance !== null ? `${overallAttendance}%` : '--'}
                </Text>
                <Text style={[styles.heroStatLabel, { color: colors.textMuted }]}>Avg Attendance</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={[styles.heroStatValue, { color: pendingCount > 0 ? (colors.warning || '#f59e0b') : colors.text }]}>
                  {pendingCount}
                </Text>
                <Text style={[styles.heroStatLabel, { color: colors.textMuted }]}>Pending Tasks</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Snap & Solve Photo Doubt Banner */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
            if (isSubscriptionRequired) {
              usePaywallStore.getState().showPaywall("Photo-Based Doubt Solving is a Pro feature. Upgrade to snap and solve any question instantly.");
              return;
            }
            router.push(`/studyos/subjects/chat/SNAP_SOLVE_DOUBTS?name=${encodeURIComponent('Snap & Solve (AI Vision)')}&mode=doubt_solver` as any);
          }}
          style={{
            marginHorizontal: 16,
            marginTop: 14,
            marginBottom: 4,
            borderRadius: 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: colors.primary + '40',
            backgroundColor: isDark ? '#111116' : colors.surface,
          }}
        >
          <LinearGradient
            colors={[colors.primary + '18', (colors.accent || colors.primary) + '10']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="camera" size={22} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text }}>Snap & Solve Doubt</Text>
                <View style={{ backgroundColor: colors.primary + '25', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.primary, textTransform: 'uppercase' }}>AI Vision</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 2 }}>
                Take a photo of any question or math problem for instant step-by-step solutions
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </LinearGradient>
        </TouchableOpacity>

        {/* Search & Filter Strip */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchBar, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
            <Ionicons name="search" size={16} color={colors.textDim} style={{ marginLeft: 12, marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search subject or code..."
              placeholderTextColor={colors.textDim}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 6, marginRight: 6 }}>
                <Ionicons name="close-circle" size={16} color={colors.textDim} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
          <TouchableOpacity
            onPress={() => { try { Haptics.selectionAsync(); } catch {}; setSelectedFilter('all'); }}
            style={[styles.filterChip, selectedFilter === 'all' && [styles.filterChipActive, { backgroundColor: colors.primary }]]}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, selectedFilter === 'all' && styles.filterChipTextActive]}>
              All ({erpSubjects.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { try { Haptics.selectionAsync(); } catch {}; setSelectedFilter('theory'); }}
            style={[styles.filterChip, selectedFilter === 'theory' && [styles.filterChipActive, { backgroundColor: colors.primary }]]}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, selectedFilter === 'theory' && styles.filterChipTextActive]}>
              Theory ({theoryCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { try { Haptics.selectionAsync(); } catch {}; setSelectedFilter('lab'); }}
            style={[styles.filterChip, selectedFilter === 'lab' && [styles.filterChipActive, { backgroundColor: colors.primary }]]}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, selectedFilter === 'lab' && styles.filterChipTextActive]}>
              Labs ({labCount})
            </Text>
          </TouchableOpacity>

          {lowAttendanceCount > 0 && (
            <TouchableOpacity
              onPress={() => { try { Haptics.selectionAsync(); } catch {}; setSelectedFilter('low'); }}
              style={[styles.filterChip, selectedFilter === 'low' && [styles.filterChipActive, { backgroundColor: '#ef4444' }]]}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, selectedFilter === 'low' && styles.filterChipTextActive]}>
                Low Attendance ({lowAttendanceCount})
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Subjects List */}
        {erpSubjects.length > 0 ? (
          filteredSubjects.length > 0 ? (
            filteredSubjects.map((sub, index) => {
              const isLab = /lab|practical|workshop/i.test(sub.name || '') || /lab|practical/i.test(sub.code || '');
              const att = getSubjectAttendance(sub);
              const advice = att ? getAttendanceAdvice(att.attended, att.total, att.percentage) : null;
              const matchedLms = getMatchedMoodleCourse(sub);

              const isSafe = att ? att.percentage >= 75 : true;
              const attColor = att ? (isSafe ? '#22c55e' : (colors.warning || '#f59e0b')) : colors.textMuted;

              return (
                <View key={'sub-' + index} style={styles.cardWrapper}>
                  <LinearGradient
                    colors={
                      isDark
                        ? ['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.015)']
                        : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.88)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.card,
                      {
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)',
                        borderTopColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.95)',
                      }
                    ]}
                  >
                    {/* Top Meta Row */}
                    <View style={styles.cardTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <View style={[styles.cardIconBox, { backgroundColor: isLab ? '#06b6d418' : colors.primary + '18' }]}>
                          <Ionicons
                            name={isLab ? 'flask-outline' : 'book-outline'}
                            size={16}
                            color={isLab ? '#06b6d4' : colors.primary}
                          />
                        </View>
                        <View style={styles.codePill}>
                          <Text style={styles.codePillText} numberOfLines={1}>{sub.code}</Text>
                        </View>
                        {sub.credits ? (
                          <View style={styles.creditPill}>
                            <Text style={styles.creditPillText}>{sub.credits} Cr</Text>
                          </View>
                        ) : null}
                      </View>

                      {/* Attendance Indicator */}
                      {att && (
                        <View style={[styles.attendancePill, { backgroundColor: isSafe ? '#22c55e18' : '#ef444418' }]}>
                          <Ionicons
                            name={isSafe ? 'checkmark-circle' : 'alert-circle'}
                            size={13}
                            color={isSafe ? '#22c55e' : '#ef4444'}
                          />
                          <Text style={[styles.attendancePillText, { color: isSafe ? '#22c55e' : '#ef4444' }]}>
                            {att.percentage}%
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Subject Name */}
                    <Text style={[styles.subjectTitle, { color: colors.text }]}>
                      {sub.name}
                    </Text>

                    {/* Attendance Progress & Advice Bar */}
                    {att && (
                      <View style={styles.attendanceBarContainer}>
                        <View style={styles.attendanceBarBg}>
                          <View
                            style={[
                              styles.attendanceBarFill,
                              { width: `${Math.min(100, Math.max(0, att.percentage))}%`, backgroundColor: attColor }
                            ]}
                          />
                        </View>
                        {advice && (
                          <Text style={[
                            styles.adviceText,
                            { color: advice.type === 'safe' ? '#22c55e' : (advice.type === 'warning' ? (colors.warning || '#f59e0b' ) : '#ef4444') }
                          ]}>
                            {advice.text}
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Action Buttons Row */}
                    <View style={styles.cardActionsRow}>
                      {/* AI Tutor Button */}
                      <TouchableOpacity
                        style={styles.aiTutorBtn}
                        activeOpacity={0.8}
                        onPress={() => {
                          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                          if (isSubscriptionRequired) {
                            usePaywallStore.getState().showPaywall("AI Tutor is a Pro feature. Upgrade to get instant answers and explanations for any subject.");
                            return;
                          }
                          router.push(`/studyos/subjects/chat/${encodeURIComponent(sub.code)}?name=${encodeURIComponent(sub.name)}&mode=latest` as any);
                        }}
                      >
                        <LinearGradient
                          colors={[colors.primary, colors.accent || '#8b5cf6']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.aiTutorGradient}
                        >
                          <Ionicons name="sparkles" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                          <Text style={styles.aiTutorText}>Ask AI Tutor</Text>
                        </LinearGradient>
                      </TouchableOpacity>

                      {/* Start Chat Button (Next to AI Tutor) */}
                      <TouchableOpacity
                        style={[styles.lmsContentBtn, { borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }]}
                        activeOpacity={0.75}
                        onPress={() => handleOpenChatOptions(sub)}
                      >
                        <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.primary} style={{ marginRight: 5 }} />
                        <Text style={[styles.lmsContentBtnText, { color: colors.text }]}>Start Chat</Text>
                      </TouchableOpacity>
                    </View>
                  </LinearGradient>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={42} color={colors.textDim} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No subjects found</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Try changing your search term or filter selection
              </Text>
              <TouchableOpacity
                style={[styles.emptyResetBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '35' }]}
                onPress={() => {
                  setSearchQuery('');
                  setSelectedFilter('all');
                }}
              >
                <Text style={[styles.emptyResetBtnText, { color: colors.primary }]}>Reset Filter</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          <View style={{ gap: 12, marginTop: 8 }}>
            {[1, 2, 3, 4].map((i) => (
              <View
                key={i}
                style={[
                  styles.skeletonCard,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  }
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <View style={[styles.skeletonCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
                  <View style={[styles.skeletonPill, { width: 90, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
                </View>
                <View style={[styles.skeletonLine, { width: '80%', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
                <View style={[styles.skeletonLine, { width: '50%', marginTop: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Hidden WebView for scraping — only active when needed */}
      {isScraping && (
        <View style={{ width: 2, height: 2, opacity: 0, overflow: 'hidden' }}>
           <WebView
             key="lms-scraper"
             ref={webViewRef}
             source={{ uri: webViewUrl }}
             onNavigationStateChange={handleNavigationStateChange}
             onMessage={handleMessage}
             javaScriptEnabled={true}
             domStorageEnabled={true}
             sharedCookiesEnabled={true}
           />
        </View>
      )}
    
      {/* Start Chat / Session Picker Modal */}
      <Modal
        visible={showChatChoiceModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowChatChoiceModal(false)}
      >
        <TouchableOpacity 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }} 
          activeOpacity={1} 
          onPress={() => setShowChatChoiceModal(false)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={{
              backgroundColor: isDark ? '#14141c' : '#ffffff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 36,
              maxHeight: '80%',
              borderTopWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.2,
              shadowRadius: 10,
              elevation: 8,
            }}
          >
            {/* Drag handle */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', alignSelf: 'center', marginBottom: 16 }} />

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <View style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'SpaceGrotesk_700Bold', color: colors.primary }}>
                      {selectedSubjectForChat?.code || 'SUBJECT'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.textMuted }}>Choose Session</Text>
                </View>
                <Text style={{ fontSize: 17, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text }} numberOfLines={1}>
                  {selectedSubjectForChat?.name || 'AI Tutor Chats'}
                </Text>
              </View>
              <TouchableOpacity 
                onPress={() => setShowChatChoiceModal(false)}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' }}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Start Fresh New Chat Button */}
            <TouchableOpacity
              onPress={handleStartNewChat}
              activeOpacity={0.85}
              style={{
                borderRadius: 14,
                overflow: 'hidden',
                marginBottom: 18,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.25,
                shadowRadius: 6,
                elevation: 3,
              }}
            >
              <LinearGradient
                colors={[colors.primary, colors.accent || '#8b5cf6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="add" size={22} color="#ffffff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold' }}>Start Fresh New Chat</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11.5, fontFamily: 'Inter_400Regular', marginTop: 1 }}>
                    Start a new conversation with clean context
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Existing Chats Section */}
            <View style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Previous Chats ({subjectChatSessions.length})
              </Text>
            </View>

            {isLoadingSessions ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : subjectChatSessions.length === 0 ? (
              <View style={{ paddingVertical: 20, alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
                <Ionicons name="chatbubble-outline" size={28} color={colors.textDim} style={{ marginBottom: 6 }} />
                <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textDim }}>No previous chats for this subject yet.</Text>
                <Text style={{ fontSize: 11.5, fontFamily: 'Inter_400Regular', color: colors.textMuted, marginTop: 2 }}>Tap "+ Start Fresh New Chat" above to begin!</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 250 }} showsVerticalScrollIndicator={false}>
                {subjectChatSessions.map((session, idx) => {
                  const timeStr = session.updatedAt 
                    ? new Date(session.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'Recently active';
                  const msgCount = (session.messages?.length || 1) - 1;
                  return (
                    <TouchableOpacity
                      key={session.id || idx}
                      onPress={() => handleOpenExistingSession(session.id)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
                        borderRadius: 12,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                        gap: 12,
                      }}
                    >
                      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary + '18', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="chatbubble-ellipses" size={16} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text }} numberOfLines={1}>
                          {session.title || 'Chat ' + (idx + 1)}
                        </Text>
                        <Text style={{ fontSize: 11.5, fontFamily: 'Inter_400Regular', color: colors.textDim, marginTop: 2 }}>
                          {timeStr} • {msgCount > 0 ? msgCount + (msgCount > 1 ? ' messages' : ' message') : 'Fresh session'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: Spacing.md,
    paddingTop: Platform.OS === 'ios' ? 6 : 8,
    paddingBottom: 110,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  headerCategory: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10.5,
    letterSpacing: 1.2,
  },
  headerTitle: {
    ...Typography.h1,
    color: colors.text,
    fontSize: 24,
    lineHeight: 28,
  },
  headerPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 5,
  },
  headerPillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12.5,
  },
  badgeCounter: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  badgeCounterText: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },

  // Hero Card
  heroCardWrapper: {
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  heroCard: {
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  heroSubtext: {
    fontSize: 11.5,
    fontFamily: 'Inter_500Medium',
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 4,
  },
  heroStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  heroStatValue: {
    fontSize: 19,
    fontFamily: 'SpaceGrotesk_700Bold',
    marginBottom: 2,
  },
  heroStatLabel: {
    fontSize: 10.5,
    fontFamily: 'Inter_500Medium',
  },
  heroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },

  // Search & Filter
  searchContainer: {
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: Radius.md,
    borderWidth: 1,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'Inter_500Medium',
    paddingVertical: 0,
  },
  filterStrip: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    borderColor: 'transparent',
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textDim,
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontFamily: 'Inter_700Bold',
  },

  // Subject Card
  cardWrapper: {
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  card: {
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codePillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    color: colors.text,
  },
  creditPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  creditPillText: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: colors.textDim,
  },
  attendancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  attendancePillText: {
    fontSize: 11.5,
    fontFamily: 'Inter_700Bold',
  },
  subjectTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 10,
  },
  attendanceBarContainer: {
    marginBottom: 12,
  },
  attendanceBarBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: 5,
  },
  attendanceBarFill: {
    height: 4,
    borderRadius: 2,
  },
  attendanceBarMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attendanceMetaText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  adviceText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  aiTutorBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 2,
  },
  aiTutorGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  aiTutorText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontFamily: 'Inter_700Bold',
  },
  lmsContentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  lmsContentBtnText: {
    fontSize: 12.5,
    fontFamily: 'Inter_600SemiBold',
  },

  // Skeletons
  skeletonCard: {
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
  },
  skeletonCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  skeletonPill: {
    height: 18,
    borderRadius: 6,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 4,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyResetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  emptyResetBtnText: {
    fontSize: 12.5,
    fontFamily: 'Inter_700Bold',
  },
});
