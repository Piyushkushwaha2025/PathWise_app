import React, { useRef, useState, useEffect } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStudyOSStore } from '../store/studyosStore';
import * as SecureStore from 'expo-secure-store';

const ATTENDANCE_URL = 'https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx?type=etgkYfqBdH1fSfc255iYGw==';

const getAttendanceUrl = () => `${ATTENDANCE_URL}&_t=${Date.now()}`;

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
        var viewBtn = row.querySelector('input[value="VIEW"], input[value="View"], input[type="submit"]');
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
      
      // Step 2: Extract detailed attendance by literally clicking VIEW, waiting, scraping, and clicking BACK
      var keys = Object.keys(attendanceData);
      var queue = [];
      for (var i = 0; i < keys.length; i++) {
         var k = keys[i];
         var tl = attendanceData[k].targets || [];
         if (tl.length > 0) {
            queue.push({ code: k, target: tl[0] });
         }
      }
      
      var currentIdx = 0;
      
      function waitForTable(type, callback) {
          var attempts = 0;
          var interval = setInterval(function() {
              attempts++;
              var tables = document.querySelectorAll('table');
              var found = null;
              for (var t = 0; t < tables.length; t++) {
                  var txt = tables[t].textContent || '';
                  if (type === 'detail' && (txt.indexOf('Marked By') > -1 || txt.indexOf('Time') > -1)) {
                      found = tables[t];
                      break;
                  }
                  if (type === 'summary' && txt.indexOf('Total Delivered') > -1 && txt.indexOf('Marked By') === -1) {
                      found = tables[t];
                      break;
                  }
              }
              
              if (found) {
                  clearInterval(interval);
                  callback(found);
              } else if (attempts > 30) { // 15 seconds max wait
                  clearInterval(interval);
                  callback(null);
              }
          }, 500);
      }
      
      function processNext() {
          if (currentIdx >= queue.length) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SILENT_ATTENDANCE', data: attendanceData, cookie: document.cookie, done: true }));
              return;
          }
          
          var qItem = queue[currentIdx];
          var cleanCode = qItem.code.replace(/^[A-Z]+_/, '').trim().toUpperCase();
          
          // 1. Find the button to click for this subject on the summary page
          var btn = document.querySelector('[name="' + qItem.target + '"], [id="' + qItem.target + '"]');
          if (!btn) {
              var allBtns = document.querySelectorAll('input, button, a, [obj]');
              for(var b = 0; b < allBtns.length; b++) {
                  var obj = (allBtns[b].getAttribute('obj') || '').toUpperCase();
                  if (obj && obj.includes(cleanCode)) {
                      btn = allBtns[b];
                      break;
                  }
              }
          }
          
          if (!btn) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'Button not found for ' + qItem.code }));
              currentIdx++;
              setTimeout(processNext, 500);
              return;
          }
          
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'Clicking VIEW for ' + qItem.code }));
          
          // 2. Click it! (Triggers ASP.NET UpdatePanel)
          btn.click();
          
          // 3. Wait for Details Table
          waitForTable('detail', function(detailTable) {
              if (detailTable) {
                  var records = [];
                  var rows = detailTable.querySelectorAll('tr');
                  for (var r = 1; r < rows.length; r++) {
                      var cells = rows[r].querySelectorAll('td');
                      if(cells.length < 4) continue;
                      var dt = (cells[1] ? cells[1].textContent.trim() : '');
                      var up = dt.toUpperCase();
                      if (!dt || up === 'TITLE' || up === 'COURSE CODE' || up === 'DATE') continue;
                      records.push({
                          date: dt,
                          type: cells[2] ? cells[2].textContent.trim() : '',
                          time: cells[3] ? cells[3].textContent.trim() : '',
                          status: cells[4] ? cells[4].textContent.trim() : (cells[2] ? cells[2].textContent.trim() : ''),
                          markedBy: cells[7] ? cells[7].textContent.trim() : (cells[5] ? cells[5].textContent.trim() : '')
                      });
                  }
                  
                  attendanceData[qItem.code].records = records;
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'Scraped ' + records.length + ' records for ' + qItem.code }));
              } else {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'Timeout waiting for detail table for ' + qItem.code }));
              }
              
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SILENT_ATTENDANCE', data: attendanceData, cookie: document.cookie, done: false }));
              
              // 4. Click BACK button
              var allInputs = document.querySelectorAll('input[type="submit"], input[type="button"], button');
              var backBtn = null;
              for(var b2 = 0; b2 < allInputs.length; b2++) {
                  var v = (allInputs[b2].value || '').toUpperCase();
                  var n = (allInputs[b2].name || '').toUpperCase();
                  if (v.indexOf('BACK') > -1 || n.indexOf('BACK') > -1) {
                      backBtn = allInputs[b2]; break;
                  }
              }
              
              if (backBtn) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DEBUG', message: 'Clicking BACK for ' + qItem.code }));
                  backBtn.click();
                  waitForTable('summary', function() {
                      currentIdx++;
                      setTimeout(processNext, 500);
                  });
              } else {
                  // If we didn't find back button, we might still be on summary page (e.g. click failed)
                  currentIdx++;
                  setTimeout(processNext, 500);
              }
          });
      }
      
      // Start the sequential UI scraping!
      processNext();

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
  const [rawCookie, setRawCookie] = useState<string | null>(null);
  const setScrapedData = useStudyOSStore((s) => s.setScrapedData);

  // Note: finish() only ends the UI's refresh spinner. Late interim messages
  // still persist their records, so a slow portal keeps filling the cache.
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

    // Safety timeout. Detail history is fetched one subject at a time (ASP.NET
    // VIEWSTATE forces it), so allow room for a full pass; interim messages have
    // already persisted whatever landed before this fires.
    const timer = setTimeout(() => finish(false), 60000);
    return () => clearTimeout(timer);
  }, []);

  const handleMessage = async (event: any) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data);
      
      if (parsed.type === 'DEBUG') {
        console.log('[AutoSync DEBUG]', parsed.message);
        return;
      }
      
      if (parsed.type === 'SILENT_ATTENDANCE') {
        const newData = parsed.data || {};
        const freshCookie = parsed.cookie || '';
        const isDone = parsed.done !== false;
        
        if (freshCookie) {
          await SecureStore.setItemAsync('culko_cookies', freshCookie).catch(() => {});
        }
        
        console.log('[AutoSync] Scraped attendance keys:', Object.keys(newData));
        console.log('[AutoSync] Scraped Data Dump:', JSON.stringify(newData, null, 2));
        console.log('[AutoSync] Current Subjects:', JSON.stringify(useStudyOSStore.getState().subjects.map((s:any) => s.code), null, 2));

        if (Object.keys(newData).length > 0) {
          const { subjects, profile, timetable, marks } = useStudyOSStore.getState();
          let dataChanged = false;
          let changesDetected: { code?: string, subjectName: string, status: string }[] = [];
          
          const currentDetailedCache = useStudyOSStore.getState().detailedAttendanceCache || {};
          const newDetailedCache = { ...currentDetailedCache };

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
              // Bad/partial scrape guard: never overwrite good cached data with a
              // zeroed row (ASP.NET postback sometimes returns an empty table).
              if (subj.totalClasses > 0 && att.total === 0 && att.attended === 0) {
                return subj;
              }
              const prevTotal = subj.totalClasses || 0;
              const prevAtt = subj.attendedClasses || 0;
              // Only a genuinely new class (total grew) is a real attendance event.
              if (att.total > prevTotal) {
                const diffTotal = att.total - prevTotal;
                const diffAtt = att.attended - prevAtt;
                const status = diffAtt >= diffTotal ? 'Present' : 'Absent';
                changesDetected.push({ code: subj.code, subjectName: subj.name || subj.code, status });
              }
              if (
                att.total !== prevTotal ||
                att.attended !== prevAtt ||
                att.percentage !== subj.attendancePercentage
              ) {
                dataChanged = true;
              }
              
              // This refresh's portal rows are the source of truth for this
              // subject — replace its history rather than merging into stale
              // entries, so a record removed on the portal disappears here too.
              if (att.records && att.records.length > 0) {
                 newDetailedCache[subj.code] = att.records;
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

          // Always persist the refreshed data to cache (ponytail: requirement
          // "save on every refresh"), then decide if a push is warranted.
          
          // Note: no synthetic records are ever injected into detailedAttendanceCache —
          // the UI blocks must reflect only real portal rows.

          await setScrapedData({ profile, subjects: updatedSubjects, timetable, marks, detailedAttendanceCache: newDetailedCache });

          const newSig = updatedSubjects
            .map((s: any) => `${s.code}:${s.attendedClasses}:${s.totalClasses}:${Math.round(s.attendancePercentage)}`)
            .sort()
            .join('|');
          // Interim message (one subject's history just landed): data is already
          // persisted above so the blocks light up progressively — but don't end
          // the sync or fire notifications until the final message arrives.
          if (!isDone) return;

          const prevSig = (await AsyncStorage.getItem(LAST_NOTIF_SIG_KEY)) || '';

          if (prevSig === '') {
            // First sync after login/install: seed signature, never notify on echo.
            await AsyncStorage.setItem(LAST_NOTIF_SIG_KEY, newSig).catch(() => {});
            finish(false);
          } else if (newSig !== prevSig) {
            await AsyncStorage.setItem(LAST_NOTIF_SIG_KEY, newSig).catch(() => {});
            finish(dataChanged, changesDetected);
          } else {
            finish(false);
          }
        } else if (isDone) {
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
        cacheEnabled={false}
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
              navState.url.includes('Default.aspx') ||
              navState.url.includes('error.html')
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
