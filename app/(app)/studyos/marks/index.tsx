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
import AsyncStorage from '@react-native-async-storage/async-storage';
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

function getOptionSemNumber(text: string): number | null {
  const m = text.match(/(?:sem(?:ester)?|term)\s*[-:]?\s*(\d+)/i) || text.match(/(\d+)(?:st|nd|rd|th)\s*sem/i);
  return m ? parseInt(m[1], 10) : null;
}

function buildSemesterList(raw: RawSemester[], studentSemStr?: string, courseStr?: string): SemesterItem[] {
  // 1. Filter out placeholder/dummy dropdown options (e.g. "--Select--", "0", "-1", empty text)
  const validRaw = (raw || []).filter((opt) => {
    if (!opt || !opt.value) return false;
    const val = String(opt.value).trim();
    if (val === '' || val === '0' || val === '-1') return false;
    const lower = (opt.text || '').trim().toLowerCase();
    if (lower.includes('select') || lower === '--' || lower === 'choose') return false;
    return true;
  });

  const sorted = [...validRaw].sort((a, b) => {
    const A = parseSession(a.text);
    const B = parseSession(b.text);
    if (A.year !== B.year) return A.year - B.year;
    return A.month - B.month;
  });

  // Extract student's actual current semester from profile (e.g. "2" -> 2)
  let studentCurrentSem = 0;
  if (studentSemStr && studentSemStr !== 'N/A') {
    const match = String(studentSemStr).match(/(\d+)/);
    if (match) {
      studentCurrentSem = parseInt(match[1], 10);
    }
  }

  // Fallback: extract semester from course string if profile.semester wasn't set
  if (studentCurrentSem === 0 && courseStr) {
    const cMatch = String(courseStr).match(/(?:sem(?:ester)?|term)\s*[-:]?\s*(\d+)/i) || String(courseStr).match(/(\d+)(?:st|nd|rd|th)\s*sem/i);
    if (cMatch) {
      studentCurrentSem = parseInt(cMatch[1], 10);
    }
  }

  // Authoritative current semester number from profile, or fallback to sequential count
  const currentNum = studentCurrentSem > 0 ? studentCurrentSem : Math.max(1, sorted.length + 1);

  const list: SemesterItem[] = [];

  // Add past completed sessions
  sorted.forEach((opt, idx) => {
    const semInText = getOptionSemNumber(opt.text);
    const semNum = semInText || (idx + 1);

    // Only add as past completed result if it is prior to the ongoing current semester,
    // or if current semester is unknown
    if (studentCurrentSem === 0 || semNum < currentNum) {
      list.push({
        label: `Semester ${semNum}`,
        value: opt.value,
        originalText: opt.text,
      });
    }
  });

  // Add current ongoing semester (for internal marks)
  list.push({
    label: `Semester ${currentNum} (Current)`,
    value: 'CURRENT_INTERNAL',
    originalText: 'Current Ongoing Session',
  });

  return list;
}

export default function MarksScreen() {
  const colors = useThemeStore((s) => s.colors);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'black';
  const styles = useStyles(colors, isDark);
  const { marks, subjects, semesterOptionsCache, resultCache, setScrapedData, profile } = useStudyOSStore();
  const { clearSession, isSessionDisconnected } = useStudySessionStore();
  const router = useRouter();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Results State
  const webViewRef = useRef<WebView>(null);
  const [semesterOptions, setSemesterOptions] = useState<{text: string, value: string}[]>(semesterOptionsCache || []);
  const [selectedSemester, setSelectedSemester] = useState<string>('');
  const [resultData, setResultData] = useState<{sgpa: string, subjects: any[]} | null>(null);
  const [isLoading, setIsLoading] = useState(semesterOptionsCache?.length ? false : true);

  // Semester picker list: aligned with real portal profile semester
  const derivedSemesters = useMemo(
    () => buildSemesterList(semesterOptions, profile?.semester, profile?.course),
    [semesterOptions, profile?.semester, profile?.course]
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
  const isCurrentSemester =
    !selectedSemester ||
    selectedSemester === 'CURRENT_INTERNAL' ||
    selectedSemester.includes('(Current)') ||
    (selectedSemIdx >= 0 && derivedSemesters[selectedSemIdx]?.label.includes('(Current)'));

  useFocusEffect(
    React.useCallback(() => {
      if (!didMountRef.current) {
        didMountRef.current = true;
        return;
      }
      setIsLoading(false); 
      setRefreshing(false);
    }, [])
  );

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [rawCookie, setRawCookie] = useState<string | null>(null);
  const [cookieScript, setCookieScript] = useState<string | null>(null);
  
  const cookieScriptRef = useRef<string>('');
  const injectAndScrapeRef = useRef<() => void>(() => {});
  const injectAndScrapeMarksRef = useRef<() => void>(() => {});
  const marksWebViewRef = useRef<WebView>(null);
  const didMountRef = useRef(false);

  // Load saved cookies from SecureStore with AsyncStorage fallback
  const loadCookies = useCallback(async () => {
    let c = await SecureStore.getItemAsync('culko_cookies').catch(() => null);
    if (!c) {
      c = await AsyncStorage.getItem('culko_cookies').catch(() => null);
    }
    if (c) {
      setRawCookie(c);
      const parts = c.split(';').map((p: string) => p.trim()).filter(Boolean);
      const script = parts.map((p: string) => `document.cookie = ${JSON.stringify(p + '; path=/')};`).join('\n') + '\ntrue;';
      setCookieScript(script);
      cookieScriptRef.current = script;
      return c;
    }
    return null;
  }, []);

  useEffect(() => {
    loadCookies();
  }, [loadCookies]);

  // Re-fetch cookies and remount WebViews when user reconnects
  const wasDisconnected = useRef(isSessionDisconnected);
  useEffect(() => {
    if (wasDisconnected.current && !isSessionDisconnected) {
      loadCookies().then((fresh) => {
        if (fresh) {
          setRefreshKey((k) => k + 1);
        }
      });
    }
    wasDisconnected.current = isSessionDisconnected;
  }, [isSessionDisconnected, loadCookies]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const freshCookie = await loadCookies();
    if (freshCookie) {
      setRefreshKey((k) => k + 1);
    } else {
      setRefreshing(false);
    }
  }, [loadCookies]);

  // Grade → approximate percentage for radar (based on CU grading scale)
  const GRADE_TO_PCT: Record<string, number> = {
    'O': 95, 'A+': 88, 'A': 78, 'B+': 68, 'B': 58,
    'C+': 53, 'C': 48, 'P': 38, 'F': 0, 'E': 0, 'AB': 0, 'I': 0,
  };

  // Radar data for current semester (internal marks)
  const internalChartData = subjects?.length > 0 ? subjects.map(s => {
    const cleanSubjCode = (s.code || '').trim().toUpperCase();
    const cleanSubjName = (s.name || '').replace(/\s*\(?(theory|practical)\)?/gi, '').trim().toLowerCase();

    const m = marks?.find((mark: any) => {
      const mCode = (mark.code || '').trim().toUpperCase();
      const mName = (mark.subjectName || '').replace(/\s*\(?(theory|practical)\)?/gi, '').trim().toLowerCase();
      const mFullName = (mark.fullName || '').toLowerCase();
      if (cleanSubjCode && mCode && (cleanSubjCode === mCode || cleanSubjCode.includes(mCode) || mCode.includes(cleanSubjCode))) return true;
      if (cleanSubjName && mName && (cleanSubjName.includes(mName) || mName.includes(cleanSubjName))) return true;
      if (cleanSubjCode && mFullName.includes(cleanSubjCode.toLowerCase())) return true;
      return false;
    });

    let totalObtained = 0, totalMax = 0, hasValidMarks = false;
    if (m) {
      if (m.exams && m.exams.length > 0) {
        m.exams.forEach((ex: any) => {
          const mx = parseFloat(ex.max);
          const ob = parseFloat(ex.obtained);
          if (!isNaN(mx) && !isNaN(ob) && mx > 0) {
            totalObtained += ob; totalMax += mx; hasValidMarks = true;
          }
        });
      } else {
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
    }
    const score = hasValidMarks && totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    const cleanedName = s.name.replace(/\s*\(?(theory|practical)\)?/gi, '').trim();
    return { subject: cleanedName, score: isNaN(score) ? 0 : score, hasMarks: hasValidMarks };
  }) : marks?.length > 0 ? marks.filter((m: any) => m.subjectName !== '20').map((m: any) => {
    let totalObtained = 0, totalMax = 0, hasValidMarks = false;
    if (m.exams && m.exams.length > 0) {
      m.exams.forEach((ex: any) => {
        const mx = parseFloat(ex.max);
        const ob = parseFloat(ex.obtained);
        if (!isNaN(mx) && !isNaN(ob) && mx > 0) {
          totalObtained += ob; totalMax += mx; hasValidMarks = true;
        }
      });
    } else {
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
    const cleanedName = (m.subjectName || '').replace(/\s*\(?(theory|practical)\)?/gi, '').trim();
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
        var ddl = document.querySelector('select[name*="ddlSession"]') || 
                  document.querySelector('select[name*="Session"]') || 
                  document.querySelector('select[id*="ddlSession"]') || 
                  document.querySelector('select[name*="ddlSemester"]') || 
                  document.querySelector('select[id*="ddlSemester"]') || 
                  document.querySelector('select');
        var options = [];
        if (ddl) {
          for (var i = 0; i < ddl.options.length; i++) {
            var ot = (ddl.options[i].text || '').trim();
            var ov = (ddl.options[i].value || '').trim();
            if (ov && ov !== '0' && ov !== '-1' && !ot.toLowerCase().includes('select') && !ot.toLowerCase().includes('choose')) {
              options.push({ text: ot, value: ov });
            }
          }
        }
         
        var sgpa = '';
        var bodyText = document.body ? document.body.innerText : '';
        var match = bodyText.match(/(?:S\.?G\.?P\.?A\.?|C\.?G\.?P\.?A\.?|GPA)\s*[:\-\=]?\s*([0-9]{1,2}\.[0-9]{1,3})/i);
        if (match) {
           sgpa = match[1];
        } else {
           var sgpaEl = document.querySelector('input[name*="SGPA" i], input[id*="SGPA" i], span[id*="lblSGPA" i], span[id*="lblCGPA" i]');
           if (sgpaEl) {
              sgpa = sgpaEl.value || sgpaEl.innerText;
           } else {
              var spans = document.querySelectorAll('span, td, div');
              for (var k = 0; k < spans.length; k++) {
                 var text = spans[k].innerText;
                 if (text && (text.includes('SGPA') || text.includes('CGPA') || text.includes('GPA'))) {
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
        var trs = Array.from(document.querySelectorAll('table tr'));
        var iframes = document.querySelectorAll('iframe');
        for (var f = 0; f < iframes.length; f++) {
          try {
            var idoc = iframes[f].contentDocument || iframes[f].contentWindow.document;
            if (idoc) {
              trs = trs.concat(Array.from(idoc.querySelectorAll('table tr')));
            }
          } catch(e) {}
        }

        var debugRows = [];
        var gradeRegex = /^(O|A\\+|A|B\\+|B|C\\+|C|D|E|F|P|AB|I|DT|UMC\\*?)$/i;

        for (var i = 0; i < trs.length; i++) {
           var tds = Array.from(trs[i].children).filter(function(el) {
              return el.tagName.toUpperCase() === 'TD' || el.tagName.toUpperCase() === 'TH';
           });
           var textArr = tds.map(function(t) { return t.innerText.trim(); });
           if (textArr.length > 0) {
              debugRows.push(textArr.join(' | '));
           }
           
           var codeIndex = textArr.findIndex(function(t) {
              return /^[0-9A-Z]{2,8}[-_]?[0-9]{2,4}$/i.test(t) || /^[0-9A-Z]{2,7}-[0-9]{3}/.test(t);
           });
           var gradeIndex = textArr.findIndex(function(t) { return gradeRegex.test(t.toUpperCase()); });

           if (codeIndex !== -1 && textArr.length >= 3) {
              var code = textArr[codeIndex];
              var name = (codeIndex + 1 < textArr.length) ? textArr[codeIndex + 1] : '';
              
              var grade = '';
              var credit = '0';
              
              for (var j = textArr.length - 1; j > codeIndex; j--) {
                 var val = textArr[j].toUpperCase();
                 if (gradeRegex.test(val)) {
                    grade = textArr[j];
                    if (j - 1 > codeIndex && !isNaN(parseFloat(textArr[j - 1]))) {
                       credit = textArr[j - 1];
                    } else if (j - 2 > codeIndex && !isNaN(parseFloat(textArr[j - 2]))) {
                       credit = textArr[j - 2];
                    }
                    break;
                 }
              }
              
              var internal = '';
              var external = '';
              if (grade) {
                 for (var k = codeIndex + 2; k < textArr.length; k++) {
                    if (textArr[k] !== grade && textArr[k] !== credit && !isNaN(parseFloat(textArr[k]))) {
                       if (!internal) internal = textArr[k];
                       else if (!external) external = textArr[k];
                    }
                 }
                 subjects.push({ code: code, name: name, credit: credit, grade: grade, internal: internal, external: external });
              }
           } else if (gradeIndex !== -1 && textArr.length >= 3) {
              var grade = textArr[gradeIndex];
              var candidateCode = (textArr[0] && textArr[0].length <= 12 && !/^\\d+$/.test(textArr[0])) ? textArr[0] : (textArr[1] && textArr[1].length <= 12 ? textArr[1] : 'SUBJ');
              var candidateName = textArr.find(function(t, idx) { return idx !== gradeIndex && t.length > 4 && !/^\\d+$/.test(t) && !gradeRegex.test(t); }) || candidateCode;
              var candidateCredit = '0';
              if (gradeIndex > 0 && !isNaN(parseFloat(textArr[gradeIndex - 1]))) {
                 candidateCredit = textArr[gradeIndex - 1];
              }
              subjects.push({ code: candidateCode, name: candidateName, credit: candidateCredit, grade: grade, internal: '', external: '' });
           }
        }
        
        if (!sgpa && subjects.length > 0) {
           var totalCredits = 0;
           var totalPoints = 0;
           var gradeMap = {
              'O': 10, 'A+': 10, 'A': 9, 'B+': 8, 'B': 7, 'C+': 6, 'C': 5, 'P': 4, 'F': 0, 'E': 0, 'UMC': 0, 'UMC*': 0
           };
           for (var s = 0; s < subjects.length; s++) {
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

        var semEl = document.querySelector('span[id*="lblSem"]');
        var semNum = semEl ? semEl.innerText.trim() : '';
        if (!semNum && ddl && ddl.selectedIndex >= 0 && ddl.options[ddl.selectedIndex]) {
           var selOptText = ddl.options[ddl.selectedIndex].text || '';
           var semMatch = selOptText.match(/(\\d+)/);
           if (semMatch) semNum = semMatch[1];
        }

        var allSelects = Array.from(document.querySelectorAll('select')).map(function(s) {
           return {
             name: s.name,
             id: s.id,
             value: s.value,
             options: Array.from(s.options).map(function(o){ return { text: o.text, value: o.value }; })
           };
        });
        var allInputs = Array.from(document.querySelectorAll('input, button')).map(function(b) {
           return { name: b.name, id: b.id, type: b.type, value: b.value };
        });
        var allTables = Array.from(document.querySelectorAll('table')).map(function(t) {
           return { id: t.id, rows: t.rows ? t.rows.length : 0, snippet: (t.innerText || '').substring(0, 100) };
        });

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'RESULT_DATA',
          pageUrl: window.location.href,
          options: options,
          sgpa: sgpa,
          subjects: subjects,
          selected: ddl ? ddl.value : '',
          semesterNumber: semNum,
          debugSgpa: sgpaDebug,
          debugRows: debugRows.slice(0, 30),
          allSelects: allSelects,
          allInputs: allInputs,
          allTables: allTables,
          bodySnippet: (document.body ? document.body.innerText : '').substring(0, 500)
        }));
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
         
         // 1. First, check for accordion style (#accordion or h3/h2/h4 elements)
         var headers = document.querySelectorAll('#accordion h3, #accordion h2, #accordion h4, .ui-accordion-header, h3, h4');
         for (var i = 0; i < headers.length; i++) {
           var hText = headers[i].innerText ? headers[i].innerText.trim() : '';
           if (!hText || hText.length < 3) continue;

           // Find the table that belongs to this header
           var next = headers[i].nextElementSibling;
           var tbl = null;
           while (next && next.tagName !== 'H3' && next.tagName !== 'H2' && next.tagName !== 'H4') {
             if (next.tagName === 'TABLE') { tbl = next; break; }
             var foundTbl = next.querySelector('table');
             if (foundTbl) { tbl = foundTbl; break; }
             next = next.nextElementSibling;
           }

           if (tbl) {
             var codeMatch = hText.match(/\\(([0-9A-Z]{2,8}[-_]?[0-9]{3})\\)/i);
             var code = codeMatch ? codeMatch[1] : '';
             var sName = hText.replace(/\\s*\\([0-9A-Z]{2,8}[-_]?[0-9]{3}\\)/i, '').trim() || hText;

             var tRows = tbl.querySelectorAll('tr');
             var exams = [];
             var mstMarks = 'N/A';
             var practicalMarks = 'N/A';
             var totalObtained = 0;
             var totalMax = 0;

             for (var r = 0; r < tRows.length; r++) {
               if (tRows[r].querySelector('th')) continue;
               var cells = tRows[r].querySelectorAll('td');
               if (cells.length >= 3) {
                 var examDesc = cells[0].innerText.trim();
                 var maxS = cells[1].innerText.trim();
                 var obtS = cells[2].innerText.trim();
                 if (examDesc && maxS && obtS) {
                   exams.push({ name: examDesc, max: maxS, obtained: obtS });
                   var mVal = parseFloat(maxS);
                   var oVal = parseFloat(obtS);
                   if (!isNaN(mVal) && !isNaN(oVal)) {
                     totalObtained += oVal;
                     totalMax += mVal;
                     var lowD = examDesc.toLowerCase();
                     if (lowD.includes('mid') || lowD.includes('mst')) {
                       mstMarks = obtS + '/' + maxS;
                     } else if (lowD.includes('prac') || lowD.includes('lab')) {
                       practicalMarks = obtS + '/' + maxS;
                     }
                   }
                 }
               }
             }

             if (exams.length > 0) {
               if (mstMarks === 'N/A' && exams.length > 0) {
                 mstMarks = exams[0].obtained + '/' + exams[0].max;
               }
               marksData.push({
                 code: code,
                 subjectName: sName,
                 fullName: hText,
                 exams: exams,
                 mstMarks: mstMarks,
                 practicalMarks: practicalMarks,
                 totalObtained: totalObtained,
                 totalMax: totalMax
               });
             }
           }
         }

         // 2. Fallback if no accordion headers were matched
         if (marksData.length === 0) {
           var tables = document.querySelectorAll('table');
           for (var t = 0; t < tables.length; t++) {
             var rows = tables[t].querySelectorAll('tr');
             if (rows.length < 2) continue;
             var headCells = Array.from(rows[0].querySelectorAll('th, td')).map(function(c){ return c.innerText.trim().toLowerCase(); });
             var subIdx = headCells.findIndex(function(h){ return h.includes('subject') || h.includes('course'); });
             var mstIdx = headCells.findIndex(function(h){ return h.includes('mst') || h.includes('mid'); });
             var pracIdx = headCells.findIndex(function(h){ return h.includes('prac') || h.includes('lab'); });

             if (subIdx !== -1 && (mstIdx !== -1 || pracIdx !== -1)) {
               for (var r = 1; r < rows.length; r++) {
                 var tds = rows[r].querySelectorAll('td');
                 if (tds.length > subIdx) {
                   var subN = tds[subIdx].innerText.trim();
                   if (subN && subN !== '' && subN !== '20') {
                     marksData.push({
                       subjectName: subN,
                       mstMarks: mstIdx !== -1 && tds.length > mstIdx ? tds[mstIdx].innerText.trim() : 'N/A',
                       practicalMarks: pracIdx !== -1 && tds.length > pracIdx ? tds[pracIdx].innerText.trim() : 'N/A',
                       exams: []
                     });
                   }
                 }
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
    if (cookieScriptRef.current) {
      marksWebViewRef.current?.injectJavaScript(cookieScriptRef.current);
      setTimeout(() => marksWebViewRef.current?.injectJavaScript(extractMarksScript), 500);
    } else {
      marksWebViewRef.current?.injectJavaScript(extractMarksScript);
    }
  };

  injectAndScrapeRef.current = () => {
    webViewRef.current?.injectJavaScript(extractScript);
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'RESULT_DATA') {
        if (data.pendingPostback) {
           return; // wait for reload
        }
        if (data.error === 'SESSION_EXPIRED') {
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
        console.log("RESULT PAGE INSPECTION:", JSON.stringify({
          pageUrl: data.pageUrl,
          selected: data.selected,
          options: data.options,
          selects: data.allSelects,
          inputs: data.allInputs,
          tables: data.allTables,
          bodySnippet: data.bodySnippet,
        }, null, 2));
        if (data.options && data.options.length > 0) {
          setSemesterOptions(data.options);
          setScrapedData({ semesterOptionsCache: data.options });
        }
        
        if (data.subjects && data.subjects.length > 0) {
           const currentSelected = data.selected || selectedSemester;
           setResultData({ sgpa: data.sgpa, subjects: data.subjects });
           
           const newCache = { ...(resultCache || {}) };
           if (currentSelected) newCache[currentSelected] = { sgpa: data.sgpa, subjects: data.subjects };
           if (selectedSemester) newCache[selectedSemester] = { sgpa: data.sgpa, subjects: data.subjects };
           if (data.semesterNumber) {
             newCache[`Semester ${data.semesterNumber}`] = { sgpa: data.sgpa, subjects: data.subjects };
             newCache[`sem_${data.semesterNumber}`] = { sgpa: data.sgpa, subjects: data.subjects };
           }
           setScrapedData({ resultCache: newCache });
           setIsLoading(false);
           setRefreshing(false);
        } else {
           if (data.options && data.options.length > 0 && !selectedSemester) {
             setIsLoading(false);
             setRefreshing(false);
           }
        }
      } else if (data.type === 'INTERNAL_MARKS') {
        if (data.error) {
           console.log("INTERNAL MARKS SCRIPT ERROR:", data.error);
        }
        if (data.data && Array.isArray(data.data)) {
           setScrapedData({ marks: data.data });
        }
        setIsLoading(false);
        setRefreshing(false);
      } else if (data.type === 'SELECT_SEM_DEBUG') {
        console.log("SELECT SEMESTER DEBUG:", JSON.stringify(data));
      }
    } catch (e) {}
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    console.log("MARKS RESULT WEBVIEW NAV:", navState.url, navState.loading);
    if (!navState.loading) {
      const url = (navState.url || '').toLowerCase();
      if (url.includes('error.html') || url.includes('servererror')) {
        setIsLoading(false);
        setRefreshing(false);
        return;
      }
      if (url.includes('login.aspx') || url.includes('/login')) {
        setIsLoading(false);
        setRefreshing(false);
        return;
      }
      setTimeout(() => injectAndScrapeRef.current(), 1500);
    }
  };

  const handleMarksNavigationStateChange = (navState: WebViewNavigation) => {
    console.log("MARKS INTERNAL WEBVIEW NAV:", navState.url, navState.loading);
    if (!navState.loading) {
      const url = (navState.url || '').toLowerCase();
      if (url.includes('error.html') || url.includes('servererror')) {
        setIsLoading(false);
        setRefreshing(false);
        return;
      }
      if (url.includes('login.aspx') || url.includes('/login')) {
        console.log('[Marks] frmStudentMarksView redirected to login — session expired');
        setIsLoading(false);
        setRefreshing(false);
        useStudySessionStore.getState().setSessionExpired(true);
        return;
      }
      setTimeout(() => injectAndScrapeMarksRef.current(), 1500);
    }
  };

  const selectSemester = (item: SemesterItem) => {
    // Current ongoing semester uses internal marks & radar — no portal postback needed
    if (item.value === null || item.value === 'CURRENT_INTERNAL' || item.label.includes('(Current)')) {
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
    const label = item.label;
    const originalText = item.originalText;
    setIsModalVisible(false);
    setSelectedSemester(value);
    
    // Instant cache hit: check by value, label, or semester number
    const semNum = item.label.replace(/\D/g, '');
    const cached = resultCache && (
      resultCache[value] ||
      resultCache[item.label] ||
      (semNum ? resultCache[`Semester ${semNum}`] : null) ||
      (semNum ? resultCache[`sem_${semNum}`] : null)
    );
    if (cached) {
       setResultData(cached);
       setIsLoading(false);
    } else {
       setIsLoading(true);
       setResultData(null);
    }

    webViewRef.current?.injectJavaScript(`
      (function() {
        try {
          var targetVal = ${JSON.stringify(value)};
          var targetText = ${JSON.stringify(originalText || '')};
          var targetLabel = ${JSON.stringify(label || '')};

          var ddl = document.querySelector('select[name*="ddlSession"]') || 
                    document.querySelector('select[name*="Session"]') || 
                    document.querySelector('select[id*="ddlSession"]') || 
                    document.querySelector('select[name*="ddlSemester"]') || 
                    document.querySelector('select[id*="ddlSemester"]') || 
                    document.querySelector('select');
          if (ddl) {
            var matchedIndex = -1;
            for (var i = 0; i < ddl.options.length; i++) {
              if (ddl.options[i].value === targetVal) {
                matchedIndex = i;
                break;
              }
            }
            if (matchedIndex === -1 && targetText) {
              for (var i = 0; i < ddl.options.length; i++) {
                if (ddl.options[i].text.trim().toLowerCase() === targetText.trim().toLowerCase()) {
                  matchedIndex = i;
                  break;
                }
              }
            }
            if (matchedIndex === -1 && targetLabel) {
              var semM = targetLabel.match(/\\d+/);
              if (semM) {
                for (var i = 0; i < ddl.options.length; i++) {
                  if (ddl.options[i].text.includes(semM[0])) {
                    matchedIndex = i;
                    break;
                  }
                }
              }
            }

            if (matchedIndex !== -1) {
              ddl.selectedIndex = matchedIndex;
              ddl.value = ddl.options[matchedIndex].value;
            }

            var btn = document.querySelector('input[type="submit"][name*="Show" i], input[type="submit"][id*="Show" i], input[type="submit"][value*="Show" i], input[type="submit"][name*="Result" i], input[type="submit"][id*="Result" i], input[type="submit"][value*="Result" i], input[type="submit"][name*="Search" i], input[type="submit"][name*="btn" i], input[type="submit"], button[type="submit"], a[id*="btnShow" i], a[id*="btnResult" i], a[id*="btnSearch" i], a[id*="Show" i]');

            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'SELECT_SEM_DEBUG',
              matchedIndex: matchedIndex,
              selectedVal: ddl.value,
              btnFound: !!btn,
              btnDesc: btn ? (btn.tagName + '#' + btn.id + '[name=' + (btn.name || '') + '][val=' + (btn.value || btn.innerText) + ']') : 'NONE'
            }));

            if (btn) {
              btn.click();
            } else if (typeof ddl.onchange === 'function') {
              ddl.onchange();
            } else if (typeof __doPostBack === 'function') {
              __doPostBack(ddl.name, '');
            } else {
              ddl.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'SELECT_SEM_DEBUG',
            error: e.toString()
          }));
        }
      })();
      true;
    `);

    // Staggered scraping retries in case postback DOM takes varying network time
    if (!cached) {
      setTimeout(() => injectAndScrapeRef.current(), 1200);
      setTimeout(() => injectAndScrapeRef.current(), 2500);
      setTimeout(() => injectAndScrapeRef.current(), 4500);
      setTimeout(() => injectAndScrapeRef.current(), 7000);
      setTimeout(() => {
        setIsLoading((cur) => (cur ? false : false));
      }, 9000);
    }
  };

  // Merge enrolled subjects with scraped marks so ALL current semester subjects appear!
  const displayMarksList = useMemo(() => {
    const validMarks = (marks || []).filter((m: any) => m.subjectName !== '20');

    if (!subjects || subjects.length === 0) {
      return validMarks;
    }

    const matchedSubjectNames = new Set<string>();

    const merged = subjects.map((subj) => {
      const cleanSubjCode = (subj.code || '').trim().toUpperCase();
      const cleanSubjName = (subj.name || '').replace(/\s*\(?(theory|practical)\)?/gi, '').trim().toLowerCase();

      // Find mark by code or by name
      const m = validMarks.find((mark: any) => {
        const mCode = (mark.code || '').trim().toUpperCase();
        const mName = (mark.subjectName || '').replace(/\s*\(?(theory|practical)\)?/gi, '').trim().toLowerCase();
        const mFullName = (mark.fullName || '').toLowerCase();

        if (cleanSubjCode && mCode && (cleanSubjCode === mCode || cleanSubjCode.includes(mCode) || mCode.includes(cleanSubjCode))) {
          return true;
        }
        if (cleanSubjName && mName && (cleanSubjName.includes(mName) || mName.includes(cleanSubjName))) {
          return true;
        }
        if (cleanSubjCode && mFullName.includes(cleanSubjCode.toLowerCase())) {
          return true;
        }
        return false;
      });

      if (m) {
        matchedSubjectNames.add(m.subjectName);
        return {
          ...m,
          subjectName: subj.name,
          code: subj.code || m.code,
        };
      }

      // No marks yet on portal
      return {
        subjectName: subj.name,
        code: subj.code,
        mstMarks: 'N/A',
        practicalMarks: 'N/A',
        exams: [],
        isPending: true,
      };
    });

    // Also append any valid scraped marks that weren't matched to an enrolled subject
    validMarks.forEach((m: any) => {
      if (!matchedSubjectNames.has(m.subjectName)) {
        merged.push(m);
      }
    });

    return merged;
  }, [subjects, marks]);

  let grandTotalObtained = 0;
  let grandTotalMax = 0;
  let evaluatedSubjectsCount = 0;

  displayMarksList.forEach((item: any) => {
    let hasValid = false;
    if (item.exams && item.exams.length > 0) {
      item.exams.forEach((ex: any) => {
        const mx = parseFloat(ex.max);
        const ob = parseFloat(ex.obtained);
        if (!isNaN(mx) && !isNaN(ob) && mx > 0) {
          grandTotalObtained += ob;
          grandTotalMax += mx;
          hasValid = true;
        }
      });
    } else {
      if (item.mstMarks && item.mstMarks.includes('/')) {
        const p = item.mstMarks.split('/');
        if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
          grandTotalObtained += parseFloat(p[0]);
          grandTotalMax += parseFloat(p[1]);
          hasValid = true;
        }
      }
      if (item.practicalMarks && item.practicalMarks.includes('/')) {
        const p = item.practicalMarks.split('/');
        if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
          grandTotalObtained += parseFloat(p[0]);
          grandTotalMax += parseFloat(p[1]);
          hasValid = true;
        }
      }
    }
    if (hasValid) evaluatedSubjectsCount++;
  });

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
                : (selectedSemLabel ? selectedSemLabel : (derivedSemesters[derivedSemesters.length - 1]?.label || 'Result'))}
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
                    <Text style={styles.radarStatValue}>
                      {evaluatedSubjectsCount > 0 ? `${evaluatedSubjectsCount} of ${displayMarksList.length}` : `${displayMarksList.length} Subjects`}
                    </Text>
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

        {!isCurrentSemester && isLoading && !refreshing && (
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

        {/* Empty state for past semester when no result data found */}
        {!isCurrentSemester && !isLoading && (!resultData || !resultData.subjects || resultData.subjects.length === 0) && (
          <View style={styles.listContainer}>
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
                <Text style={[styles.emptyInternalTitle, { color: colors.text }]}>No Transcripts Found</Text>
                <Text style={styles.emptyInternalDesc}>
                  No finalized exam results were published for this semester on the university portal yet.
                </Text>
              </LinearGradient>
            </View>
          </View>
        )}

        {/* Current Semester: Internal Marks List */}
        {isCurrentSemester && (
          <View style={styles.listContainer}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.listTitle}>Internal Marks</Text>
                <Text style={styles.sectionSubTitle}>MST & continuous evaluation components</Text>
              </View>
              {overallPercentage ? (
                <View style={styles.overallBadge}>
                  <Text style={styles.overallBadgeText}>{overallPercentage}</Text>
                </View>
              ) : null}
            </View>

            {displayMarksList && displayMarksList.length > 0 ? (
              displayMarksList.map((item: any, index: number) => {
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
                const isCurrent = opt.label.includes('(Current)');
                const isSel = selectedSemLabel ? selectedSemLabel === opt.label : isCurrent;
                const isMay = opt.originalText.toLowerCase().includes('may') || opt.originalText.toLowerCase().includes('odd');
                const isDec = opt.originalText.toLowerCase().includes('dec') || opt.originalText.toLowerCase().includes('even') || opt.originalText.toLowerCase().includes('nov');
                const accentColor = isCurrent ? colors.primary : isMay ? '#f59e0b' : isDec ? '#3b82f6' : colors.primary;
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
                          name={isCurrent ? 'school-outline' : isMay ? 'sunny-outline' : isDec ? 'snow-outline' : 'trophy-outline'}
                          size={18}
                          color={accentColor}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalOptionTitle, { color: isSel ? accentColor : colors.text }]}>
                          {opt.label}
                        </Text>
                        <Text style={styles.modalOptionSub}>
                          {isCurrent
                            ? 'Current Ongoing Session'
                            : isMay
                            ? 'Summer Examination Session'
                            : isDec
                            ? 'Winter Examination Session'
                            : opt.originalText}
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
      {rawCookie && (
        <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute', left: -1000 }}>
           <WebView
             key={`result_wv_${refreshKey}`}
             ref={webViewRef}
             source={{ 
               uri: 'https://student.culko.in/result.aspx',
               headers: { Cookie: rawCookie }
             }}
             injectedJavaScriptBeforeContentLoaded={cookieScript || undefined}
             onNavigationStateChange={handleNavigationStateChange}
             onMessage={handleMessage}
             onError={(e) => console.log('WEBVIEW ERROR:', e.nativeEvent.description)}
             onHttpError={(e) => console.log('WEBVIEW HTTP ERROR:', e.nativeEvent.statusCode)}
             javaScriptEnabled={true}
             domStorageEnabled={true}
             sharedCookiesEnabled={true}
             thirdPartyCookiesEnabled={true}
           />
           <WebView
             key={`marks_wv_${refreshKey}`}
             ref={marksWebViewRef}
             source={{ 
               uri: 'https://student.culko.in/frmStudentMarksView.aspx',
               headers: { Cookie: rawCookie }
             }}
             injectedJavaScriptBeforeContentLoaded={cookieScript || undefined}
             onNavigationStateChange={handleMarksNavigationStateChange}
             onMessage={handleMessage}
             onError={(e) => console.log('MARKS WEBVIEW ERROR:', e.nativeEvent.description)}
             onHttpError={(e) => console.log('MARKS WEBVIEW HTTP ERROR:', e.nativeEvent.statusCode)}
             javaScriptEnabled={true}
             domStorageEnabled={true}
             sharedCookiesEnabled={true}
             thirdPartyCookiesEnabled={true}
           />
        </View>
      )}
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
  const exams = item.exams || [];
  const hasExams = exams.length > 0;

  const mst = parseMarksString(item.mstMarks);
  const practical = parseMarksString(item.practicalMarks);

  let totalObtained = 0;
  let totalMax = 0;
  let hasValid = false;

  if (hasExams) {
    exams.forEach((ex: any) => {
      const maxN = parseFloat(ex.max);
      const obtN = parseFloat(ex.obtained);
      if (!isNaN(maxN) && !isNaN(obtN) && maxN > 0) {
        totalObtained += obtN;
        totalMax += maxN;
        hasValid = true;
      }
    });
  } else {
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
  }

  const scorePct = hasValid && totalMax > 0 ? (totalObtained / totalMax) * 100 : null;
  const scoreBadgeColor = scorePct === null ? colors.textMuted : (scorePct >= 75 ? '#22c55e' : (scorePct >= 60 ? '#f59e0b' : '#ef4444'));

  // Clean subject display name
  const cleanTitle = (item.subjectName || item.fullName || 'Subject')
    .replace(/\s*\(?(theory|practical)\)?/gi, '')
    .trim();
  const subjectCode = item.code || (cleanTitle.match(/\(([0-9A-Z]{2,8}[-_]?[0-9]{3})\)/i)?.[1]);

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
            borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)',
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
              {subjectCode ? (
                <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>{subjectCode}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[stylesInternal.title, { color: colors.text }]} numberOfLines={2}>
              {cleanTitle}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <View style={[stylesInternal.miniDot, { backgroundColor: scoreBadgeColor }]} />
              <Text style={{ color: colors.textMuted, fontSize: 11.5, fontFamily: 'Inter_500Medium' }}>
                {hasValid 
                  ? `${totalObtained}/${totalMax} Total Marks${hasExams ? ` • ${exams.length} Component${exams.length > 1 ? 's' : ''}` : ''}`
                  : 'Pending Evaluation'}
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
                <Text style={[stylesInternal.pctText, { color: colors.textMuted }]}>Pending</Text>
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
            {hasExams ? (
              exams.map((ex: any, exIdx: number) => {
                const exMax = parseFloat(ex.max);
                const exObt = parseFloat(ex.obtained);
                const exPct = (!isNaN(exMax) && !isNaN(exObt) && exMax > 0) ? Math.min(100, Math.max(0, (exObt / exMax) * 100)) : null;
                const isMid = ex.name.toLowerCase().includes('mid') || ex.name.toLowerCase().includes('mst');
                const isPrac = ex.name.toLowerCase().includes('prac') || ex.name.toLowerCase().includes('lab');
                const iconName = isMid ? 'document-text-outline' : isPrac ? 'flask-outline' : 'clipboard-outline';
                const iconColor = isMid ? '#10b981' : isPrac ? '#10b981' : '#f59e0b';

                return (
                  <View key={exIdx.toString()} style={stylesInternal.metricBox}>
                    <View style={stylesInternal.metricLabelRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                        <Ionicons name={iconName as any} size={14} color={iconColor} />
                        <Text style={[stylesInternal.metricLabel, { color: colors.text }]} numberOfLines={1}>
                          {ex.name}
                        </Text>
                      </View>
                      <Text style={[stylesInternal.metricValue, { color: exPct !== null ? colors.text : colors.textMuted }]}>
                        {ex.obtained}/{ex.max}
                      </Text>
                    </View>
                  </View>
                );
              })
            ) : hasValid ? (
              <>
                {mst.isValid && (
                  <View style={stylesInternal.metricBox}>
                    <View style={stylesInternal.metricLabelRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="document-text-outline" size={14} color="#10b981" />
                        <Text style={[stylesInternal.metricLabel, { color: colors.text }]}>Mid-Semester Test (MST)</Text>
                      </View>
                      <Text style={[stylesInternal.metricValue, { color: colors.text }]}>{mst.text}</Text>
                    </View>
                  </View>
                )}
                {practical.isValid && (
                  <View style={stylesInternal.metricBox}>
                    <View style={stylesInternal.metricLabelRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="flask-outline" size={14} color="#10b981" />
                        <Text style={[stylesInternal.metricLabel, { color: colors.text }]}>Practical / Lab Marks</Text>
                      </View>
                      <Text style={[stylesInternal.metricValue, { color: colors.text }]}>{practical.text}</Text>
                    </View>
                  </View>
                )}
              </>
            ) : (
              <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                  No internal marks uploaded by faculty on CUIMS yet
                </Text>
              </View>
            )}
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
