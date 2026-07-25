import React, { useRef, useState, useEffect } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStudyOSStore } from '../store/studyosStore';
import * as SecureStore from 'expo-secure-store';

const ATTENDANCE_URL = 'https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx?type=etgkYfqBdH1fSfc255iYGw==';

const ATTENDANCE_SCRIPT = `
  try {
    var attendanceData = {};
    var rows = document.querySelectorAll('table tr');
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
         for(var j = 0; j < textArr.length; j++) {
            var clean = textArr[j].replace('%','').trim();
            if(clean !== '' && !isNaN(Number(clean)) && clean.length > 0) {
               numArr.push(Number(clean));
            }
         }
         if (numArr.length >= 2) {
            var percentage = numArr[numArr.length - 1];
            var attended = numArr[numArr.length - 2] || 0;
            var total = numArr[numArr.length - 3] || 0;
            var viewActionTarget = '';
            var viewBtn = rows[i].querySelector('input[value="VIEW"], input[value="View"], input[type="submit"]');
            if (viewBtn) {
               if (viewBtn.name) {
                  viewActionTarget = viewBtn.name;
               } else if (viewBtn.getAttribute('onclick') && viewBtn.getAttribute('onclick').includes('__doPostBack')) {
                  var match = viewBtn.getAttribute('onclick').match(/__doPostBack\('([^']+)'/);
                  if (match) viewActionTarget = match[1];
               }
            }
            if (!viewActionTarget) {
               var linkBtns = rows[i].querySelectorAll('a, input, button');
               for (var k = 0; k < linkBtns.length; k++) {
                  if (linkBtns[k].name && (linkBtns[k].name.includes('ctl00$') || linkBtns[k].name.includes('btn'))) {
                     viewActionTarget = linkBtns[k].name;
                     break;
                  }
                  if (linkBtns[k].href && linkBtns[k].href.includes('__doPostBack')) {
                     var match = linkBtns[k].href.match(/__doPostBack\('([^']+)'/);
                     if (match) { viewActionTarget = match[1]; break; }
                  }
                  var oc = linkBtns[k].getAttribute('onclick');
                  if (oc && oc.includes('__doPostBack')) {
                     var match = oc.match(/__doPostBack\('([^']+)'/);
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
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SILENT_ATTENDANCE', data: attendanceData, cookie: document.cookie }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SILENT_ATTENDANCE', data: {}, error: e.message }));
  }
  true;
`;

interface Props {
  onFinish?: (updated: boolean) => void;
  onSessionExpired?: () => void;
}

export function AutoSyncAttendance({ onFinish, onSessionExpired }: Props) {
  const webViewRef = useRef<WebView>(null);
  const setScrapedData = useStudyOSStore((s) => s.setScrapedData);
  const hasFinished = useRef(false);
  const [cookieInjectScript, setCookieInjectScript] = useState<string | null>(null);

  const finish = (updated = false) => {
    if (!hasFinished.current) {
      hasFinished.current = true;
      if (onFinish) onFinish(updated);
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
        
        console.log('[AutoSync] Scraped attendance keys:', Object.keys(newData).length);

        if (Object.keys(newData).length > 0) {
          const { subjects, profile, timetable, marks } = useStudyOSStore.getState();
          let dataChanged = false;

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
                att.total !== subj.totalClasses ||
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
          console.log('[AutoSync] Store updated. Data changed:', dataChanged);
          finish(dataChanged);
        } else {
          console.log('[AutoSync] No data scraped');
          finish(false);
        }
      }
    } catch (e) {
      console.log('[AutoSync] handleMessage error:', e);
      finish(false);
    }
  };

  if (cookieInjectScript === null) return null;

  return (
    <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute', left: -9999 }}>
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
