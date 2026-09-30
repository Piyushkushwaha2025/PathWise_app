import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import { useThemeStore } from '../../../store/useThemeStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { useStudySessionStore } from '../../../store/studySessionStore';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { syncUserWithDB } from '../../../lib/db';
import timetableData from './timetableData.json';
import * as Notifications from 'expo-notifications';
import { setupAndroidChannels } from '../../../lib/notifications';

const SCRAPE_STEPS = [
  {
    id: 'profile',
    url: 'https://student.culko.in/frmStudentProfile.aspx',
    msg: 'Extracting Profile...',
    script: `
      (function() {
        var hasScraped = false;
        function tryScrape() {
          if (hasScraped) return;
          try {
            var name = 'Unknown';
            var uid = 'Unknown';
            var course = 'Unknown';
            var semester = 'N/A';
            var section = '';
            
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
               var secMatch = tds[i].innerText.match(/(?:section|sec|class\/sec|class\s*\/\s*section)\s*[:\-\s]\s*([0-9A-Z\-]+)/i);
               if (secMatch && !secMatch[1].match(/^\d{3,4}$/)) {
                 section = secMatch[1].trim();
               } else if (txt.includes('section')) {
                 var nextVal = tds[i+1]?.innerText.trim() || '';
                 if (nextVal && !nextVal.toLowerCase().includes('semester') && !nextVal.toLowerCase().includes('fee') && !nextVal.match(/^\d{3,4}$/)) {
                   section = nextVal;
                 }
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
                 if (id.includes('section')) {
                   if (val && !val.toLowerCase().includes('section') && !val.match(/^\d{3,4}$/)) section = val;
                 }
               }
            }

            var photoUrl = '';
            var imgs = document.querySelectorAll('img');
            for (var m = 0; m < imgs.length; m++) {
               var imgId = imgs[m].id.toLowerCase();
               var imgSrc = imgs[m].src;
               if (imgId.includes('photo') || imgId.includes('student') || imgId.includes('profile')) {
                  if (imgSrc && !imgSrc.toLowerCase().includes('logo') && !imgSrc.toLowerCase().includes('header')) {
                     photoUrl = imgSrc;
                     break;
                  }
               }
            }

            if (name !== 'Unknown' || uid !== 'Unknown' || tds.length > 8) {
              hasScraped = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SCRAPE_RESULT',
                step: 'profile',
                data: { name: name, uid: uid, course: course, cgpa: 'N/A', semester: semester, section: section, photoUrl: photoUrl }
              }));
            }
          } catch(e) {
            hasScraped = true;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'profile', data: null }));
          }
        }

        tryScrape();
        var timer = setInterval(function() {
          if (hasScraped) { clearInterval(timer); return; }
          tryScrape();
        }, 80);
        setTimeout(function() {
          if (!hasScraped) {
            clearInterval(timer);
            tryScrape();
            if (!hasScraped) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'profile', data: null }));
            }
          }
        }, 2000);
      })();
      true;
    `
  },
  {
    id: 'attendance',
    url: 'https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx?type=etgkYfqBdH1fSfc255iYGw==',
    msg: 'Extracting Attendance & Subjects...',
    script: `
      (function() {
        var hasScraped = false;
        function tryScrape() {
          if (hasScraped) return;
          try {
            var attendanceData = {};
            var subjectsList = [];
            var seenCodes = {};

            var rows = document.querySelectorAll('#SortTable tbody tr, #SortTable tr, table.GridView tr, table tr');
            for (var i = 0; i < rows.length; i++) {
              var cells = rows[i].querySelectorAll('td');
              if (cells.length >= 4) {
                var textArr = Array.from(cells).map(function(c) { return c.innerText.trim(); });
                var code = null;
                for (var x = 0; x < textArr.length; x++) {
                  if (/^[0-9A-Z]{2,8}[-_]?[0-9]{3}/i.test(textArr[x])) { code = textArr[x]; break; }
                }
                if (!code) continue;

                var title = textArr[1] || textArr[0] || code;
                var total = 0, attended = 0, percentage = 0;

                // Check for eligible delivered / attended columns or fallback
                if (cells.length >= 11) {
                  var eligDelv = parseFloat(cells[8]?.innerText.trim()) || 0;
                  var eligAttd = parseFloat(cells[9]?.innerText.trim()) || 0;
                  var eligPerc = parseFloat((cells[10]?.innerText.trim() || '').replace('%', '')) || 0;

                  var rawDelv = parseFloat(cells[2]?.innerText.trim()) || 0;
                  var rawAttd = parseFloat(cells[3]?.innerText.trim()) || 0;

                  total = eligDelv > 0 ? eligDelv : rawDelv;
                  attended = eligAttd > 0 ? eligAttd : rawAttd;
                  percentage = eligPerc > 0 ? eligPerc : (total > 0 ? Math.round((attended / total) * 100) : 0);
                } else {
                  var nums = [];
                  for (var n = 0; n < textArr.length; n++) {
                    var cl = textArr[n].replace('%', '').trim();
                    if (cl !== '' && !isNaN(Number(cl))) nums.push(Number(cl));
                  }
                  if (nums.length >= 2) {
                    percentage = nums[nums.length - 1];
                    attended = nums[nums.length - 2] || 0;
                    total = nums[nums.length - 3] || 0;
                  }
                }

                // View target
                var viewActionTarget = '';
                var viewBtn = rows[i].querySelector('input[value="VIEW"], input[value="View"], input[chk]');
                if (viewBtn && viewBtn.getAttribute('chk')) {
                  var chkVal = viewBtn.getAttribute('chk');
                  var hiddenInp = rows[i].querySelector('input[type="hidden"]') || document.querySelector('input[name*="UID"]');
                  if (hiddenInp && hiddenInp.value) viewActionTarget = hiddenInp.value + '|' + chkVal;
                }

                var dataObj = { total: total, attended: attended, percentage: percentage, viewActionTarget: viewActionTarget };
                attendanceData[code] = dataObj;
                if (title && title !== code) attendanceData[title] = dataObj;

                if (!seenCodes[code]) {
                  seenCodes[code] = true;
                  subjectsList.push({
                    code: code,
                    name: title,
                    credits: '3.0',
                    totalClasses: total,
                    attendedClasses: attended,
                    attendancePercentage: percentage,
                    viewActionTarget: viewActionTarget
                  });
                }
              }
            }

            if (Object.keys(attendanceData).length > 0) {
              var sumDelv = 0, sumAttd = 0;
              for (var s = 0; s < subjectsList.length; s++) {
                sumDelv += subjectsList[s].totalClasses || 0;
                sumAttd += subjectsList[s].attendedClasses || 0;
              }
              var overallPct = sumDelv > 0 ? Math.round((sumAttd / sumDelv) * 100) : 0;

              hasScraped = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SCRAPE_RESULT',
                step: 'attendance',
                data: { 
                  attendance: attendanceData, 
                  subjects: subjectsList,
                  overallAttendance: overallPct,
                  totalDelivered: sumDelv,
                  totalAttended: sumAttd
                }
              }));
            }
          } catch(e) {
            hasScraped = true;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'attendance', data: null }));
          }
        }

        tryScrape();
        var timer = setInterval(function() {
          if (hasScraped) { clearInterval(timer); return; }
          tryScrape();
        }, 80);
        setTimeout(function() {
          if (!hasScraped) {
            clearInterval(timer);
            tryScrape();
            if (!hasScraped) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'attendance', data: null }));
            }
          }
        }, 2200);
      })();
      true;
    `
  },
  {
    id: 'subjects',
    url: 'https://student.culko.in/frmMyCourse.aspx',
    msg: 'Extracting Course Structure...',
    script: `
      (function() {
        var hasScraped = false;
        function tryScrape() {
          if (hasScraped) return;
          try {
            var subjects = [];
            var section = '';
            var headerCells = document.querySelectorAll('#ContentPlaceHolder1_gvMyCourses tr:first-child th, table.GridView tr:first-child th, table tr:first-child th');
            var creditIdx = -1;
            var sectionIdx = -1;
            var codeIdx = -1;
            var nameIdx = -1;
            var typeIdx = -1;

            for (var h = 0; h < headerCells.length; h++) {
               var hText = (headerCells[h].innerText || '').toLowerCase().trim();
               if (hText.includes('credit') || hText === 'cr' || hText === 'cr.' || hText.includes('credit hour')) {
                  creditIdx = h;
               } else if (hText.includes('section') || hText.includes('sec.')) {
                  sectionIdx = h;
               } else if (hText.includes('course code') || hText.includes('subject code') || hText === 'code') {
                  codeIdx = h;
               } else if (hText.includes('course name') || hText.includes('subject name') || hText.includes('course title') || hText === 'title') {
                  nameIdx = h;
               } else if (hText.includes('type') || hText.includes('category')) {
                  typeIdx = h;
               }
            }

            var rows = document.querySelectorAll('#ContentPlaceHolder1_gvMyCourses tr, table.GridView tr, table tr');
            for (var i = 1; i < rows.length; i++) {
              var cells = rows[i].querySelectorAll('td');
              if (cells.length < 2) continue;

              var code = rows[i].querySelector('span[id*="lblCourseCode"], span[id*="CourseCode"]')?.innerText.trim() || '';
              if (!code && codeIdx !== -1 && cells.length > codeIdx) code = cells[codeIdx].innerText.trim();

              var name = rows[i].querySelector('span[id*="lblCourseName"], span[id*="CourseName"]')?.innerText.trim() || '';
              if (!name && nameIdx !== -1 && cells.length > nameIdx) name = cells[nameIdx].innerText.trim();

              var type = rows[i].querySelector('span[id*="lblType"], span[id*="Type"]')?.innerText.trim() || '';
              if (!type && typeIdx !== -1 && cells.length > typeIdx) type = cells[typeIdx].innerText.trim();

              if (!section && sectionIdx !== -1 && cells.length > sectionIdx) {
                 var secVal = cells[sectionIdx].innerText.trim();
                 if (secVal && !/^\d{3,4}$/.test(secVal)) section = secVal;
              }

              // Extract Credits with utmost accuracy
              var credits = '';
              if (creditIdx !== -1 && cells.length > creditIdx) {
                 var cVal = cells[creditIdx].innerText.trim();
                 if (/^[0-9]+(\.[0-9]+)?$/.test(cVal)) credits = cVal;
              }
              if (!credits) {
                 var creditSpan = rows[i].querySelector('span[id*="Credit" i], span[id*="Credits" i], span[id*="Cr" i]');
                 if (creditSpan && /^[0-9]+(\.[0-9]+)?$/.test(creditSpan.innerText.trim())) {
                    credits = creditSpan.innerText.trim();
                 }
              }
              if (!credits) {
                 // Check non-first columns (never take column 0 Sr. No.!)
                 for (var c = 1; c < cells.length; c++) {
                    if (c === codeIdx || c === nameIdx || c === sectionIdx) continue;
                    var t = cells[c].innerText.trim();
                    if (/^(0|1|2|3|4|5|6)(\.(0|5))?$/.test(t) && !cells[c].querySelector('input, a, select')) {
                       credits = t;
                       break;
                    }
                 }
              }
              if (!credits) {
                 var isLab = (type && /lab|prac/i.test(type)) || (name && /lab|prac/i.test(name)) || (code && code.endsWith('P'));
                 credits = isLab ? '1.0' : '4.0';
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

            if (!section) {
              var secSelect = document.querySelector('select[id*="Section" i], select[name*="Section" i]');
              if (secSelect && secSelect.selectedOptions && secSelect.selectedOptions[0]) {
                var optText = secSelect.selectedOptions[0].text.trim();
                if (optText && !optText.toLowerCase().includes('select')) section = optText;
              }
            }

            if (subjects.length > 0) {
              hasScraped = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SCRAPE_RESULT',
                step: 'subjects',
                data: { list: subjects, section: section }
              }));
            }
          } catch(e) {
            hasScraped = true;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'subjects', data: { list: [], section: '' } }));
          }
        }

        tryScrape();
        var timer = setInterval(function() {
          if (hasScraped) { clearInterval(timer); return; }
          tryScrape();
        }, 80);
        setTimeout(function() {
          if (!hasScraped) {
            clearInterval(timer);
            tryScrape();
            if (!hasScraped) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'subjects', data: { list: [], section: '' } }));
            }
          }
        }, 2200);
      })();
      true;
    `
  },
  {
    id: 'timetable',
    url: 'https://student.culko.in/frmMyTimeTable.aspx',
    msg: 'Extracting Timetable...',
    script: `
      (function() {
        var hasScraped = false;
        function tryScrape() {
          if (hasScraped) return;
          try {
            var timetable = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] };
            var daysMap = [null, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
            
            var detectedSection = '';
            var headings = document.querySelectorAll('h1, h2, h3, h4, label, span, td');
            for (var h = 0; h < headings.length; h++) {
              var ht = headings[h].innerText || '';
              var m = ht.match(/\b(\d{2}[A-Z]{2,5}-[A-Z]{0,6}-?\d{1,2})\b/);
              if (m) { detectedSection = m[1]; break; }
            }
            
            var hasClasses = Object.values(timetable).some(function(arr) { return arr.length > 0; });
            if (hasClasses) {
              hasScraped = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SCRAPE_RESULT',
                step: 'timetable',
                data: timetable,
                section: detectedSection
              }));
            }
          } catch(e) {
            hasScraped = true;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'timetable', data: null }));
          }
        }

        tryScrape();
        var timer = setInterval(function() {
          if (hasScraped) { clearInterval(timer); return; }
          tryScrape();
        }, 80);
        setTimeout(function() {
          if (!hasScraped) {
            clearInterval(timer);
            tryScrape();
            if (!hasScraped) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'timetable', data: null }));
            }
          }
        }, 2000);
      })();
      true;
    `
  },
  {
    id: 'marks',
    url: 'https://student.culko.in/frmStudentMarksView.aspx',
    msg: 'Extracting Internal Marks...',
    script: `
      (function() {
        var hasScraped = false;
        function tryScrape() {
          if (hasScraped) return;
          try {
            var marksData = [];
            var headers = document.querySelectorAll('#accordion h3, #accordion h2, #accordion h4, .ui-accordion-header, h3, h4');
            for (var i = 0; i < headers.length; i++) {
              var hText = headers[i].innerText ? headers[i].innerText.trim() : '';
              if (!hText || hText.length < 3) continue;

              var next = headers[i].nextElementSibling;
              var tbl = null;
              while (next && next.tagName !== 'H3' && next.tagName !== 'H2' && next.tagName !== 'H4') {
                if (next.tagName === 'TABLE') { tbl = next; break; }
                var foundTbl = next.querySelector('table');
                if (foundTbl) { tbl = foundTbl; break; }
                next = next.nextElementSibling;
              }

              if (tbl) {
                var codeMatch = hText.match(/\(([0-9A-Z]{2,8}[-_]?[0-9]{3})\)/i);
                var code = codeMatch ? codeMatch[1] : '';
                var sName = hText.replace(/\s*\([0-9A-Z]{2,8}[-_]?[0-9]{3}\)/i, '').trim() || hText;

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

            if (marksData.length > 0) {
              hasScraped = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: marksData }));
            }
          } catch(e) {
            hasScraped = true;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: [] }));
          }
        }

        tryScrape();
        var timer = setInterval(function() {
          if (hasScraped) { clearInterval(timer); return; }
          tryScrape();
        }, 80);
        setTimeout(function() {
          if (!hasScraped) {
            clearInterval(timer);
            tryScrape();
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: [] }));
          }
        }, 2000);
      })();
      true;
    `
  },
];

const STEP_PAGES: Record<string, string> = {
  profile: 'frmstudentprofile',
  attendance: 'frmstudentcoursewiseattendancesummary',
  subjects: 'frmmycourse',
  timetable: 'frmmytimetable',
  marks: 'frmstudentmarksview',
};

export default function SyncScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { userId } = useAuth();
  const { user } = useUser();
  const { setScrapedData } = useStudyOSStore();
  const { setSession, clearSession } = useStudySessionStore();
  const webViewRef = useRef<WebView>(null);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentStep = SCRAPE_STEPS[currentStepIndex];

  const scrapedDataRef = useRef<any>({});
  const cookieRef = useRef<string>('');
  const finishedRef = useRef(false);
  const stepIndexRef = useRef(0);
  const hasExecutedStepRef = useRef(false);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [cookiesLoaded, setCookiesLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      scrapedDataRef.current = {};
      cookieRef.current = '';
      finishedRef.current = false;
      stepIndexRef.current = 0;
      hasExecutedStepRef.current = false;
      setCurrentStepIndex(0);
      setShowSkipButton(false);
      setCookiesLoaded(false);

      SecureStore.getItemAsync('culko_cookies').then((c) => {
        if (c) {
          cookieRef.current = c;
          console.log('[Sync] Pre-loaded cookies from SecureStore');
        }
        setCookiesLoaded(true);
      }).catch(() => {
        setCookiesLoaded(true);
      });
    }, [])
  );

  useEffect(() => {
    stepIndexRef.current = currentStepIndex;
    hasExecutedStepRef.current = false;
  }, [currentStepIndex]);

  const executeCurrentStepScript = (url?: string) => {
    if (hasExecutedStepRef.current) return;
    const step = SCRAPE_STEPS[stepIndexRef.current];
    if (!step) return;

    const targetPage = STEP_PAGES[step.id];
    const checkUrl = (url || '').toLowerCase();
    // Guard against running scraper on the previous or wrong page!
    if (targetPage && checkUrl && !checkUrl.includes(targetPage)) {
      return;
    }

    hasExecutedStepRef.current = true;

    let cookieInject = '';
    if (cookieRef.current) {
      const parts = cookieRef.current.split(';').map((c: string) => c.trim()).filter(Boolean);
      cookieInject = parts.map((c: string) => `document.cookie = ${JSON.stringify(c + '; path=/')};`).join('\n');
    }

    const scriptToRun = `
      (function() {
        try {
          var c = document.cookie;
          if (c) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOKIES', data: c }));
        } catch(e) {}
      })();
      ${cookieInject}
      ${step.script}
      true;
    `;

    webViewRef.current?.injectJavaScript(scriptToRun);
  };

  const finalizeSync = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    try {
      const existing = useStudyOSStore.getState();
      const newData = scrapedDataRef.current;
      const subjList = newData.subjects?.list || [];

      // Determine base subjects with multiple intelligent fallbacks
      let baseSubjects = subjList.length > 0 ? subjList : (existing.subjects || []);

      // If still empty, synthesize subjects directly from scraped attendance
      if (baseSubjects.length === 0 && newData.attendance) {
        const attObj = newData.attendance.attendance || newData.attendance;
        const synthList: any[] = [];
        const seen = new Set<string>();

        for (const [key, val] of Object.entries(attObj) as [string, any][]) {
          const code = val?.code || (/^[0-9A-Z]{2,8}[-_]?[0-9]{3}/i.test(key) ? key : '');
          if (code && !seen.has(code)) {
            seen.add(code);
            synthList.push({
              code: code,
              name: val?.title || (key !== code ? key : code),
              credits: '3.0',
              totalClasses: val?.total || 0,
              attendedClasses: val?.attended || 0,
              attendancePercentage: val?.percentage || 0,
              viewActionTarget: val?.viewActionTarget
            });
          }
        }
        if (synthList.length > 0) baseSubjects = synthList;
      }

      // Merge attendance into each subject
      const rawAttendance = newData.attendance?.attendance || newData.attendance || {};
      const updatedSubjects = (baseSubjects || []).map((subj: any) => {
        let att = rawAttendance[subj.code];
        if (!att && subj.code) {
          const cleanCode = subj.code.replace(/^[A-Z]+_/, '').trim();
          att = rawAttendance[cleanCode];
          if (!att) {
            const matchingKey = Object.keys(rawAttendance).find(k => subj.code?.includes(k) || k.includes(cleanCode));
            if (matchingKey) att = rawAttendance[matchingKey];
          }
        }
        if (att) {
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

      // Helper to clean and validate section string
      const cleanSection = (rawSec: string | undefined, uid?: string, courseName?: string): string => {
        if (!rawSec) return '';
        let s = rawSec.trim().toUpperCase();
        // Reject corrupted course-code prefixes (e.g. 25CSH-21, 25CST-20, etc.)
        if (/^25(CSH|CST|MTT|UCT|ECH|ECP|AMP)/i.test(s)) return '';
        if (/^[0-9A-Z]{2,6}-\d{3,4}/i.test(s)) return ''; // course code like 25CSH-214
        
        // Single digit or letter section (e.g. "1", "2", "A", "B")
        if (/^\d{1,2}$/.test(s) && uid) {
          const uidPrefix = uid.match(/^(\d{2}[A-Z]{2,4})/i)?.[1]?.toUpperCase();
          if (uidPrefix) {
            if (courseName && /artificial|aiml|ai\s*&/i.test(courseName)) return `${uidPrefix}-AIML-${s}`;
            if (courseName && /data science|ds/i.test(courseName)) return `${uidPrefix}-DS-${s}`;
            return `${uidPrefix}-${s}`;
          }
        }
        return s;
      };

      // Resolved Profile
      const savedUid = await SecureStore.getItemAsync('culko_u').catch(() => null);
      const effectiveUid =
        (newData.profile?.uid && newData.profile.uid !== 'Unknown' && newData.profile.uid !== 'Error')
          ? newData.profile.uid
          : (savedUid || existing.profile?.uid || undefined);

      const resolvedSection =
        cleanSection(newData.subjects?.section, effectiveUid, newData.profile?.course) ||
        cleanSection(newData.timetable?.section, effectiveUid, newData.profile?.course) ||
        cleanSection(newData.profile?.section, effectiveUid, newData.profile?.course) ||
        cleanSection(existing.profile?.section, effectiveUid, existing.profile?.course) ||
        '';

      const resolvedProfile = {
        ...(existing.profile || {}),
        ...(newData.profile || {}),
        name: (newData.profile?.name && newData.profile.name !== 'Unknown' && newData.profile.name !== 'Error')
          ? newData.profile.name
          : (existing.profile?.name || user?.fullName || 'Student'),
        uid: effectiveUid || 'Unknown',
        section: resolvedSection,
        overallAttendance: newData.attendance?.overallAttendance !== undefined ? newData.attendance.overallAttendance : existing.profile?.overallAttendance
      };

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
        const bestSection = findBestTimetableSection(resolvedSection);
        if (bestSection && (timetableData as any)[bestSection]) {
          finalTimetable = { ...(timetableData as any)[bestSection], isStaticJSONFallback: true };
        }
      }

      await setScrapedData({
        profile: resolvedProfile,
        subjects: updatedSubjects,
        timetable: finalTimetable,
        marks: (newData.marks && newData.marks.length) ? newData.marks : existing.marks,
        datesheet: existing.datesheet || [],
        isScrapedDataLoaded: true
      });
      // Trigger notification if new internal marks were uploaded
      if (newData.marks && Array.isArray(newData.marks) && newData.marks.length > 0) {
        const newMarksSig = newData.marks.map((m: any) => `${m.code || m.subjectName}:${(m.exams || []).length}:${m.mstMarks || ""}:${m.practicalMarks || ""}`).sort().join("|");
        AsyncStorage.getItem("studyos_last_marks_notif_sig").then(async (prevSig) => {
          if (prevSig && prevSig !== newMarksSig) {
            const updatedSubjs: string[] = [];
            newData.marks.forEach((m: any) => {
              const old = (existing.marks || []).find((pm: any) => (pm.code && pm.code === m.code) || pm.subjectName === m.subjectName);
              const oldExamsLen = (old?.exams || []).length;
              const newExamsLen = (m.exams || []).length;
              if (newExamsLen > oldExamsLen || (m.mstMarks && m.mstMarks !== old?.mstMarks) || (m.practicalMarks && m.practicalMarks !== old?.practicalMarks)) {
                updatedSubjs.push(m.subjectName || m.code);
              }
            });
            if (updatedSubjs.length > 0) {
              try {
                await setupAndroidChannels().catch(() => {});
                const perm = await Notifications.getPermissionsAsync().catch(() => ({ status: "undetermined" }));
                if (perm.status !== "granted") {
                  await Notifications.requestPermissionsAsync().catch(() => {});
                }
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: "📊 New Marks Uploaded!",
                    body: `New marks uploaded for: ${updatedSubjs.slice(0, 2).join(", ")}${updatedSubjs.length > 2 ? " +" + (updatedSubjs.length - 2) + " more" : ""}`,
                    sound: true,
                    color: "#3b82f6",
                    channelId: "pathwise-coin-v2",
                  } as any,
                  trigger: null,
                });
              } catch(e) {}
            }
          }
          await AsyncStorage.setItem("studyos_last_marks_notif_sig", newMarksSig).catch(() => {});
        }).catch(() => {});
      }

      if (userId && (effectiveUid || resolvedSection)) {
        try {
          await Promise.race([
            syncUserWithDB(userId, {
              section_code: resolvedSection || undefined,
              uid: effectiveUid,
              name: resolvedProfile.name || undefined,
              semester: resolvedProfile.semester ? String(resolvedProfile.semester) : undefined,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('DB Sync timeout')), 6000))
          ]);
        } catch (e: any) {
          if (e?.code === 'UID_ALREADY_LINKED') {
            await SecureStore.deleteItemAsync('culko_cookies').catch(() => {});
            await SecureStore.deleteItemAsync('culko_u').catch(() => {});
            await SecureStore.deleteItemAsync('culko_p').catch(() => {});
            await clearSession();
            Alert.alert(
              'Account Locked',
              e.message || 'This College ID is already linked to another PathWise account.',
              [{ text: 'OK', onPress: () => router.replace('/(app)/studyos/connect' as any) }]
            );
            return;
          } else {
            console.warn('[Sync] Non-fatal user DB sync notice:', e?.message);
          }
        }
      }

      await setSession('cu', 'culko-scraped', 0);

      if (cookieRef.current) {
        await SecureStore.setItemAsync('culko_cookies', cookieRef.current).catch(() => {});
        await AsyncStorage.setItem('culko_cookies', cookieRef.current).catch(() => {});
      }

      setTimeout(() => {
        router.navigate('/(app)/dashboard');
      }, 50);
    } catch (error: any) {
      console.error('Finalize sync error:', error);
      router.navigate('/(app)/dashboard');
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'COOKIES') {
        if (data.data) {
          cookieRef.current = data.data;
          SecureStore.setItemAsync('culko_cookies', data.data).catch(() => {});
          AsyncStorage.setItem('culko_cookies', data.data).catch(() => {});
        }
      } else if (data.type === 'SCRAPE_RESULT') {
        const expectedStep = SCRAPE_STEPS[stepIndexRef.current];

        // Always save valid data if present
        if (data.data && data.step) {
          scrapedDataRef.current[data.step] = data.data;
          // Incremental persistence
          if (data.step === 'attendance' && data.data.subjects?.length) {
            useStudyOSStore.getState().setScrapedData({ subjects: data.data.subjects });
          } else if (data.step === 'subjects' && data.data.list?.length) {
            useStudyOSStore.getState().setScrapedData({ subjects: data.data.list });
          } else if (data.step === 'profile' && data.data.name) {
            useStudyOSStore.getState().setScrapedData({ profile: data.data });
          } else if (data.step === 'timetable' && data.data) {
            useStudyOSStore.getState().setScrapedData({ timetable: data.data });
          } else if (data.step === 'marks' && data.data?.length) {
            useStudyOSStore.getState().setScrapedData({ marks: data.data });
          }
        }

        // Only advance step if response matches expected step
        if (expectedStep && data.step === expectedStep.id) {
          const nextIndex = stepIndexRef.current + 1;
          if (nextIndex < SCRAPE_STEPS.length) {
            hasExecutedStepRef.current = false;
            stepIndexRef.current = nextIndex;
            setCurrentStepIndex(nextIndex);
            // Navigate the single warm webview to the next step URL immediately
            const nextStep = SCRAPE_STEPS[nextIndex];
            webViewRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(nextStep.url)}; true;`);
          } else {
            await finalizeSync();
          }
        }
      }
    } catch (e) {
      console.log('Error parsing scrape message', e);
    }
  };

  // Safety net: 6.0 seconds per step
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!finishedRef.current && currentStep) {
        console.log('[Sync] Step safety timeout:', currentStep.id);
        handleMessage({ nativeEvent: { data: JSON.stringify({ type: 'SCRAPE_RESULT', step: currentStep.id, data: null }) } });
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [currentStepIndex]);

  // Show skip button after 4s
  useEffect(() => {
    setShowSkipButton(false);
    const t = setTimeout(() => setShowSkipButton(true), 4000);
    return () => clearTimeout(t);
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

      {/* Persistent Single Hidden WebView to perform rapid scraping */}
      <View style={styles.hiddenWebviewContainer}>
        {cookiesLoaded && (
          <WebView
            key="studyos_sync_webview"
            ref={webViewRef}
            source={{
              uri: SCRAPE_STEPS[0].url,
              headers: cookieRef.current ? { Cookie: cookieRef.current } : undefined
            }}
            injectedJavaScriptBeforeContentLoaded={
              cookieRef.current
                ? cookieRef.current.split(';').map((c: string) => `document.cookie = ${JSON.stringify(c.trim() + '; path=/')};`).join('\n') + '\ntrue;'
                : undefined
            }
            onNavigationStateChange={(navState: WebViewNavigation) => {
              if (!navState.loading) {
                executeCurrentStepScript(navState.url);
              }
            }}
            onLoadEnd={(e) => {
              executeCurrentStepScript(e.nativeEvent.url);
            }}
            onMessage={handleMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            cacheEnabled={true}
            onError={(e) => {
              console.log('[Sync] WebView Error on step:', currentStep?.id, e.nativeEvent.description);
              if (currentStep) {
                handleMessage({ nativeEvent: { data: JSON.stringify({ type: 'SCRAPE_RESULT', step: currentStep.id, data: null }) } });
              }
            }}
            onHttpError={(e) => {
              console.log('[Sync] WebView HTTP Error on step:', currentStep?.id, e.nativeEvent.statusCode);
              if (currentStep) {
                handleMessage({ nativeEvent: { data: JSON.stringify({ type: 'SCRAPE_RESULT', step: currentStep.id, data: null }) } });
              }
            }}
          />
        )}
      </View>
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
