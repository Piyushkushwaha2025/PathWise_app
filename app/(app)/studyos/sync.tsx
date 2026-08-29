import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import { useThemeStore } from '../../../store/useThemeStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { useStudySessionStore } from '../../../store/studySessionStore';
import * as SecureStore from 'expo-secure-store';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { syncUserWithDB } from '../../../lib/db';
import timetableData from './timetableData.json';

const SCRAPE_STEPS = [
  {
    id: 'profile',
    url: 'https://student.culko.in/frmStudentProfile.aspx',
    msg: 'Extracting Profile...',
    script: `
      try {
        var debugHtml = document.body.innerHTML;
        var tables = Array.from(document.querySelectorAll('table')).map((t, i) => 'Table ' + i + ': ' + t.id + ' rows: ' + t.rows.length);
        var spans = Array.from(document.querySelectorAll('span')).map(s => s.id + '=' + s.innerText.trim()).filter(s => s.length > 5 && s.includes('lbl'));
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DEBUG_HTML',
          step: 'profile',
          spans: spans.slice(0, 20),
          tables: tables
        }));

        var name = 'Unknown';
        var uid = 'Unknown';
        var course = 'Unknown';
        var semester = 'N/A';
        
        var tds = document.querySelectorAll('td');
        for (var i = 0; i < tds.length; i++) {
           var txt = tds[i].innerText.trim().toLowerCase();
           if (txt.includes('name') && !txt.includes('father') && !txt.includes('mother')) {
             name = tds[i+1]?.innerText.trim() || name;
           }
           if (txt.includes('uid') || txt.includes('roll no')) {
             uid = tds[i+1]?.innerText.trim() || uid;
           }
           if (txt.includes('course') || txt.includes('program')) {
             course = tds[i+1]?.innerText.trim() || course;
           }
           if (txt === 'semester' || txt.includes('semester :') || txt.includes('semester:-')) {
             semester = tds[i+1]?.innerText.trim() || semester;
           }
        }
        
        var spans = document.querySelectorAll('span');
        for (var k = 0; k < spans.length; k++) {
           var id = spans[k].id.toLowerCase();
           var val = spans[k].innerText.trim();
           if (val) {
             if (id.includes('name') && !id.includes('father') && !id.includes('mother')) name = val;
             if (id.includes('uid') || id.includes('roll')) uid = val;
             if (id.includes('course') || id.includes('program')) course = val;
             if (id.includes('semester')) semester = val;
           }
        }
        
        var inputs = document.querySelectorAll('input[type="text"]');
        for (var k = 0; k < inputs.length; k++) {
           var id = inputs[k].id.toLowerCase();
           var val = inputs[k].value.trim();
           if (val) {
             if (id.includes('name') && !id.includes('father') && !id.includes('mother')) name = val;
             if (id.includes('uid') || id.includes('roll')) uid = val;
             if (id.includes('course') || id.includes('program')) course = val;
             if (id.includes('semester')) semester = val;
           }
        }
        var photoUrl = '';
        var imgs = document.querySelectorAll('img');
        for (var m = 0; m < imgs.length; m++) {
           var imgId = imgs[m].id.toLowerCase();
           var imgSrc = imgs[m].src;
           if (imgId.includes('photo') || imgId.includes('student') || imgId.includes('profile') || imgId.includes('img')) {
              if (imgSrc && !imgSrc.toLowerCase().includes('logo') && !imgSrc.toLowerCase().includes('header')) {
                 photoUrl = imgSrc;
                 break;
              }
           }
        }
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SCRAPE_RESULT',
          step: 'profile',
          data: { name, uid, course, cgpa: 'N/A', semester, photoUrl }
        }));
      } catch(e) {
         window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'profile', data: { name: 'Error', uid: '', course: '', cgpa: '' } }));
      }
      true;
    `
  },
  {
    id: 'subjects',
    url: 'https://student.culko.in/frmMyCourse.aspx',
    msg: 'Extracting Subjects...',
    script: `
      try {
        var debugHtml = document.body.innerHTML;
        var tablesHtml = Array.from(document.querySelectorAll('table')).map(t => t.outerHTML).join('\\n---TAB---\\n');
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DEBUG_HTML',
          step: 'subjects',
          htmlSnippet: tablesHtml.substring(0, 3000)
        }));

        var subjects = [];
        var section = '';
        var headerCells = document.querySelectorAll('#ContentPlaceHolder1_gvMyCourses tr:first-child th');
        var sectionIdx = -1;
        for (var h = 0; h < headerCells.length; h++) {
           if (headerCells[h].innerText.toLowerCase().includes('section')) {
              sectionIdx = h;
              break;
           }
        }

        var rows = document.querySelectorAll('#ContentPlaceHolder1_gvMyCourses tr');
        for (var i = 1; i < rows.length; i++) {
          var code = rows[i].querySelector('span[id*="lblCourseCode"]')?.innerText.trim();
          var name = rows[i].querySelector('span[id*="lblCourseName"]')?.innerText.trim();
          var type = rows[i].querySelector('span[id*="lblType"]')?.innerText.trim();
          
          if (!section && sectionIdx !== -1) {
             var cells = rows[i].querySelectorAll('td');
             if (cells.length > sectionIdx) {
                var secVal = cells[sectionIdx].innerText.trim();
                if (secVal) section = secVal;
             }
          }

          var credits = '0';
          var creditSpan = rows[i].querySelector('span[id*="lblCredit"]');
          if (creditSpan) {
            credits = creditSpan.innerText.trim();
          } else {
            var tds = Array.from(rows[i].querySelectorAll('td')).map(td => td.innerText.trim());
            var credNum = tds.find(t => /^[1-9](\.[0-9]+)?$/.test(t));
            if (credNum) credits = credNum;
          }

          if (code && name) {
            subjects.push({ 
               code: code, 
               name: name + (type ? ' (' + type + ')' : ''), 
               credits: credits, 
               totalClasses: 0, 
               attendedClasses: 0, 
               attendancePercentage: 0 
            });
          }
        }
        if(subjects.length === 0) throw new Error("No subjects found");
        
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'subjects', data: { list: subjects, section: section } }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ 
          type: 'SCRAPE_RESULT', step: 'subjects', 
          data: { list: [], section: '' } 
        }));
      }
      true;
    `
  },
  {
    id: 'timetable',
    url: 'https://student.culko.in/frmMyTimeTable.aspx',
    msg: 'Extracting Timetable...',
    script: `
      try {
        var timetable = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] };
        var daysMap = [null, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        
        // Send debug HTML first so we can diagnose selector mismatches
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DEBUG_HTML', step: 'timetable',
          htmlSnippet: document.body.innerHTML.substring(0, 6000)
        }));

        // Try multiple selectors — portal HTML may differ across sessions
        var tableSelectors = [
          '#ContentPlaceHolder1_grdMain tr',
          'table[id*="grdMain"] tr',
          'table[id*="TimeTable"] tr',
          'table[id*="tblTimeTable"] tr',
          '.table-responsive table tr',
          'table.GridView tr',
          'table tr'
        ];
        
        var rows = [];
        for (var s = 0; s < tableSelectors.length; s++) {
          var found = document.querySelectorAll(tableSelectors[s]);
          if (found.length > 2) { rows = Array.from(found); break; }
        }
        
        for (var i = 1; i < rows.length; i++) {
          var cells = rows[i].querySelectorAll('td');
          if (cells.length >= 7) {
            var time = cells[0].innerText.trim();
            for (var j = 1; j < cells.length && j < daysMap.length; j++) {
               var text = cells[j].innerText.trim();
               if (text && text.length > 3 && text !== '\u00a0' && text !== '-') {
                 var parts = text.split(/\bBy\b/);
                 var leftPart = parts[0];
                 var rightPart = parts[1] || '';
                 
                 var leftSplit = leftPart.split(':');
                 var subjectName = leftSplit[0] ? leftSplit[0].trim() : '';
                 if (leftSplit[1] && leftSplit[1].trim() === 'P') subjectName += ' (Lab)';
                 var group = leftSplit[3] ? leftSplit[3].trim() : '';
                 
                 var rightSplit = rightPart.split(/\bat\b/);
                 var teacher = rightSplit[0] ? rightSplit[0].trim() : '';
                 var room = rightSplit[1] ? rightSplit[1].trim() : '';
                 
                 if (daysMap[j] && timetable[daysMap[j]]) {
                    timetable[daysMap[j]].push({
                       subjectName: subjectName,
                       teacher: teacher,
                       time: time,
                       room: room,
                       group: group
                    });
                 }
               }
            }
          }
        }
        
        // Try to detect section from page heading (e.g. "25BCS-3")
        var detectedSection = '';
        var headings = document.querySelectorAll('h1, h2, h3, h4, label, span, td');
        for (var h = 0; h < headings.length; h++) {
          var ht = headings[h].innerText || '';
          var m = ht.match(/\\b(\\d{2}[A-Z]{2,5}-[A-Z]{0,6}-?\\d{1,2})\\b/);
          if (m) { detectedSection = m[1]; break; }
        }
        
        var hasClasses = Object.values(timetable).some(function(arr) { return arr.length > 0; });
        if (!hasClasses) throw new Error('No classes found in any table');
        
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'timetable', data: timetable, section: detectedSection }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'timetable', data: null, error: e.message }));
      }
      true;
    `
  },
  {
    id: 'attendance',
    url: 'https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx?type=etgkYfqBdH1fSfc255iYGw==',
    msg: 'Extracting Attendance...',
    script: `
      (function waitForData() {
        try {
          var attendanceData = {};
          
          // Portal renders attendance via AJAX — wait up to 8s for tbody to fill
          var maxWait = 8000;
          var interval = 150;
          var elapsed = 0;
          
          var tryParse = function() {
            // From debug logs: table id="SortTable", columns:
            // 0=Course Code, 1=Title, 2=Total Delv, 3=Total Attd, 
            // 4=IDL, 5=ADL, 6=VDL, 7=Medical Leave,
            // 8=Eligible Delivered, 9=Eligible Attended, 10=Eligible Percentage, 11=View
            var rows = document.querySelectorAll('#SortTable tbody tr');
            
            if (rows.length === 0 && elapsed < maxWait) {
              elapsed += interval;
              setTimeout(tryParse, interval);
              return;
            }
            
            for (var i = 0; i < rows.length; i++) {
              var cells = rows[i].querySelectorAll('td');
              if (cells.length < 10) continue;
              
              var code = cells[0].innerText.trim();
              var title = cells[1].innerText.trim();
              var eligDelivered = parseFloat(cells[8].innerText.trim()) || 0;
              var eligAttended = parseFloat(cells[9].innerText.trim()) || 0;
              var eligPercText = cells[10].innerText.trim().replace('%','');
              var eligPerc = parseFloat(eligPercText) || 0;
              
              // Fallback to raw total/attended if eligible columns are 0
              var totalDelv = parseFloat(cells[2].innerText.trim()) || 0;
              var totalAttd = parseFloat(cells[3].innerText.trim()) || 0;
              
              var finalTotal = eligDelivered > 0 ? eligDelivered : totalDelv;
              var finalAttended = eligAttended > 0 ? eligAttended : totalAttd;
              var finalPerc = eligPerc > 0 ? eligPerc : (finalTotal > 0 ? Math.round((finalAttended/finalTotal)*100) : 0);
              
              // Try to get viewActionTarget from "View Attendance" button
              var viewActionTarget = '';
              if (cells[11]) {
                var btn = cells[11].querySelector('input[type="submit"], button, a');
                if (btn) {
                  viewActionTarget = btn.name || btn.id || '';
                  if (!viewActionTarget) {
                    var oc = btn.getAttribute('onclick') || btn.href || '';
                    var m = oc.match(/__doPostBack\\('([^']+)'/);
                    if (m) viewActionTarget = m[1];
                  }
                }
              }
              
              var dataObj = { total: finalTotal, attended: finalAttended, percentage: finalPerc, viewActionTarget: viewActionTarget };
              if (code) attendanceData[code] = dataObj;
              if (title) attendanceData[title] = dataObj;
            }
            
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'attendance', data: attendanceData }));
          };
          
          tryParse();
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'attendance', data: {} }));
        }
      })();
      true;
    `
  },
  {
    id: 'marks',
    url: 'https://student.culko.in/frmStudentMarksView.aspx',
    msg: 'Extracting Marks...',
    script: `
      try {
        var marksData = [];
        var rows = document.querySelectorAll('table tr');
        
        
        var mstIndex = -1;
        var pracIndex = -1;
        var subIndex = -1;
        
        if (rows.length > 0) {
           var headers = Array.from(rows[0].querySelectorAll('th, td')).map(h => h.innerText.trim().toLowerCase());
           for (var h = 0; h < headers.length; h++) {
              if (headers[h].includes('subject') || headers[h].includes('course')) subIndex = h;
              if (headers[h].includes('mst') || headers[h].includes('mid')) mstIndex = h;
              if (headers[h].includes('prac') || headers[h].includes('lab')) pracIndex = h;
           }
           
           
           if (subIndex === -1) subIndex = 1;
           if (mstIndex === -1) mstIndex = 3; 
           if (pracIndex === -1) pracIndex = 4;

           for(var i=1; i<rows.length; i++) {
              var cells = rows[i].querySelectorAll('td');
              if (cells.length > subIndex) {
                 var subjectName = cells[subIndex].innerText.trim();
                 var mstMarks = cells.length > mstIndex ? cells[mstIndex].innerText.trim() : 'N/A';
                 var practicalMarks = cells.length > pracIndex ? cells[pracIndex].innerText.trim() : 'N/A';
                 
                 if (subjectName && subjectName !== '') {
                    marksData.push({
                       subjectName: subjectName,
                       mstMarks: mstMarks,
                       practicalMarks: practicalMarks
                    });
                 }
              }
           }
        }
        
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: marksData }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: [] }));
      }
      true;
    `
  }
];

export default function SyncScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { userId } = useAuth();
  const { setScrapedData } = useStudyOSStore();
  const { setSession } = useStudySessionStore();
  const webViewRef = useRef<WebView>(null);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [scrapedDataState, setScrapedDataState] = useState<any>({});

  const currentStep = SCRAPE_STEPS[currentStepIndex];

  // Refs mirror state so async callbacks / the safety timeout read fresh values
  const scrapedDataRef = useRef<any>({});
  const cookieRef = useRef<string>('');
  const finishedRef = useRef(false);
  const stepIndexRef = useRef(0);

  // CRITICAL: Reset ALL refs and state every time this screen comes into focus.
  // Without this, after disconnect → re-login without restarting the app,
  // finishedRef stays true from the last sync and finalizeSync() silently returns,
  // leaving the user stuck at 5/5 forever.
  useFocusEffect(
    useCallback(() => {
      scrapedDataRef.current = {};
      cookieRef.current = '';
      finishedRef.current = false;
      stepIndexRef.current = 0;
      setCurrentStepIndex(0);
      setScrapedDataState({});
      setShowSkipButton(false);

      // Reload any saved cookies for this new session
      SecureStore.getItemAsync('culko_cookies').then((c) => {
        if (c) {
          cookieRef.current = c;
          console.log('[Sync] Pre-loaded cookies from SecureStore');
        }
      });
    }, [])
  );

  // Keep stepIndexRef in sync with state so async callbacks always see the latest index
  useEffect(() => {
    stepIndexRef.current = currentStepIndex;
  }, [currentStepIndex]);

  const finalizeSync = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    try {
      const existing = useStudyOSStore.getState();
      const newData = scrapedDataRef.current;
      const subjList = newData.subjects?.list || [];

      // Detect section from multiple sources, best to worst
      const section =
        newData.subjects?.section ||          
        newData.timetable?.section ||          
        existing.profile?.section ||           
        (() => {
          const codes: string[] = (subjList.length > 0 ? subjList : existing.subjects || [])
            .map((s: any) => s.code || '');
          for (const code of codes) {
            const m = code.match(/^(\d{2}[A-Z]{2,5}-[A-Z]{0,6}-?\d{1,2})/);
            if (m) return m[1];
          }
          return '';
        })();

      const baseSubjects = subjList.length > 0 ? subjList : existing.subjects;

      const updatedSubjects = (baseSubjects || []).map((subj: any) => {
        let att = newData.attendance?.[subj.code];
        if (!att && subj.code) {
          const cleanCode = subj.code.replace(/^[A-Z]+_/, '').trim();
          att = newData.attendance?.[cleanCode];
          if (!att) {
            const matchingKey = Object.keys(newData.attendance || {}).find(k => subj.code?.includes(k) || k.includes(cleanCode));
            if (matchingKey) att = newData.attendance[matchingKey];
          }
        }
        if (att) {
          return { ...subj, attendancePercentage: att.percentage, attendedClasses: att.attended, totalClasses: att.total };
        }
        return subj;
      });

      if (newData.profile) newData.profile.section = section;

      const hasValidTimetable = (tt: any) => {
        if (!tt) return false;
        return Object.values(tt).some((day: any) => Array.isArray(day) && day.length > 0);
      };

      const findBestTimetableSection = (sec: string) => {
        const keys = Object.keys(timetableData as any);
        if (!sec) return '';
        if ((timetableData as any)[sec]) return sec;
        const prefix = sec.replace(/-\d+$/, '');
        const prefixMatch = keys.find(k => k.startsWith(prefix));
        if (prefixMatch) return prefixMatch;
        return '';
      };

      let finalTimetable: any = {};
      if (hasValidTimetable(newData.timetable)) {
        finalTimetable = newData.timetable;
      } else if (hasValidTimetable(existing.timetable) && !(existing.timetable as any)?.isStaticJSONFallback) {
        finalTimetable = existing.timetable;
      } else {
        const bestSection = findBestTimetableSection(section);
        if (bestSection && (timetableData as any)[bestSection]) {
          finalTimetable = { ...(timetableData as any)[bestSection], isStaticJSONFallback: true };
        }
      }

      await setScrapedData({
        profile: newData.profile || existing.profile,
        subjects: updatedSubjects,
        timetable: finalTimetable,
        marks: (newData.marks && newData.marks.length) ? newData.marks : existing.marks,
        isScrapedDataLoaded: true
      });

      if (userId && section) {
        syncUserWithDB(userId, section, newData.profile?.uid)
          .catch(e => console.error('Failed to sync section to DB', e));
      }

      await setSession('cu', 'culko-scraped', 0);

      if (cookieRef.current) {
        await SecureStore.setItemAsync('culko_cookies', cookieRef.current).catch(() => {});
      }

      setTimeout(() => {
        router.navigate('/(app)/dashboard');
      }, 100);
    } catch (error: any) {
      console.error('Finalize sync crashed:', error);
      router.navigate('/(app)/dashboard');
    }
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    if (!navState.loading) {
      const step = SCRAPE_STEPS[stepIndexRef.current];
      if (!step) return;

      // Inject saved session cookies FIRST for ALL steps to prevent redirects
      // to login/error pages on Android WebViews losing session context.
      let cookieInject = '';
      if (cookieRef.current) {
        const parts = cookieRef.current.split(';').map((c: string) => c.trim()).filter(Boolean);
        cookieInject = parts.map((c: string) => `document.cookie = ${JSON.stringify(c + '; path=/')};`).join('\n');
      }

      if (cookieInject) {
        webViewRef.current?.injectJavaScript(cookieInject + '\ntrue;');
      }

      // For attendance, wait 2s for AJAX data to populate. For others, 100ms is enough.
      const delay = 100; // Fast execution, injected script has its own polling mechanism

      setTimeout(() => {
        const captureAndScrape = `
          (function() {
            try {
              var c = document.cookie;
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOKIES', data: c }));
            } catch(e) {}
          })();
          ${step.script}
        `;
        webViewRef.current?.injectJavaScript(captureAndScrape);
      }, delay);
    }
  };


  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'COOKIES') {
        if (finishedRef.current) return;
        
        // Save latest cookies whenever we get them
        if (data.data) {
          cookieRef.current = data.data;
          await SecureStore.setItemAsync('culko_cookies', data.data).catch(() => {});
        }
      } else if (data.type === 'DEBUG_HTML') {
        console.log('========= DEBUG HTML FOR STEP:', data.step, '=========');
        console.log(JSON.stringify(data, null, 2));
      } else if (data.type === 'SCRAPE_RESULT') {
        const expectedStep = SCRAPE_STEPS[stepIndexRef.current];
        // Accept if step matches, or if it's a forced skip (same step id sent by timeout/error)
        if (!expectedStep || data.step !== expectedStep.id) {
          console.log('[Sync] Ignoring SCRAPE_RESULT for', data.step, '— expected', expectedStep?.id);
          return;
        }
        console.log('Scraped data for', data.step, data.data ? '(data received)' : '(null/skip)');
        const newData = { ...scrapedDataRef.current, [data.step]: data.data };
        scrapedDataRef.current = newData;
        setScrapedDataState(newData);

        const nextIndex = stepIndexRef.current + 1;
        if (nextIndex < SCRAPE_STEPS.length) {
          stepIndexRef.current = nextIndex;
          setCurrentStepIndex(nextIndex);
        } else {
          await finalizeSync();
        }
      }
    } catch (e) {
      console.log('Error parsing scrape message', e);
    }
  };

  const [showSkipButton, setShowSkipButton] = useState(false);

  // Show a manual skip button after 5s on the last step (marks) so user never stays truly stuck
  useEffect(() => {
    setShowSkipButton(false);
    if (currentStepIndex === SCRAPE_STEPS.length - 1) {
      const t = setTimeout(() => setShowSkipButton(true), 5000);
      return () => clearTimeout(t);
    }
  }, [currentStepIndex]);

  // Per-step safety net: if a step's page hangs for more than 8 seconds, skip it.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!finishedRef.current && currentStep) {
         console.log('Step timeout:', currentStep.id);
         handleMessage({ nativeEvent: { data: JSON.stringify({ type: 'SCRAPE_RESULT', step: currentStep.id, data: null }) } });
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [currentStepIndex]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.title}>Syncing College Data</Text>
        <Text style={styles.subtitle}>{currentStep?.msg || 'Finishing up...'}</Text>
        <Text style={styles.progressText}>{currentStepIndex + 1} / {SCRAPE_STEPS.length} Steps</Text>

        {showSkipButton && (
          <TouchableOpacity
            onPress={() => finalizeSync()}
            style={{ marginTop: 32, backgroundColor: colors.primary + '20', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.primary + '60' }}
          >
            <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
              Continue to Dashboard →
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Hidden WebView to perform the actual scraping */}
      {currentStep && (
        <View style={styles.hiddenWebviewContainer}>
          <WebView
            ref={webViewRef}
            source={{ uri: currentStep.url, headers: cookieRef.current ? { Cookie: cookieRef.current } : undefined }}
            onNavigationStateChange={handleNavigationStateChange}
            onMessage={handleMessage}
            onError={(e) => {
              console.log('WebView Error on step:', currentStep.id, e.nativeEvent.description);
              handleMessage({ nativeEvent: { data: JSON.stringify({ type: 'SCRAPE_RESULT', step: currentStep.id, data: null }) } });
            }}
            onHttpError={(e) => {
              console.log('WebView HTTP Error on step:', currentStep.id, e.nativeEvent.statusCode);
              handleMessage({ nativeEvent: { data: JSON.stringify({ type: 'SCRAPE_RESULT', step: currentStep.id, data: null }) } });
            }}
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  title: {
    ...Typography.h2,
    color: colors.text,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    ...Typography.body,
    color: colors.primary,
    fontSize: 16,
    marginBottom: Spacing.lg,
  },
  progressText: {
    ...Typography.small,
    color: colors.textDim,
  },
  hiddenWebviewContainer: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
    left: -1000,
  }
});
