import React, { useRef, useState, useEffect } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStudyOSStore } from '../store/studyosStore';
import * as SecureStore from 'expo-secure-store';

const ATTENDANCE_URL = 'https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx?type=etgkYfqBdH1fSfc255iYGw==';

const getAttendanceUrl = () => ATTENDANCE_URL;

// Persisted signature = single source of truth for "did attendance really
// change?". Survives tab refocus + app restart, which kills the repeated
// "marked present" spam from ASP.NET parse jitter / partial (empty) scrapes.
const LAST_NOTIF_SIG_KEY = 'studyos_last_notif_sig';

const ATTENDANCE_SCRIPT = `
  (function executeWhenReady() {
    if (!window.ReactNativeWebView) {
      setTimeout(executeWhenReady, 500);
      return;
    }
    try {
      var attendanceData = {};

      // Find the VIEW/postback control in a summary row. Rows expose it as a
      // named submit, a __doPostBack link, or only via an 'obj'/id attribute.
      function viewActionTargetOf(row) {
        var viewBtn = row.querySelector('input[value="VIEW"], input[value="View"], input[type="button"][chk]');
        
        // New API format (UID in hidden input, course in chk attribute)
        if (viewBtn && viewBtn.getAttribute('chk')) {
           var chkVal = viewBtn.getAttribute('chk');
           var hiddenInp = row.querySelector('input[type="hidden"]');
           if (hiddenInp && hiddenInp.value) {
              return hiddenInp.value + "|" + chkVal;
           }
        }
        
        // Fallbacks for older formats
        if (viewBtn) {
           if (viewBtn.name) return viewBtn.name;
           var ocb = viewBtn.getAttribute('onclick');
           if (ocb && ocb.indexOf('__doPostBack') > -1) {
              var mb = ocb.match(/__doPostBack\\('([^']+)'/);
              if (mb) return mb[1];
           }
        }
        var linkBtns = row.querySelectorAll('a, input, button');
        for (var k = 0; k < linkBtns.length; k++) {
           if (linkBtns[k].name && (linkBtns[k].name.indexOf('ctl00$') > -1 || linkBtns[k].name.indexOf('btn') > -1)) return linkBtns[k].name;
           if (linkBtns[k].href && linkBtns[k].href.indexOf('__doPostBack') > -1) {
              var mh = linkBtns[k].href.match(/__doPostBack\\('([^']+)'/);
              if (mh) return mh[1];
           }
           var oc = linkBtns[k].getAttribute('onclick');
           if (oc && oc.indexOf('__doPostBack') > -1) {
              var mo = oc.match(/__doPostBack\\('([^']+)'/);
              if (mo) return mo[1];
           }
        }
        // Last resort: any clickable carrying a name/id (the 'obj'-only rows the
        // DetailedAttendanceModal clicks successfully).
        var anyBtns = row.querySelectorAll('a, input, button, [obj]');
        for (var k2 = 0; k2 < anyBtns.length; k2++) {
           var el = anyBtns[k2];
           var tag = (el.tagName || '').toUpperCase();
           var typ = (el.getAttribute('type') || '').toLowerCase();
           if (tag === 'INPUT' && (typ === 'text' || typ === 'hidden' || typ === 'checkbox')) continue;
           if (el.name) return el.name;
           if (el.id) return el.id.replace(/_/g, '$');
        }
        
        // Debug logging!
        if (window.ReactNativeWebView) {
           var gd = typeof window.getdata === 'function' ? window.getdata.toString() : 'not found';
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'getdata function: ' + gd }));
        }
        
        return '';
      }

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
             // A course code can occupy more than one summary row. Keep the best
             // summary numbers, but remember EVERY row's VIEW target so the
             // detailed attendance of each row gets fetched.
             if (existing && viewActionTargetOf(rows[i])) {
               var extraT = viewActionTargetOf(rows[i]);
               if (existing.targets.indexOf(extraT) === -1) existing.targets.push(extraT);
             }
             if (!existing || (existing.total === 0 && total > 0)) {
               var viewActionTarget = viewActionTargetOf(rows[i]);
               
               var dataObj = { total: total, attended: attended, percentage: percentage, viewActionTarget: viewActionTarget, targets: [], records: [] };
               if (viewActionTarget) dataObj.targets.push(viewActionTarget);
               // Carry over targets already discovered for this code from a
               // previous (weaker) row so replacing the summary loses nothing.
               if (existing && existing.targets) {
                 for (var pt = 0; pt < existing.targets.length; pt++) {
                   if (dataObj.targets.indexOf(existing.targets[pt]) === -1) dataObj.targets.push(existing.targets[pt]);
                 }
               }
               if (code) attendanceData[code] = dataObj;
               if (altName) attendanceData[altName] = dataObj;
               if (altName2 && altName2 !== altName) attendanceData[altName2] = dataObj;
             }
          }
        }
      }
      
      // Step 1: INSTANT NOTIFICATION TO REACT NATIVE!
      // Send the summary immediately so pull-to-refresh spinner dismisses in ~1s!
      var summaryKeys = Object.keys(attendanceData);
      if (summaryKeys.length > 0 && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SILENT_ATTENDANCE_SUMMARY',
          data: attendanceData,
          cookie: document.cookie
        }));
      } else if (summaryKeys.length === 0 && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SILENT_ATTENDANCE_EMPTY',
          cookie: document.cookie
        }));
        return;
      }

      // Step 2: Fetch detailed attendance in background via internal API
      var keys = Object.keys(attendanceData);
      var queue = [];
      for (var i = 0; i < keys.length; i++) {
         var k = keys[i];
         var tl = attendanceData[k].targets || [];
         var attD = attendanceData[k];
         if (tl.length > 0 && attD.total > 0) {
            queue.push({ code: k, target: tl[0] });
         }
      }

      if (queue.length === 0) return;

      var pageUrl = window.location.href.split('?')[0] + '/GetFullReport';
      var Sel_Session = (document.querySelector('#ddlSession') && document.querySelector('#ddlSession').value) || (document.querySelector('#hfdbSelSes') && document.querySelector('#hfdbSelSes').value) || '';
      var typeFilter = (document.querySelector('#drpfilter') && document.querySelector('#drpfilter').value) || '0';

      function fetchDetailJSON(qItem) {
        // target is "uid_val|chk_val"
        var parts = qItem.target.split('|');
        var uidVal = parts[0];
        var chkVal = parts[1];

        var payload = JSON.stringify({
          course: chkVal,
          UID: uidVal,
          fromDate: "0",
          toDate: "0",
          type: typeFilter,
          Session: Sel_Session
        });

        var xhr = new XMLHttpRequest();
        xhr.open('POST', pageUrl, true);
        xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');

        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4 && xhr.status === 200) {
            try {
              var response = JSON.parse(xhr.responseText);
              var objData = JSON.parse(response.d.Result);
              var records = [];
              for(var j=0; j<objData.length; j++) {
                var r = objData[j];
                records.push({
                  date: r["AttDate"] || '',
                  type: r["AttendanceType"] || '',
                  time: r["Timing"] || '',
                  status: r["AttendanceCode"] || '',
                  markedBy: r["Name"] || ''
                });
              }
              if (window.ReactNativeWebView && records.length > 0) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'SILENT_ATTENDANCE_DETAILS',
                  code: qItem.code,
                  records: records
                }));
              }
            } catch(e) {}
          }
        };

        xhr.send(payload);
      }

      // Fire all requests in parallel in background!
      for (var q = 0; q < queue.length; q++) {
        fetchDetailJSON(queue[q]);
      }

    } catch(e) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SILENT_ATTENDANCE_ERROR', error: e.message || 'Unknown error' }));
      }
    }
  })();
  true;
`;

interface Props {
  onFinish?: (updated: boolean, changes?: { code?: string, subjectName: string, status: string, diffAtt?: number, diffTotal?: number, percentage?: number }[]) => void;
  onSessionExpired?: () => void;
}

export function AutoSyncAttendance({ onFinish, onSessionExpired }: Props) {
  const webViewRef = useRef<WebView>(null);
  const [cookieInjectScript, setCookieInjectScript] = useState<string | null>(null);
  const hasFinished = useRef(false);
  const hasInjectedScript = useRef(false);
  const [rawCookie, setRawCookie] = useState<string | null>(null);
  const setScrapedData = useStudyOSStore((s) => s.setScrapedData);

  const finish = (updated = false, changes: { code?: string, subjectName: string, status: string, diffAtt?: number, diffTotal?: number, percentage?: number }[] = []) => {
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

  const injectScraper = () => {
    if (hasInjectedScript.current) return;
    hasInjectedScript.current = true;
    if (cookieInjectScript) {
      webViewRef.current?.injectJavaScript(cookieInjectScript);
    }
    setTimeout(() => {
      webViewRef.current?.injectJavaScript(ATTENDANCE_SCRIPT);
    }, 150);
  };

  useEffect(() => {
    // Load saved cookies first
    SecureStore.getItemAsync('culko_cookies').then((cookies) => {
      if (cookies) {
        setRawCookie(cookies);
        const parts = cookies.split(';').map((c: string) => c.trim()).filter(Boolean);
        const lines = parts.map((c: string) => `document.cookie = ${JSON.stringify(c + '; path=/')};`).join('\n');
        setCookieInjectScript(lines + '\ntrue;');
        console.log('[AutoSync] Loaded', parts.length, 'saved cookies');
      } else {
        console.log('[AutoSync] No saved cookies — will attempt anyway');
        setRawCookie('');
        setCookieInjectScript('true;');
      }
    });

    // Safety timeout: 10s is plenty because summary is posted in <1s.
    const timer = setTimeout(() => finish(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  const handleMessage = async (event: any) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data);
      
      if (parsed.type === 'DEBUG') {
        console.log('[AutoSync DEBUG]', parsed.message);
        return;
      }

      if (parsed.type === 'SILENT_ATTENDANCE_EMPTY') {
        console.log('[AutoSync] Empty attendance table');
        finish(false, []);
        return;
      }

      if (parsed.type === 'SILENT_ATTENDANCE_DETAILS') {
        const { code, records } = parsed;
        if (code && records && records.length > 0) {
          const currentDetailedCache = useStudyOSStore.getState().detailedAttendanceCache || {};
          const newDetailedCache: Record<string, any[]> = { ...currentDetailedCache, [code]: records };
          const subjects = useStudyOSStore.getState().subjects || [];
          const matched = subjects.find((s: any) => s.code === code || s.name === code);
          if (matched && matched.code !== code) {
            newDetailedCache[matched.code] = records;
          }
          await useStudyOSStore.getState().setScrapedData({ detailedAttendanceCache: newDetailedCache });
        }
        return;
      }
      
      if (parsed.type === 'SILENT_ATTENDANCE_SUMMARY' || parsed.type === 'SILENT_ATTENDANCE') {
        const newData = parsed.data || {};
        const freshCookie = parsed.cookie || '';
        
        if (freshCookie) {
          await SecureStore.setItemAsync('culko_cookies', freshCookie).catch(() => {});
        }
        
        console.log('[AutoSync] Scraped attendance summary keys:', Object.keys(newData));

        if (Object.keys(newData).length > 0) {
          const { subjects, profile, timetable, marks } = useStudyOSStore.getState();
          let dataChanged = false;
          let changesDetected: { code?: string, subjectName: string, status: string, diffAtt?: number, diffTotal?: number, percentage?: number }[] = [];

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
              // Bad/partial scrape guard: never overwrite good cached data with empty row
              if (subj.totalClasses > 0 && att.total === 0 && att.attended === 0) {
                return subj;
              }
              const prevTotal = subj.totalClasses || 0;
              const prevAtt = subj.attendedClasses || 0;

              // Check for attendance event
              if (att.total > prevTotal) {
                const diffTotal = att.total - prevTotal;
                const diffAtt = att.attended - prevAtt;
                if (diffAtt >= diffTotal) {
                  changesDetected.push({ code: subj.code, subjectName: subj.name || subj.code, status: 'Present', diffAtt, diffTotal, percentage: att.percentage });
                } else if (diffAtt > 0 && diffAtt < diffTotal) {
                  changesDetected.push({ code: subj.code, subjectName: subj.name || subj.code, status: 'Present', diffAtt, diffTotal, percentage: att.percentage });
                  changesDetected.push({ code: subj.code, subjectName: subj.name || subj.code, status: 'Absent', diffAtt: diffTotal - diffAtt, diffTotal, percentage: att.percentage });
                } else {
                  changesDetected.push({ code: subj.code, subjectName: subj.name || subj.code, status: 'Absent', diffAtt: 0, diffTotal, percentage: att.percentage });
                }
              } else if (att.total === prevTotal && att.attended > prevAtt) {
                changesDetected.push({ code: subj.code, subjectName: subj.name || subj.code, status: 'Present', diffAtt: att.attended - prevAtt, diffTotal: 0, percentage: att.percentage });
              } else if (att.total === prevTotal && att.attended < prevAtt) {
                changesDetected.push({ code: subj.code, subjectName: subj.name || subj.code, status: 'Absent', diffAtt: 0, diffTotal: 0, percentage: att.percentage });
              }

              if (
                att.total !== prevTotal ||
                att.attended !== prevAtt ||
                att.percentage !== subj.attendancePercentage
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

          // Instantly persist the refreshed summary data to cache
          await setScrapedData({ profile, subjects: updatedSubjects, timetable, marks });

          const newSig = updatedSubjects
            .map((s: any) => `${s.code}:${s.attendedClasses}:${s.totalClasses}:${Math.round(s.attendancePercentage)}`)
            .sort()
            .join('|');

          const prevSig = (await AsyncStorage.getItem(LAST_NOTIF_SIG_KEY)) || '';

          if (prevSig === '') {
            // First sync after login/install: seed signature, never notify on echo.
            await AsyncStorage.setItem(LAST_NOTIF_SIG_KEY, newSig).catch(() => {});
            finish(false, []);
          } else if (newSig !== prevSig || changesDetected.length > 0) {
            await AsyncStorage.setItem(LAST_NOTIF_SIG_KEY, newSig).catch(() => {});
            finish(true, changesDetected);
          } else {
            finish(dataChanged, []);
          }
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

  if (cookieInjectScript === null || rawCookie === null) return null;

  return (
    <View style={{ width: 2, height: 2, opacity: 0, overflow: 'hidden' }}>
      <WebView
        ref={webViewRef}
        source={{ 
          uri: getAttendanceUrl(),
          ...(rawCookie ? { headers: { Cookie: rawCookie } } : {})
        }}
        injectedJavaScriptBeforeContentLoaded={cookieInjectScript || undefined}
        cacheEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        onNavigationStateChange={(navState) => {
          if (!navState.loading) {
            // Redirected to login = session expired
            if (
              navState.url.includes('Login') ||
              navState.url.includes('login') ||
              navState.url.includes('Default.aspx') ||
              navState.url.includes('error.html')
            ) {
              console.log('[AutoSync] Session expired — redirected to login');
              sessionExpired();
              return;
            }
            injectScraper();
          }
        }}
        onLoadEnd={() => {
          injectScraper();
        }}
        onError={(e) => { console.log('[AutoSync] Error:', e.nativeEvent.description); finish(false); }}
        onHttpError={(e) => { console.log('[AutoSync] HTTP Error:', e.nativeEvent.statusCode); finish(false); }}
        onRenderProcessGone={() => finish(false)}
        onMessage={handleMessage}
      />
    </View>
  );
}
