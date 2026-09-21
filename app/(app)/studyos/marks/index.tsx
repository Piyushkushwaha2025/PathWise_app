import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Modal, ActivityIndicator, RefreshControl, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon, Line, Text as SvgText, Circle } from 'react-native-svg';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { useThemeStore } from '../../../../store/useThemeStore';
import { useStudyOSStore } from '../../../../store/studyosStore';
import { useStudySessionStore } from '../../../../store/studySessionStore';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const RADAR_SIZE = width - 180; // Adjusted size to make circle smaller
const CENTER = RADAR_SIZE / 2;
const RADIUS = (RADAR_SIZE / 2) - 35;

type RawSemester = { text: string; value: string };
type SemesterItem = { label: string; value: string | null; originalText: string };

// Pull a year + month out of a portal session label (e.g. "May 2024",
// "Dec 2023", "Winter 2024") so we can order sessions chronologically and
// number them Semester 1, 2, 3... from the oldest.
function parseSession(text: string): { year: number; month: number } {
  const y = text.match(/(20\d{2})/);
  const year = y ? parseInt(y[1], 10) : 0;
  const lower = text.toLowerCase();
  let month = 6;
  if (lower.includes('may') || lower.includes('summer') || lower.includes('odd')) month = 5;
  else if (lower.includes('dec') || lower.includes('nov') || lower.includes('winter') || lower.includes('even')) month = 12;
  else if (lower.includes('jan')) month = 1;
  else if (lower.includes('jul')) month = 7;
  return { year, month };
}

function buildSemesterList(raw: RawSemester[]): SemesterItem[] {
  const sorted = [...raw].sort((a, b) => {
    const A = parseSession(a.text);
    const B = parseSession(b.text);
    if (A.year !== B.year) return A.year - B.year;
    return A.month - B.month;
  });

  const list: SemesterItem[] = sorted.map((opt, i) => ({
    label: `Semester ${i + 1}`,
    value: opt.value,
    originalText: opt.text,
  }));

  // Append the current/ongoing semester (since it hasn't appeared in the portal's Results dropdown yet)
  list.push({
    label: `Semester ${list.length + 1} (Current)`,
    value: null,
    originalText: 'Current Session'
  });

  return list;
}

export default function MarksScreen() {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';
  const styles = useStyles(colors, isDark);
  const { marks, subjects, semesterOptionsCache, resultCache, setScrapedData } = useStudyOSStore();
  const { clearSession } = useStudySessionStore();
  const router = useRouter();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Results State
  const webViewRef = useRef<WebView>(null);
  const [semesterOptions, setSemesterOptions] = useState<{text: string, value: string}[]>(semesterOptionsCache || []);
  const [selectedSemester, setSelectedSemester] = useState<string>('');
  const [resultData, setResultData] = useState<{sgpa: string, subjects: any[]} | null>(null);
  const [isLoading, setIsLoading] = useState(semesterOptionsCache?.length ? false : true);

  // Semester picker list: real portal sessions only, relabelled "Semester N"
  // in chronological order. Unuploaded (future) semesters are not shown.
  const derivedSemesters = useMemo(
    () => buildSemesterList(semesterOptions),
    [semesterOptions]
  );

  // Latest (current) semester = last item in chronological list
  const latestSemValue = derivedSemesters.length > 0
    ? derivedSemesters[derivedSemesters.length - 1].value
    : null;

  const selectedSemIdx = derivedSemesters.findIndex(
    (d) => d.value === selectedSemester || d.label === selectedSemester
  );
  const selectedSemLabel = selectedSemIdx >= 0 ? derivedSemesters[selectedSemIdx].label : undefined;

  // True when user is on the latest/current semester
  const isCurrentSemester = !selectedSemester || selectedSemIdx === derivedSemesters.length - 1;

  // (Removed auto-select so it defaults to the empty 'Result' state for current semester)

  useFocusEffect(
    React.useCallback(() => {
      if (!didMountRef.current) {
        didMountRef.current = true;
        return;
      }

      // Returning to marks tab — just snap to the latest (Current) semester silently.
      const currentOptions = useStudyOSStore.getState().semesterOptionsCache || [];
      
      setResultData(null);
      setIsLoading(false); 
      setRefreshing(false);
    }, [])
  );

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const cookieScript = useRef<string>('');
  const injectAndScrapeRef = useRef<() => void>(() => {});
  const injectAndScrapeMarksRef = useRef<() => void>(() => {});
  const marksWebViewRef = useRef<WebView>(null);
  const didMountRef = useRef(false);

  // Load saved cookies once on mount
  useEffect(() => {
    SecureStore.getItemAsync('culko_cookies').then((cookies) => {
      if (cookies) {
        const parts = cookies.split(';').map((c: string) => c.trim()).filter(Boolean);
        const lines = parts.map((c: string) => `document.cookie = ${JSON.stringify(c + '; path=/')};`).join('\n');
        cookieScript.current = lines + '\ntrue;';
      }
    });
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setIsLoading(true);
    setResultData(null);
    webViewRef.current?.reload();
    marksWebViewRef.current?.reload();
  }, []);

  // Grade → approximate percentage for radar (based on CU grading scale)
  const GRADE_TO_PCT: Record<string, number> = {
    'O': 95, 'A+': 88, 'A': 78, 'B+': 68, 'B': 58,
    'C+': 53, 'C': 48, 'P': 38, 'F': 0, 'E': 0, 'AB': 0, 'I': 0,
  };

  // Radar data for current semester (internal marks)
  const internalChartData = subjects?.length > 0 ? subjects.map(s => {
    const m = marks?.find(mark =>
      mark.subjectName.toLowerCase() === s.name.toLowerCase() ||
      mark.subjectName.toLowerCase().includes(s.name.toLowerCase()) ||
      s.name.toLowerCase().includes(mark.subjectName.toLowerCase())
    );
    let totalObtained = 0, totalMax = 0, hasValidMarks = false;
    if (m) {
      if (m.mstMarks?.includes('/')) {
        const p = m.mstMarks.split('/');
        if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
          totalObtained += parseFloat(p[0]); totalMax += parseFloat(p[1]); hasValidMarks = true;
        }
      }
      if (m.practicalMarks?.includes('/')) {
        const p = m.practicalMarks.split('/');
        if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
          totalObtained += parseFloat(p[0]); totalMax += parseFloat(p[1]); hasValidMarks = true;
        }
      }
    }
    const score = hasValidMarks && totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    const cleanedName = s.name.replace(/\s*\(?(theory|practical)\)?/gi, '').trim();
    return { subject: cleanedName, score: isNaN(score) ? 0 : score, hasMarks: hasValidMarks };
  }) : marks?.length > 0 ? marks.map(m => {
    let totalObtained = 0, totalMax = 0, hasValidMarks = false;
    if (m.mstMarks?.includes('/')) {
      const p = m.mstMarks.split('/');
      if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
        totalObtained += parseFloat(p[0]); totalMax += parseFloat(p[1]); hasValidMarks = true;
      }
    }
    if (m.practicalMarks?.includes('/')) {
      const p = m.practicalMarks.split('/');
      if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
        totalObtained += parseFloat(p[0]); totalMax += parseFloat(p[1]); hasValidMarks = true;
      }
    }
    const score = hasValidMarks && totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    const cleanedName = m.subjectName.replace(/\s*\(?(theory|practical)\)?/gi, '').trim();
    return { subject: cleanedName, score: isNaN(score) ? 0 : score, hasMarks: hasValidMarks };
  }) : [{ subject: 'No Data', score: 0, hasMarks: false }];

  // Radar data for previous semesters (from final result grades)
  const resultChartData = useMemo(() => {
    if (!resultData?.subjects?.length) return null;
    return resultData.subjects.map(sub => ({
      subject: (sub.name || sub.code || '').replace(/\s*\(?(theory|practical)\)?/gi, '').trim(),
      score: GRADE_TO_PCT[sub.grade?.trim().toUpperCase() || ''] ?? 50,
      hasMarks: !!sub.grade,
    }));
  }, [resultData]);

  // Active chart: previous semester → use grade-based radar. Current → internal marks.
  const chartData = (!isCurrentSemester && resultChartData) ? resultChartData : internalChartData;


  const extractScript = `
    try {
      if (window.location.href.toLowerCase().includes('login.aspx') || window.location.href.toLowerCase().includes('login')) {
         window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'RESULT_DATA', error: 'SESSION_EXPIRED' }));
      } else {
        var resultType = document.querySelector('select[name*="ddlResultType"]');
        if (resultType && resultType.value !== "Session") {
           resultType.value = "Session";
           if (typeof __doPostBack === 'function') {
              __doPostBack(resultType.name, '');
           }
           // Return early, the page will reload
           window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'RESULT_DATA', options: [], pendingPostback: true }));
        } else {
         var ddl = document.querySelector('select[name*="ddlSession"]') || document.querySelector('select[name*="Session"]');
         var options = [];
         if (ddl) {
           for (var i = 0; i < ddl.options.length; i++) {
             options.push({ text: ddl.options[i].text, value: ddl.options[i].value });
           }
         }
         
         var sgpa = '';
         var bodyText = document.body.innerText;
         var match = bodyText.match(/(?:S\.?G\.?P\.?A\.?|C\.?G\.?P\.?A\.?|GPA)\s*[:\-\=]?\s*([0-9]{1,2}\.[0-9]{1,3})/i);
         if (match) {
            sgpa = match[1];
         } else {
            var sgpaEl = document.querySelector('input[name*="SGPA" i], input[id*="SGPA" i], span[id*="lblSGPA" i], span[id*="lblCGPA" i]');
            if (sgpaEl) {
               sgpa = sgpaEl.value || sgpaEl.innerText;
            } else {
               var spans = document.querySelectorAll('span, td, div');
               for(var k=0; k<spans.length; k++) {
                  var text = spans[k].innerText;
                  if(text && (text.includes('SGPA') || text.includes('CGPA') || text.includes('GPA'))) {
                     var m = text.match(/(?:S\.?G\.?P\.?A\.?|C\.?G\.?P\.?A\.?|GPA)\s*[:\-\=]?\s*([0-9]{1,2}\.[0-9]{1,3})/i);
                     if (m) {
                        sgpa = m[1];
                        break;
                     }
                  }
               }
            }
         }
         
         var sgpaDebug = '';
         if (!sgpa) {
            var els = Array.from(document.querySelectorAll('*')).filter(el => el.innerText && el.innerText.includes('SGPA') && el.children.length === 0);
            if (els.length > 0) {
               sgpaDebug = els[els.length - 1].parentElement ? els[els.length - 1].parentElement.innerHTML : els[els.length - 1].innerHTML;
            }
         }
      
      var subjects = [];
      var trs = document.querySelectorAll('table tr');
      var debugRows = [];
      for (var i = 0; i < trs.length; i++) {
         var tds = Array.from(trs[i].children).filter(function(el) {
            return el.tagName.toUpperCase() === 'TD' || el.tagName.toUpperCase() === 'TH';
         });
         var textArr = tds.map(t => t.innerText.trim());
         if (textArr.length > 0) {
            debugRows.push(textArr.join(' | '));
         }
         
         var codeIndex = textArr.findIndex(t => /^[0-9A-Z]{2,7}-[0-9]{3}/.test(t));
         if (codeIndex !== -1 && textArr.length >= codeIndex + 3) {
            var code = textArr[codeIndex];
            var name = textArr[codeIndex + 1];
            
            var grade = '';
            var credit = '0';
            
            for (var j = textArr.length - 1; j > codeIndex + 1; j--) {
               var val = textArr[j].toUpperCase();
               if (/^(O|A\\+|A|B\\+|B|C\\+|C|D|E|F|P|AB|I|DT|UMC\\*?)$/.test(val)) {
                  grade = textArr[j]; // Keep original case
                  var beforeGrade = textArr[j - 1];
                  if (!isNaN(parseFloat(beforeGrade))) {
                     credit = beforeGrade;
                  } else if (j - 2 > codeIndex && !isNaN(parseFloat(textArr[j - 2]))) {
                     credit = textArr[j - 2];
                  }
                  break;
               }
            }
            
            var internal = '';
            var external = '';
            if (codeIndex + 2 < textArr.length && textArr[codeIndex + 2] !== credit && textArr[codeIndex + 2] !== grade) {
               internal = textArr[codeIndex + 2];
            }
            if (codeIndex + 3 < textArr.length && textArr[codeIndex + 3] !== credit && textArr[codeIndex + 3] !== grade) {
               external = textArr[codeIndex + 3];
            }
            
            if (grade) {
               subjects.push({ code: code, name: name, credit: credit, grade: grade, internal: internal, external: external });
            }
         }
      }
      
      if (!sgpa && subjects.length > 0) {
         var totalCredits = 0;
         var totalPoints = 0;
         var gradeMap = {
            'O': 10, 'A+': 10, 'A': 9, 'B+': 8, 'B': 7, 'C+': 6, 'C': 5, 'P': 4, 'F': 0, 'E': 0, 'UMC': 0, 'UMC*': 0
         };
         for(var s=0; s<subjects.length; s++) {
            var cred = parseFloat(subjects[s].credit);
            var grd = subjects[s].grade ? subjects[s].grade.trim().toUpperCase() : '';
            if (!isNaN(cred) && gradeMap.hasOwnProperty(grd)) {
               totalCredits += cred;
               totalPoints += (cred * gradeMap[grd]);
            }
         }
         if (totalCredits > 0) {
            sgpa = (totalPoints / totalCredits).toFixed(2);
         }
      }
      
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'RESULT_DATA',
          options: options,
          sgpa: sgpa,
          subjects: subjects,
          selected: ddl ? ddl.value : '',
          debugSgpa: sgpaDebug,
          debugRows: debugRows
        }));
        } // CLOSE ELSE BLOCK FOR RESULT TYPE
      } // CLOSE ELSE BLOCK FOR LOGIN
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'RESULT_DATA',
        error: e.toString()
      }));
    }
    true;
  `;

  const extractMarksScript = `
    try {
      if (window.location.href.toLowerCase().includes('login.aspx') || window.location.href.toLowerCase().includes('login')) {
         window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'INTERNAL_MARKS', error: 'SESSION_EXPIRED' }));
      } else {
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
         window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'INTERNAL_MARKS', data: marksData }));
      }
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'INTERNAL_MARKS', error: e.toString() }));
    }
    true;
  `;

  injectAndScrapeMarksRef.current = () => {
    if (cookieScript.current) {
      marksWebViewRef.current?.injectJavaScript(cookieScript.current);
      setTimeout(() => marksWebViewRef.current?.injectJavaScript(extractMarksScript), 500);
    } else {
      marksWebViewRef.current?.injectJavaScript(extractMarksScript);
    }
  };

  injectAndScrapeRef.current = () => {
    if (cookieScript.current) {
      webViewRef.current?.injectJavaScript(cookieScript.current);
      setTimeout(() => webViewRef.current?.injectJavaScript(extractScript), 500);
    } else {
      webViewRef.current?.injectJavaScript(extractScript);
    }
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'RESULT_DATA') {
        if (data.pendingPostback) {
           return; // wait for reload
        }
        if (data.error === 'SESSION_EXPIRED') {
           Alert.alert(
             'Session Expired',
             'Your college portal session has expired. Logout and re-login to view marks.',
             [
               { text: 'Later', style: 'cancel' },
               {
                 text: 'Logout & Re-login',
                 style: 'destructive',
                 onPress: async () => { await clearSession(true); router.replace('/(app)' as any); }
               }
             ]
           );
           setIsLoading(false);
           setRefreshing(false);
           return;
        }
        if (data.error) {
           console.log("RESULT PAGE SCRIPT ERROR:", data.error);
        }
        if (data.debugSgpa) {
           console.log("RESULT PAGE SGPA DEBUG HTML:", data.debugSgpa);
        }
        if (data.debugRows) {
           console.log("RESULT PAGE DEBUG ROWS:", data.debugRows);
        }
        if (data.options && data.options.length > 0) {
          setSemesterOptions(data.options);
          setScrapedData({ semesterOptionsCache: data.options });
        }
        
        if (data.subjects && data.subjects.length > 0) {
           const currentSelected = data.selected || selectedSemester;
           setResultData({ sgpa: data.sgpa, subjects: data.subjects });
           if (currentSelected) {
               setScrapedData({ 
                 resultCache: { 
                   ...(resultCache || {}), 
                   [currentSelected]: { sgpa: data.sgpa, subjects: data.subjects } 
                 } 
               });
           }
        } else {
           setResultData(null);
        }
        setIsLoading(false);
        setRefreshing(false);
      } else if (data.type === 'INTERNAL_MARKS') {
        if (data.error) {
           console.log("INTERNAL MARKS SCRIPT ERROR:", data.error);
        }
        if (data.data && Array.isArray(data.data)) {
           setScrapedData({ marks: data.data });
        }
        setIsLoading(false);
        setRefreshing(false);
      }
    } catch (e) {}
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    console.log("MARKS WEBVIEW NAV:", navState.url, navState.loading);
    if (!navState.loading) {
      if (navState.url.includes('Login') || navState.url.includes('login')) {
        setIsLoading(false);
        setRefreshing(false);
        useStudySessionStore.getState().setSessionExpired(true);
        return;
      }
      setTimeout(() => injectAndScrapeRef.current(), 2000);
    }
  };

  const handleMarksNavigationStateChange = (navState: WebViewNavigation) => {
    if (!navState.loading) {
      setTimeout(() => injectAndScrapeMarksRef.current(), 2000);
    }
  };

  
  useFocusEffect(
    React.useCallback(() => {
      // Reset to default internal marks / result button when returning to tab
      setSelectedSemester('');
      setResultData(null);
    }, [])
  );

  const selectSemester = (item: SemesterItem) => {
    // Upcoming semester that has no portal data yet — just show it as selected
    // with an empty result, no postback needed.
    if (item.value === null) {
      setIsModalVisible(false);
      setSelectedSemester(item.label);
      setResultData(null);
      setIsLoading(false);
      setRefreshing(false);
      return;
    }

    if (item.value === 'RECONNECT') {
       setIsModalVisible(false);
       clearSession();
       router.replace('/(app)' as any);
       return;
    }

    const value = item.value;
    setIsModalVisible(false);
    setSelectedSemester(value);
    
    // Instant cache hit
    if (resultCache && resultCache[value]) {
       setResultData(resultCache[value]);
       setIsLoading(false);
    } else {
       setIsLoading(true);
       setResultData(null);
    }

    webViewRef.current?.injectJavaScript(`
      try {
        var ddl = document.querySelector('select[name*="ddlSession"]') || document.querySelector('select[name*="Session"]');
        if (ddl) {
          ddl.value = '${value}';
          // Trigger the form submit button instead of just changing the dropdown!
          var btn = document.querySelector('input[type="submit"][name*="btnShowResult"], input[type="submit"][value*="Show Result"]');
          if (btn) {
             btn.click();
          } else {
             if (typeof __doPostBack === 'function') {
                __doPostBack(ddl.name, '');
             }
          }
        }
      } catch(e) {}
        true;
    `);

    // Re-scrape the result table after the postback updates the DOM.
    // AJAX/__doPostBack updates often do NOT trigger onNavigationStateChange,
    // so without this the new semester's result would only appear after a
    // manual pull-to-refresh. We run the extract script after a short delay.
    if (!resultCache || !resultCache[value]) {
      setTimeout(() => injectAndScrapeRef.current(), 2500);
    }
  };

  let grandTotalObtained = 0;
  let grandTotalMax = 0;
  
  if (marks && marks.length > 0) {
     marks.forEach(item => {
        if (item.mstMarks && item.mstMarks.includes('/')) {
           const p = item.mstMarks.split('/');
           if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
              grandTotalObtained += parseFloat(p[0]);
              grandTotalMax += parseFloat(p[1]);
           }
        }
        if (item.practicalMarks && item.practicalMarks.includes('/')) {
           const p = item.practicalMarks.split('/');
           if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
              grandTotalObtained += parseFloat(p[0]);
              grandTotalMax += parseFloat(p[1]);
           }
        }
     });
  }
  const overallPercentage = grandTotalMax > 0 ? ((grandTotalObtained / grandTotalMax) * 100).toFixed(1) + '%' : '';

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Modern Ambient Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Ionicons name="sparkles" size={13} color={colors.primary} />
              <Text style={[styles.headerCategory, { color: colors.primary }]}>ACADEMIC PERFORMANCE</Text>
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>Marks & Results</Text>
          </View>

          {/* Semester Selector Pill Button */}
          <TouchableOpacity 
            style={styles.semesterBtn} 
            onPress={() => {
              if (isLoading && semesterOptions.length === 0) return;
              try { Haptics.selectionAsync(); } catch {}
              setIsModalVisible(true);
            }}
            activeOpacity={isLoading && semesterOptions.length === 0 ? 1 : 0.75}
          >
            <Ionicons name="trophy-outline" size={14} color={colors.primary} />
            <Text style={styles.semesterBtnText} numberOfLines={1}>
              {(isLoading && semesterOptions.length === 0) 
                ? 'Loading...' 
                : (selectedSemLabel ? selectedSemLabel : 'Result')}
            </Text>
            <Ionicons name="chevron-down" size={13} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Glass Radar Console Card */}
        <View style={styles.radarCardWrapper}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.02)']
                : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.82)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.radarGradient,
              {
                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                borderTopColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.95)',
              }
            ]}
          >
            <View style={styles.radarTopRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.radarCardTitle, { color: colors.text }]}>Subject Strength Analysis</Text>
              </View>
              <View style={[styles.radarScopeBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                <Text style={[styles.radarScopeText, { color: colors.textMuted }]}>
                  {isCurrentSemester ? 'Internal Score' : 'Grade Points'}
                </Text>
              </View>
            </View>

            <View style={styles.radarContainer}>
              <RadarChart data={chartData} />
            </View>

            {/* Radar Bottom Summary Capsule */}
            <View style={[
              styles.radarBottomBar, 
              { 
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)', 
                borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)' 
              }
            ]}>
              {isCurrentSemester ? (
                <>
                  <View style={styles.radarStatItem}>
                    <Ionicons name="pie-chart-outline" size={13} color={colors.primary} />
                    <Text style={styles.radarStatLabel}>Overall:</Text>
                    <Text style={[styles.radarStatValue, { color: colors.primary }]}>{overallPercentage || 'Pending'}</Text>
                  </View>
                  <View style={styles.radarStatDivider} />
                  <View style={styles.radarStatItem}>
                    <Ionicons name="layers-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.radarStatLabel}>Evaluated:</Text>
                    <Text style={styles.radarStatValue}>{marks?.length || 0} Subjects</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.radarStatItem}>
                    <Ionicons name="ribbon-outline" size={13} color={colors.primary} />
                    <Text style={styles.radarStatLabel}>SGPA:</Text>
                    <Text style={[styles.radarStatValue, { color: colors.primary }]}>{resultData?.sgpa || 'N/A'}</Text>
                  </View>
                  <View style={styles.radarStatDivider} />
                  <View style={styles.radarStatItem}>
                    <Ionicons name="school-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.radarStatLabel}>Total:</Text>
                    <Text style={styles.radarStatValue}>{resultData?.subjects?.length || 0} Subjects</Text>
                  </View>
                </>
              )}
            </View>
          </LinearGradient>
        </View>

        {isLoading && (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.textMuted, marginTop: 12, fontFamily: 'Inter_500Medium', fontSize: 13 }}>
              Fetching transcripts from portal...
            </Text>
          </View>
        )}

        {/* Results View for Past Semester */}
        {resultData && resultData.subjects.length > 0 && !isLoading && (
          <View style={styles.listContainer}>
            {/* Hero SGPA Trophy Capsule */}
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(59, 130, 246, 0.18)', 'rgba(59, 130, 246, 0.04)']
                  : ['#eff6ff', '#dbeafe']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.sgpaHeroCard,
                {
                  borderColor: isDark ? 'rgba(59, 130, 246, 0.35)' : '#bfdbfe',
                  borderTopColor: isDark ? 'rgba(59, 130, 246, 0.60)' : '#93c5fd',
                }
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Ionicons name="ribbon" size={15} color={colors.primary} />
                  <Text style={[styles.sgpaHeroCategory, { color: colors.primary }]}>SEMESTER SGPA</Text>
                </View>
                <Text style={[styles.sgpaHeroScore, { color: colors.text }]}>{resultData.sgpa || 'N/A'}</Text>
                <Text style={styles.sgpaHeroSub}>{resultData.subjects.length} Course Subjects Evaluated</Text>
              </View>

              <View style={[styles.sgpaTrophyCircle, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40' }]}>
                <Ionicons name="trophy" size={26} color={colors.primary} />
              </View>
            </LinearGradient>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.listTitle}>Course Grades</Text>
              <View style={[styles.subjectCountChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                <Text style={[styles.subjectCountText, { color: colors.textMuted }]}>{resultData.subjects.length} Subjects</Text>
              </View>
            </View>

            {resultData.subjects.map((sub, i) => (
              <ResultSubjectCard key={`res-${i}`} sub={sub} isDark={isDark} colors={colors} />
            ))}
          </View>
        )}

        {/* Current Semester: Internal Marks List */}
        {isCurrentSemester && (
          <View style={styles.listContainer}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.listTitle}>Internal Marks</Text>
                <Text style={styles.sectionSubTitle}>MST & practical assessment components</Text>
              </View>
              {overallPercentage ? (
                <View style={styles.overallBadge}>
                  <Text style={styles.overallBadgeText}>{overallPercentage}</Text>
                </View>
              ) : null}
            </View>

            {marks && marks.length > 0 ? (
              marks.map((item, index) => {
                const isExpanded = expandedIndex === index;
                return (
                  <InternalMarkAccordion
                    key={index.toString()}
                    item={item}
                    index={index}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedIndex(isExpanded ? null : index)}
                    isDark={isDark}
                    colors={colors}
                  />
                );
              })
            ) : (
              <View style={styles.emptyInternalCard}>
                <LinearGradient
                  colors={
                    isDark
                      ? ['rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.01)']
                      : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.82)']
                  }
                  style={styles.emptyInternalGradient}
                >
                  <View style={[styles.emptyIconCircle, { backgroundColor: colors.primary + '18' }]}>
                    <Ionicons name="document-text-outline" size={32} color={colors.primary} />
                  </View>
                  <Text style={[styles.emptyInternalTitle, { color: colors.text }]}>No Marks Uploaded Yet</Text>
                  <Text style={styles.emptyInternalDesc}>
                    There are no internal marks uploaded on CUIMS for the current session yet. Select a past semester from the top to view final results.
                  </Text>
                </LinearGradient>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modern Frosted Semester Modal */}
      <Modal visible={isModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={() => setIsModalVisible(false)} 
          />
          <View style={[styles.modalContent, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
            <View style={styles.modalDragHandle} />

            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Select Semester</Text>
                <Text style={styles.modalSub}>View internal or semester end transcripts</Text>
              </View>
              <TouchableOpacity 
                onPress={() => setIsModalVisible(false)} 
                style={[styles.modalCloseCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
              {derivedSemesters.map((opt, i) => {
                const isSel = selectedSemLabel === opt.label;
                const isMay = opt.originalText.toLowerCase().includes('may') || opt.originalText.toLowerCase().includes('odd');
                const isDec = opt.originalText.toLowerCase().includes('dec') || opt.originalText.toLowerCase().includes('even') || opt.originalText.toLowerCase().includes('nov');
                const accentColor = isMay ? '#f59e0b' : isDec ? '#3b82f6' : colors.primary;
                return (
                  <TouchableOpacity
                    key={i.toString()}
                    activeOpacity={0.75}
                    style={[
                      styles.modalOptionCard,
                      {
                        backgroundColor: isSel 
                          ? accentColor + '18' 
                          : (isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'),
                        borderColor: isSel ? accentColor : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'),
                      }
                    ]}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      selectSemester(opt);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={[styles.sessionIconBox, { backgroundColor: accentColor + '22', borderColor: accentColor + '40' }]}>
                        <Ionicons
                          name={isMay ? 'sunny-outline' : isDec ? 'snow-outline' : 'school-outline'}
                          size={18}
                          color={accentColor}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalOptionTitle, { color: isSel ? accentColor : colors.text }]}>
                          {opt.label}
                        </Text>
                        <Text style={styles.modalOptionSub}>
                          {isMay ? 'Summer Examination Session' : isDec ? 'Winter Examination Session' : opt.originalText}
                        </Text>
                      </View>
                      {isSel && (
                        <View style={[styles.activeCheckCircle, { backgroundColor: accentColor }]}>
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {semesterOptions.length === 0 && (
                <View style={{ padding: 28, alignItems: 'center' }}>
                   <ActivityIndicator size="small" color={colors.primary} />
                   <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 12, fontFamily: 'Inter_500Medium' }}>
                     Connecting to portal results...
                   </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Hidden WebViews for Scraping */}
      <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute', left: -1000 }}>
         <WebView
           ref={webViewRef}
           source={{ uri: 'https://student.culko.in/result.aspx' }}
           onNavigationStateChange={handleNavigationStateChange}
           onMessage={handleMessage}
           onError={(e) => console.log('WEBVIEW ERROR:', e.nativeEvent.description)}
           onHttpError={(e) => console.log('WEBVIEW HTTP ERROR:', e.nativeEvent.statusCode)}
           javaScriptEnabled={true}
           domStorageEnabled={true}
           sharedCookiesEnabled={true}
         />
         <WebView
           ref={marksWebViewRef}
           source={{ uri: 'https://student.culko.in/frmStudentMarksView.aspx' }}
           onNavigationStateChange={handleMarksNavigationStateChange}
           onMessage={handleMessage}
           onError={(e) => console.log('MARKS WEBVIEW ERROR:', e.nativeEvent.description)}
           onHttpError={(e) => console.log('MARKS WEBVIEW HTTP ERROR:', e.nativeEvent.statusCode)}
           javaScriptEnabled={true}
           domStorageEnabled={true}
           sharedCookiesEnabled={true}
         />
      </View>
    </View>
  );
}

function parseMarksString(str?: string) {
  if (!str || !str.includes('/')) return { obtained: 0, max: 0, isValid: false, pct: 0, text: str || 'N/A' };
  const parts = str.split('/');
  const obtained = parseFloat(parts[0]);
  const max = parseFloat(parts[1]);
  if (isNaN(obtained) || isNaN(max) || max <= 0) return { obtained: 0, max: 0, isValid: false, pct: 0, text: str };
  const pct = Math.min(100, Math.max(0, (obtained / max) * 100));
  return { obtained, max, isValid: true, pct, text: `${obtained}/${max}` };
}

function getGradeColor(grade?: string) {
  const g = (grade || '').trim().toUpperCase();
  if (g === 'O') return '#fbbf24'; // Gold
  if (g === 'A+' || g === 'A') return '#22c55e'; // Emerald
  if (g === 'B+' || g === 'B') return '#3b82f6'; // Blue
  if (g === 'C+' || g === 'C') return '#f97316'; // Orange
  if (g === 'P') return '#eab308'; // Yellow
  return '#ef4444'; // Red
}

function InternalMarkAccordion({ item, isExpanded, onToggle, isDark, colors }: any) {
  const mst = parseMarksString(item.mstMarks);
  const practical = parseMarksString(item.practicalMarks);

  let totalObtained = 0;
  let totalMax = 0;
  let hasValid = false;

  if (mst.isValid) {
    totalObtained += mst.obtained;
    totalMax += mst.max;
    hasValid = true;
  }
  if (practical.isValid) {
    totalObtained += practical.obtained;
    totalMax += practical.max;
    hasValid = true;
  }

  const scorePct = hasValid && totalMax > 0 ? (totalObtained / totalMax) * 100 : null;
  const scoreBadgeColor = scorePct === null ? colors.textMuted : (scorePct >= 75 ? '#22c55e' : (scorePct >= 60 ? '#f59e0b' : '#ef4444'));

  return (
    <View style={stylesInternal.wrapper}>
      <LinearGradient
        colors={
          isDark
            ? ['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.02)']
            : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.82)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          stylesInternal.card,
          {
            borderColor: isExpanded 
              ? (isDark ? colors.primary + '60' : colors.primary + '40')
              : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'),
            borderTopColor: isExpanded 
              ? colors.primary 
              : (isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.95)'),
          },
          isExpanded && {
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 10,
            elevation: 3,
          }
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => {
            try { Haptics.selectionAsync(); } catch {}
            onToggle();
          }}
          style={stylesInternal.headerTouch}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[stylesInternal.title, { color: colors.text }]} numberOfLines={2}>
              {item.subjectName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <View style={[stylesInternal.miniDot, { backgroundColor: scoreBadgeColor }]} />
              <Text style={{ color: colors.textMuted, fontSize: 11.5, fontFamily: 'Inter_500Medium' }}>
                {hasValid ? `${totalObtained}/${totalMax} Total Marks` : 'Pending Evaluation'}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {scorePct !== null ? (
              <View style={[stylesInternal.pctBadge, { backgroundColor: scoreBadgeColor + '18', borderColor: scoreBadgeColor + '40' }]}>
                <Text style={[stylesInternal.pctText, { color: scoreBadgeColor }]}>
                  {scorePct.toFixed(1)}%
                </Text>
              </View>
            ) : (
              <View style={[stylesInternal.pctBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: colors.border }]}>
                <Text style={[stylesInternal.pctText, { color: colors.textMuted }]}>N/A</Text>
              </View>
            )}

            <View style={[stylesInternal.chevronCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textMuted}
              />
            </View>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={[stylesInternal.expandedBody, { borderTopColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }]}>
            {/* MST Row */}
            <View style={stylesInternal.metricBox}>
              <View style={stylesInternal.metricLabelRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="document-text-outline" size={14} color={colors.primary} />
                  <Text style={[stylesInternal.metricLabel, { color: colors.text }]}>Mid-Semester Test (MST)</Text>
                </View>
                <Text style={[stylesInternal.metricValue, { color: mst.isValid ? colors.text : colors.textMuted }]}>
                  {mst.text}
                </Text>
              </View>
              {mst.isValid ? (
                <View style={[stylesInternal.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                  <View 
                    style={[
                      stylesInternal.progressFill, 
                      { 
                        width: `${mst.pct}%`, 
                        backgroundColor: mst.pct >= 75 ? '#22c55e' : (mst.pct >= 60 ? '#f59e0b' : '#ef4444') 
                      }
                    ]} 
                  />
                </View>
              ) : null}
            </View>

            {/* Practical Row */}
            <View style={stylesInternal.metricBox}>
              <View style={stylesInternal.metricLabelRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="flask-outline" size={14} color={colors.success} />
                  <Text style={[stylesInternal.metricLabel, { color: colors.text }]}>Practical / Lab Marks</Text>
                </View>
                <Text style={[stylesInternal.metricValue, { color: practical.isValid ? colors.text : colors.textMuted }]}>
                  {practical.text}
                </Text>
              </View>
              {practical.isValid ? (
                <View style={[stylesInternal.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                  <View 
                    style={[
                      stylesInternal.progressFill, 
                      { 
                        width: `${practical.pct}%`, 
                        backgroundColor: practical.pct >= 75 ? '#22c55e' : (practical.pct >= 60 ? '#f59e0b' : '#ef4444') 
                      }
                    ]} 
                  />
                </View>
              ) : null}
            </View>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const stylesInternal = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerTouch: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: {
    fontSize: 14.5,
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 19,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  pctText: {
    fontSize: 11.5,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  chevronCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedBody: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
  },
  metricBox: {
    gap: 6,
  },
  metricLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  metricValue: {
    fontSize: 12.5,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  progressTrack: {
    height: 5,
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2.5,
  },
});

function ResultSubjectCard({ sub, isDark, colors }: any) {
  const gradeColor = getGradeColor(sub.grade);

  return (
    <LinearGradient
      colors={
        isDark
          ? ['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.02)']
          : ['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.82)']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        stylesResult.card,
        {
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          borderTopColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.95)',
        }
      ]}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[stylesResult.name, { color: colors.text }]} numberOfLines={2}>
          {sub.name}
        </Text>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <View style={[stylesResult.codePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
            <Text style={[stylesResult.codeText, { color: colors.primary }]}>{sub.code}</Text>
          </View>
          {!!sub.credit && (
            <View style={[stylesResult.codePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
              <Text style={[stylesResult.codeText, { color: colors.textMuted }]}>{sub.credit} Credits</Text>
            </View>
          )}
        </View>

        {(sub.internal || sub.external) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            {!!sub.internal && (
              <View style={stylesResult.marksChip}>
                <Text style={stylesResult.marksChipLabel}>Int:</Text>
                <Text style={[stylesResult.marksChipValue, { color: colors.text }]}>{sub.internal}</Text>
              </View>
            )}
            {!!sub.external && (
              <View style={stylesResult.marksChip}>
                <Text style={stylesResult.marksChipLabel}>Ext:</Text>
                <Text style={[stylesResult.marksChipValue, { color: colors.text }]}>{sub.external}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Circular Grade Badge */}
      <View style={[stylesResult.gradeCircle, { backgroundColor: gradeColor + '18', borderColor: gradeColor + '50' }]}>
        <Text style={[stylesResult.gradeText, { color: gradeColor }]}>{sub.grade}</Text>
        <Text style={[stylesResult.gradeLabel, { color: gradeColor }]}>GRADE</Text>
      </View>
    </LinearGradient>
  );
}

const stylesResult = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: 14.5,
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 19,
  },
  codePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  codeText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  marksChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  marksChipLabel: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontFamily: 'Inter_500Medium',
  },
  marksChipValue: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  gradeCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  gradeText: {
    fontSize: 18,
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 20,
  },
  gradeLabel: {
    fontSize: 8,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
    marginTop: 1,
  },
});

function RadarChart({ data }: { data: { subject: string, score: number, hasMarks?: boolean }[] }) {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';

  const { width } = Dimensions.get('window');
  const RADAR_SIZE = Math.min(width - 150, 230);
  const CENTER = RADAR_SIZE / 2;
  const RADIUS = (RADAR_SIZE / 2) - 28;

  const points = data.map((d, i) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
    const r = (d.score / 100) * RADIUS;
    return `${CENTER + r * Math.cos(angle)},${CENTER + r * Math.sin(angle)}`;
  }).join(' ');

  return (
    <View style={{ position: 'relative', width: RADAR_SIZE + 90, height: RADAR_SIZE + 90, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RADAR_SIZE} height={RADAR_SIZE} style={{ position: 'absolute', left: 45, top: 45 }}>
        {/* Ambient center backlight circle - perfectly concentric with radar rings */}
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill={colors.primary}
          opacity={isDark ? 0.08 : 0.05}
        />
        {[0.2, 0.4, 0.6, 0.8, 1].map((scale, i) => (
          <Circle
            key={`circle-${i}`}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS * scale}
            stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}
            strokeWidth="1"
            fill="none"
          />
        ))}
        {data.map((_, i) => {
          const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
          const x = CENTER + RADIUS * Math.cos(angle);
          const y = CENTER + RADIUS * Math.sin(angle);
          return (
            <Line 
              key={`line-${i}`} 
              x1={CENTER} 
              y1={CENTER} 
              x2={x} 
              y2={y} 
              stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'} 
              strokeWidth="1" 
            />
          );
        })}
        <Polygon 
          points={points} 
          fill={colors.primary + '35'} 
          stroke={colors.primary} 
          strokeWidth="2" 
        />
        {data.map((d, i) => {
          const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
          const r = (d.score / 100) * RADIUS;
          const px = CENTER + r * Math.cos(angle);
          const py = CENTER + r * Math.sin(angle);
          return (
            <Circle
              key={`vertex-${i}`}
              cx={px}
              cy={py}
              r="3.5"
              fill={colors.primary}
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          );
        })}
      </Svg>

      {data.map((d, i) => {
        const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
        const labelRadius = RADIUS + 42;
        const x = CENTER + labelRadius * Math.cos(angle) + 45;
        const y = CENTER + labelRadius * Math.sin(angle) + 45;
        
        let percentColor = '#22c55e'; // Green
        if (d.score < 60) percentColor = '#ef4444'; // Red
        else if (d.score < 75) percentColor = '#eab308'; // Yellow

        return (
          <View 
            key={`label-view-${i}`} 
            style={{ 
              position: 'absolute', 
              left: x, 
              top: y, 
              transform: [{ translateX: -45 }, { translateY: -20 }],
              width: 90, 
              alignItems: 'center',
              justifyContent: 'center',
            }} 
          >
            <Text style={{ color: colors.text, fontSize: 10, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }} numberOfLines={2}>
              {d.subject}
            </Text>
            {d.hasMarks && (
              <Text style={{ color: percentColor, fontSize: 11, fontFamily: 'SpaceGrotesk_700Bold', marginTop: 2 }}>
                {d.score.toFixed(0)}%
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: Spacing.md, paddingTop: 18, paddingBottom: 110 },
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: Spacing.lg,
    width: '100%',
  },
  headerCategory: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10.5,
    letterSpacing: 1,
  },
  headerTitle: { 
    color: colors.text, 
    fontSize: 21, 
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  semesterBtn: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  semesterBtnText: { 
    color: colors.primary, 
    fontSize: 12, 
    fontFamily: 'Inter_700Bold',
  },
  
  radarCardWrapper: {
    marginBottom: Spacing.lg,
    borderRadius: 24,
    overflow: 'hidden',
  },
  radarGradient: {
    borderRadius: 24,
    borderWidth: 1,
    borderTopWidth: 1.5,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 10,
    position: 'relative',
    alignItems: 'center',
  },
  radarTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  radarCardTitle: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 0.4,
  },
  radarScopeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  radarScopeText: {
    fontSize: 10.5,
    fontFamily: 'Inter_500Medium',
  },
  radarContainer: { 
    alignItems: 'center', 
    justifyContent: 'center',
    marginVertical: 4,
  },
  radarBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    gap: 12,
  },
  radarStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  radarStatLabel: {
    color: colors.textMuted,
    fontSize: 11.5,
    fontFamily: 'Inter_500Medium',
  },
  radarStatValue: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  radarStatDivider: {
    width: 1,
    height: 12,
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
  },

  listContainer: { 
    marginTop: Spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  listTitle: { 
    color: colors.text, 
    fontSize: 17, 
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  sectionSubTitle: {
    color: colors.textMuted,
    fontSize: 11.5,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  overallBadge: {
    backgroundColor: '#22c55e18',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22c55e40',
  },
  overallBadgeText: {
    color: '#22c55e',
    fontSize: 12.5,
    fontFamily: 'SpaceGrotesk_700Bold',
  },

  sgpaHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderTopWidth: 1.5,
    marginBottom: 16,
  },
  sgpaHeroCategory: {
    fontSize: 10.5,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 0.8,
  },
  sgpaHeroScore: {
    fontSize: 28,
    fontFamily: 'SpaceGrotesk_700Bold',
    lineHeight: 34,
  },
  sgpaHeroSub: {
    color: colors.textMuted,
    fontSize: 11.5,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  sgpaTrophyCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectCountChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  subjectCountText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },

  emptyInternalCard: {
    borderRadius: 22,
    overflow: 'hidden',
    marginTop: 10,
  },
  emptyInternalGradient: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyInternalTitle: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyInternalDesc: {
    color: colors.textMuted,
    fontSize: 12.5,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },

  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.7)', 
    justifyContent: 'flex-end',
  },
  modalContent: { 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    padding: 20, 
    paddingBottom: 32, 
    maxHeight: '72%',
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  modalDragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150, 150, 150, 0.3)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16,
  },
  modalTitle: { 
    fontSize: 18, 
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  modalSub: {
    color: colors.textMuted,
    fontSize: 11.5,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  modalCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionCard: { 
    paddingVertical: 12, 
    paddingHorizontal: 14, 
    borderRadius: 16,
    borderWidth: 1,
  },
  modalOptionTitle: { 
    fontSize: 14, 
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  modalOptionSub: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  sessionIconBox: { 
    width: 38, 
    height: 38, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 1,
  },
  activeCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
