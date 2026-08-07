import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  const styles = useStyles(colors);
  const router = useRouter();
  const { clearSession } = useStudySessionStore();
  const { userId } = useAuth();
  const { dbUser } = useDBProfile();
  const profile = useStudyOSStore((s) => s.profile);
  const erpSubjects = useStudyOSStore((s) => s.subjects) || [];
  const { data: attendanceData } = useAttendance();
  const { isSubscriptionRequired } = useSubscription();
  const activeSection = dbUser?.section_code || profile?.section || null;
  const [pendingCount, setPendingCount] = useState(0);

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
    await clearSession();
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
    // course maps to an ERP record. Never drops the course if no match found.
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
    }

    if (cleanName.length >= 2) {
      mainCourses.push({ fullname: cleanName, shortname: code, originalName: c.fullname, id: c.id });
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
              accumulatedCoursesRef.current = [];
              setWebViewUrl('https://lms.culko.in/my/courses.php?paged=0');
              AsyncStorage.removeItem(LMS_COURSES_CACHE_KEY).catch(() => {});
              setIsScraping(true);
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.headerRow}>
           <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={styles.header}>LMS Courses</Text>
              <Text style={styles.subheader}>Access your study materials from university.</Text>
           </View>
           <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* Subtle background sync spinner */}
              {isScraping && !isLoading && <ActivityIndicator size="small" color={colors.primary} />}
              
              <TouchableOpacity 
                 onPress={() => router.push('/studyos/assignments' as any)} 
                 style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    backgroundColor: colors.surface, 
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: pendingCount > 0 ? 12 : 0, 
                    width: pendingCount > 0 ? 'auto' : 48,
                    height: 48, 
                    borderRadius: 24 
                 }}
              >
                 <Ionicons name="clipboard-outline" size={20} color={colors.primary} />
                 {pendingCount > 0 && (
                    <View style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 }}>
                       <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter_700Bold' }}>{pendingCount}</Text>
                    </View>
                 )}
              </TouchableOpacity>

               <TouchableOpacity
                  onPress={() => router.push('/studyos/grades' as any)}
                  style={{ 
                     alignItems: 'center', 
                     justifyContent: 'center',
                     backgroundColor: colors.surface, 
                     borderWidth: 1,
                     borderColor: colors.border,
                     width: 48,
                     height: 48, 
                     borderRadius: 24 
                  }}
               >
                  <Ionicons name="book" size={20} color={colors.primary} />
               </TouchableOpacity>
           </View>
        </View>
         {(mainCourses.length === 0 && erpSubjects.length > 0) ? (
            <>
               {erpSubjects.map((sub, index) => (
                 <TouchableOpacity 
                   key={'fallback-'+index} 
                   style={styles.card}
                   activeOpacity={1}
                   onPress={() => {}}
                 >
                   <View style={styles.cardHeader}>
                     <View style={styles.cardIconBox}>
                       <Ionicons name="book-outline" size={20} color={colors.primary} />
                     </View>
                     <View style={styles.cardInfo}>
                       <Text style={styles.subjectName}>{sub.name}</Text>
                       <Text style={styles.subjectCode}>{sub.code}</Text>
                     </View>
                     
                     <TouchableOpacity 
                       style={{ 
                         backgroundColor: colors.primary, 
                         paddingHorizontal: 16, 
                         paddingVertical: 8, 
                         borderRadius: 18, 
                         marginRight: 8, 
                         flexDirection: 'row', 
                         alignItems: 'center',
                         shadowColor: colors.primary,
                         shadowOffset: { width: 0, height: 2 },
                         shadowOpacity: 0.35,
                         shadowRadius: 5,
                         elevation: 4
                       }}
                       onPress={() => {
                         if (isSubscriptionRequired) {
                           usePaywallStore.getState().showPaywall("AI Tutor is a Pro feature. Upgrade to get instant answers and explanations for any subject.");
                           return;
                         }
                         router.push(`/studyos/subjects/chat/${encodeURIComponent(sub.code)}?name=${encodeURIComponent(sub.name)}` as any);
                       }}
                     >
                       <Ionicons name="sparkles" size={17} color="#fff" style={{ marginRight: 6 }} />
                       <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' }}>AI</Text>
                     </TouchableOpacity>
                   </View>
                 </TouchableOpacity>
               ))}
            </>
         ) : (isLoading && mainCourses.length === 0) ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.textMuted, marginTop: Spacing.md, textAlign: 'center' }}>
               Connecting to LMS... Please wait.
            </Text>
          </View>
        ) : (
          <>
            {errorMsg === 'SESSION_EXPIRED' && (
              <View style={{ backgroundColor: colors.error + '15', padding: 16, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.error + '40' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="cloud-offline-outline" size={24} color={colors.error} />
                  <Text style={{ color: colors.error, marginLeft: 8, fontFamily: 'Inter_600SemiBold', flex: 1 }}>
                    Servers Unreachable
                  </Text>
                </View>
                <Text style={{ color: colors.text, fontSize: 13, marginBottom: 12 }}>
                  LMS is down and your session has expired. Showing offline subjects. To get fresh data, please re-connect.
                </Text>
                <TouchableOpacity 
                  style={{ backgroundColor: colors.error, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' }}
                  onPress={handleLogout}
                >
                  <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Logout & Re-connect</Text>
                </TouchableOpacity>
              </View>
            )}

            {mainCourses.length > 0 ? (
              <>
                {mainCourses.map((course, index) => {
                  const isErpCourse = course.fullname.includes('(ERP)');
                  
                  return (
                  <TouchableOpacity 
                    key={'main-'+index} 
                style={styles.card}
                activeOpacity={isErpCourse ? 1 : 0.7}
                onPress={() => {
                  if (isErpCourse) return;
                  router.push(`/studyos/subjects/${course.id || course.shortname}?name=${encodeURIComponent(course.fullname)}` as any);
                }}
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
                    style={{ 
                      backgroundColor: colors.primary, 
                      paddingHorizontal: 16, 
                      paddingVertical: 8, 
                      borderRadius: 18, 
                      marginRight: 8, 
                      flexDirection: 'row', 
                      alignItems: 'center',
                      shadowColor: colors.primary,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.35,
                      shadowRadius: 5,
                      elevation: 4
                    }}
                    onPress={() => {
                      if (isSubscriptionRequired) {
                        usePaywallStore.getState().showPaywall("AI Tutor is a Pro feature. Upgrade to get instant answers and explanations for any subject.");
                        return;
                      }
                      // Use shortname as the course code for file lookups (e.g. CONT_25CSH-214)
                      // Fall back to numeric id if shortname is generic
                      const chatId = (course.shortname && course.shortname !== 'COURSE') ? course.shortname : (course.id || course.shortname);
                      router.push(`/studyos/subjects/chat/${encodeURIComponent(chatId)}?name=${encodeURIComponent(course.fullname)}` as any);
                    }}
                  >
                    <Ionicons name="sparkles" size={17} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' }}>AI</Text>
                  </TouchableOpacity>
                  
                  {!isErpCourse && <Ionicons name="chevron-forward" size={18} color={colors.textDim} />}
                </View>
              </TouchableOpacity>
                )})}

          </>
        ) : (
          <View style={styles.centerBox}>
            <Ionicons name="folder-open-outline" size={48} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: Spacing.md }}>
              No enrolled courses found on LMS.
            </Text>
          </View>
        )}
        </>
        )}
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
    paddingTop: 20,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
    paddingRight: 12,
  },
  subjectName: {
    ...Typography.h3,
    color: colors.text,
    marginBottom: 2,
    fontSize: 14.5,
  },
  subjectCode: {
    ...Typography.small,
    color: colors.textMuted,
    fontSize: 11.5,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    padding: Spacing.xl,
  }
});
