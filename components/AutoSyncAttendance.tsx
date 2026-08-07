import React, { useRef, useState, useEffect } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStudyOSStore } from '../store/studyosStore';
import * as SecureStore from 'expo-secure-store';

const ATTENDANCE_URL = 'https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx?type=etgkYfqBdH1fSfc255iYGw==';

const ATTENDANCE_SCRIPT = `
  (function executeWhenReady() {
    if (!window.ReactNativeWebView) {
      setTimeout(executeWhenReady, 500);
      return;
    }
    try {
      var attendanceData = {};
      var tables = document.querySelectorAll('table');
      for (var t = 0; t < tables.length; t++) {
        var rows = tables[t].querySelectorAll('tr');
        if (rows.length < 2) continue;
        
        for (var i = 1; i < rows.length; i++) {
          var cells = rows[i].querySelectorAll('td');
          if (cells.length >= 4) {
             var textArr = Array.from(cells).map(function(c) { return c.innerText.trim(); });
             var code = null;
             for (var x = 0; x < textArr.length; x++) {
               if (/^[0-9A-Z]{2,8}[-_]?[0-9]{3}/.test(textArr[x])) { code = textArr[x]; break; }
             }
             var altName = textArr[0] || '';
             var altName2 = textArr[1] || '';
             
             var numArr = [];
             var explicitPerc = null;
             for (var j = 0; j < textArr.length; j++) {
                var rawVal = textArr[j].trim();
                if (rawVal.includes('%')) explicitPerc = Number(rawVal.replace('%', '').trim());
                var clean = rawVal.replace('%','').trim();
                if (clean !== '' && !isNaN(Number(clean))) numArr.push(Number(clean));
             }
             
             var total = 0, attended = 0, percentage = 0;
             if (numArr.length >= 2) {
               percentage = (explicitPerc !== null && !isNaN(explicitPerc)) ? explicitPerc : numArr[numArr.length - 1];
               var bestMatch = null;
               var bestDiff = 999;

               if (percentage > 0) {
                 for (var p1 = 0; p1 < numArr.length; p1++) {
                   for (var p2 = 0; p2 < numArr.length; p2++) {
                     var A = numArr[p1], B = numArr[p2];
                     if (B > 0 && A <= B && B <= 500 && A !== percentage && B !== percentage) {
                       var calc = (A / B) * 100;
                       var diff = Math.abs(calc - percentage);
                       if (diff <= 1.5) {
                         if (diff < bestDiff - 0.01 || (Math.abs(diff - bestDiff) <= 0.01 && B > (bestMatch ? bestMatch.total : 0))) {
                           bestDiff = diff;
                           bestMatch = { attended: A, total: B };
                         }
                       }
                     }
                   }
                 }
                 if (bestMatch && bestDiff <= 1.5) {
                   attended = bestMatch.attended;
                   total = bestMatch.total;
                 } else {
                   var validCounts = numArr.slice(0, numArr.length - 1).filter(function(n) { return n >= 0 && n <= 500; });
                   if (validCounts.length >= 2) {
                     attended = Math.min(validCounts[validCounts.length - 1], validCounts[validCounts.length - 2]);
                     total = Math.max(validCounts[validCounts.length - 1], validCounts[validCounts.length - 2]);
                   } else {
                     attended = numArr[numArr.length - 2] || 0;
                     total = numArr[numArr.length - 3] || 0;
                   }
                 }
               } else {
                 attended = 0;
                 total = 0;
                 for (var v = 0; v < numArr.length - 1; v++) {
                   if (numArr[v] > total && numArr[v] <= 100) total = numArr[v];
                 }
               }
             }

             if (total > 0 && attended > 0 && (percentage === 0 || isNaN(percentage))) {
               percentage = Number(((attended / total) * 100).toFixed(2));
             }

             var existing = attendanceData[code || altName];
             if (!existing || (existing.total === 0 && total > 0)) {
               var viewActionTarget = '';
               var viewBtn = rows[i].querySelector('input[value="VIEW"], input[value="View"], input[type="submit"]');
               if (viewBtn) {
                  if (viewBtn.name) viewActionTarget = viewBtn.name;
                  else if (viewBtn.getAttribute('onclick') && viewBtn.getAttribute('onclick').includes('__doPostBack')) {
                     var match = viewBtn.getAttribute('onclick').match(/__doPostBack\\('([^']+)'/);
                     if (match) viewActionTarget = match[1];
                  }
               }
               if (!viewActionTarget) {
                  var linkBtns = rows[i].querySelectorAll('a, input, button');
                  for (var k = 0; k < linkBtns.length; k++) {
                     if (linkBtns[k].name && (linkBtns[k].name.includes('ctl00$') || linkBtns[k].name.includes('btn'))) {
                        viewActionTarget = linkBtns[k].name; break;
                     }
                     if (linkBtns[k].href && linkBtns[k].href.includes('__doPostBack')) {
                        var match = linkBtns[k].href.match(/__doPostBack\\('([^']+)'/);
                        if (match) { viewActionTarget = match[1]; break; }
                     }
                     var oc = linkBtns[k].getAttribute('onclick');
                     if (oc && oc.includes('__doPostBack')) {
                        var match = oc.match(/__doPostBack\\('([^']+)'/);
                        if (match) { viewActionTarget = match[1]; break; }
                     }
                  }
               }
               
               var dataObj = { total: total, attended: attended, percentage: percentage, viewActionTarget: viewActionTarget };
               if (code) attendanceData[code] = dataObj;
               if (altName) attendanceData[altName] = dataObj;
               if (altName2 && altName2 !== altName) attendanceData[altName2] = dataObj;
             }
          }
        }
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SILENT_ATTENDANCE', data: attendanceData, cookie: document.cookie }));
    } catch(e) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SILENT_ATTENDANCE', data: {}, error: e.message || 'Unknown error' }));
      }
    }
  })();
  true;
`;

interface Props {
  onFinish?: (updated: boolean, changes?: { code?: string, subjectName: string, status: string }[]) => void;
  onSessionExpired?: () => void;
}

export function AutoSyncAttendance({ onFinish, onSessionExpired }: Props) {
  const webViewRef = useRef<WebView>(null);
  const [cookieInjectScript, setCookieInjectScript] = useState<string | null>(null);
  const hasInjectedPostback = useRef(false);
  const hasFinished = useRef(false);
  const setScrapedData = useStudyOSStore((s) => s.setScrapedData);

  const finish = (updated = false, changes: { subjectName: string, status: string }[] = []) => {
    if (!hasFinished.current) {
      hasFinished.current = true;
      if (onFinish) onFinish(updated, changes);
    }
  };

  const sessionExpired = () => {
    if (!hasFinished.current) {
      hasFinished.current = true;
      if (onSessionExpired) onSessionExpired();
      else if (onFinish) onFinish(false);
    }
  };

  useEffect(() => {
    // Load saved cookies first
    SecureStore.getItemAsync('culko_cookies').then((cookies) => {
      if (cookies) {
        const parts = cookies.split(';').map((c: string) => c.trim()).filter(Boolean);
        const lines = parts.map((c: string) => `document.cookie = ${JSON.stringify(c + '; path=/')};`).join('\n');
        setCookieInjectScript(lines + '\ntrue;');
        console.log('[AutoSync] Loaded', parts.length, 'saved cookies');
      } else {
        console.log('[AutoSync] No saved cookies — will attempt anyway');
        setCookieInjectScript('true;');
      }
    });

    // Safety timeout — 25s max
    const timer = setTimeout(() => finish(false), 25000);
    return () => clearTimeout(timer);
  }, []);

  const handleMessage = async (event: any) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data);
      if (parsed.type === 'SILENT_ATTENDANCE') {
        const newData = parsed.data || {};
        const freshCookie = parsed.cookie || '';
        
        if (freshCookie) {
          await AsyncStorage.setItem('studyos_portal_cookies', freshCookie);
        }
        
        console.log('[AutoSync] Scraped attendance keys:', Object.keys(newData));
        console.log('[AutoSync] Scraped Data Dump:', JSON.stringify(newData, null, 2));
        console.log('[AutoSync] Current Subjects:', JSON.stringify(useStudyOSStore.getState().subjects.map((s:any) => s.code), null, 2));

        if (Object.keys(newData).length > 0) {
          const { subjects, profile, timetable, marks } = useStudyOSStore.getState();
          let dataChanged = false;
          let changesDetected: { code?: string, subjectName: string, status: string }[] = [];

          const updatedSubjects = (subjects || []).map((subj: any) => {
            let att = newData[subj.code];

            if (!att && subj.code) {
              const cleanCode = subj.code.replace(/^[A-Z]+_/, '').trim();
              att = newData[cleanCode];
              if (!att) {
                const matchingKey = Object.keys(newData).find(k => k.includes(cleanCode) || subj.code.includes(k));
                if (matchingKey) att = newData[matchingKey];
              }
            }

            if (!att && subj.name) {
              const nameLower = subj.name.toLowerCase().trim();
              const matchingKey = Object.keys(newData).find(k => {
                const kl = k.toLowerCase().trim();
                return kl === nameLower || kl.includes(nameLower) || nameLower.includes(kl);
              });
              if (matchingKey) att = newData[matchingKey];
            }

            if (att) {
              // Check if anything actually changed
              if (
                att.attended !== subj.attendedClasses ||
                att.total !== subj.totalClasses
              ) {
                if (att.total > subj.totalClasses) {
                  const diffTotal = att.total - subj.totalClasses;
                  const diffAttended = att.attended - subj.attendedClasses;
                  const status = diffAttended >= diffTotal ? 'Present' : 'Absent';
                  changesDetected.push({ code: subj.code, subjectName: subj.name || subj.code, status });
                } else if (att.total !== subj.totalClasses || att.attended !== subj.attendedClasses) {
                  changesDetected.push({ code: subj.code, subjectName: subj.name || subj.code, status: 'Updated' });
                }
                dataChanged = true;
              } else if (
                att.percentage !== subj.attendancePercentage ||
                (att.viewActionTarget && att.viewActionTarget !== subj.viewActionTarget)
              ) {
                dataChanged = true;
              }
              return { 
                ...subj, 
                attendancePercentage: att.percentage, 
                attendedClasses: att.attended, 
                totalClasses: att.total,
                viewActionTarget: att.viewActionTarget || subj.viewActionTarget 
              };
            }
            return subj;
          });

          await setScrapedData({ profile, subjects: updatedSubjects, timetable, marks });
          console.log('[AutoSync] Store updated. Data changed:', dataChanged, changesDetected);
          finish(dataChanged, changesDetected);
        } else {
          console.log('[AutoSync] No data scraped');
          finish(false, []);
        }
      }
    } catch (e) {
      console.log('[AutoSync] handleMessage error:', e);
      finish(false);
    }
  };

  if (cookieInjectScript === null) return null;

  return (
    <View style={{ width: 2, height: 2, opacity: 0, overflow: 'hidden' }}>
      <WebView
        ref={webViewRef}
        source={{ uri: ATTENDANCE_URL }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        onNavigationStateChange={(navState) => {
          console.log('[AutoSync] Nav:', navState.url, 'loading:', navState.loading);
          if (!navState.loading) {
            // Redirected to login = session expired
            if (
              navState.url.includes('Login') ||
              navState.url.includes('login') ||
              navState.url.includes('Default.aspx')
            ) {
              console.log('[AutoSync] Session expired — redirected to login');
              sessionExpired();
              return;
            }
            // Inject saved cookies, then scrape
            setTimeout(() => {
              webViewRef.current?.injectJavaScript(cookieInjectScript);
              setTimeout(() => {
                webViewRef.current?.injectJavaScript(ATTENDANCE_SCRIPT);
              }, 500);
            }, 2000);
          }
        }}
        onError={(e) => { console.log('[AutoSync] Error:', e.nativeEvent.description); finish(false); }}
        onHttpError={(e) => { console.log('[AutoSync] HTTP Error:', e.nativeEvent.statusCode); finish(false); }}
        onRenderProcessGone={() => finish(false)}
        onMessage={handleMessage}
      />
    </View>
  );
}
