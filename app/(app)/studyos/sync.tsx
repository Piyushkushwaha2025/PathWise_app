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
    msg: 'Extracting Profile & Photo...',
    script: `
      (function() {
        try {
          var name = 'Unknown';
          var uid = 'Unknown';
          var course = 'Unknown';
          var semester = 'N/A';
          var section = '';
          var cgpa = 'N/A';
          
          var tds = document.querySelectorAll('td');
          for (var i = 0; i < tds.length; i++) {
             var txt = (tds[i].innerText || '').trim().toLowerCase();
             var nextVal = (tds[i+1]?.innerText || '').trim();
             if (txt.includes('name') && !txt.includes('father') && !txt.includes('mother')) {
               if (nextVal) name = nextVal;
             }
             if (txt.includes('uid') || txt.includes('roll no')) {
               if (nextVal) uid = nextVal;
             }
             if (txt.includes('course') || txt.includes('program')) {
               if (nextVal) course = nextVal;
             }
             if (txt === 'semester' || txt.includes('semester :') || txt.includes('semester:-')) {
               if (nextVal) semester = nextVal;
             }
             var secMatch = (tds[i].innerText || '').match(/(?:section|sec|class\\/sec|class\\s*\\/\\s*section)\\s*[:\\-\\s]\\s*([0-9A-Z\\-]+)/i);
             if (secMatch) {
               var secCand = secMatch[1].trim();
               if (!/^\\d{3,4}$/.test(secCand) && !/^[0-9A-Z]{2,6}-\\d{3,4}$/i.test(secCand)) section = secCand;
             } else if (txt.includes('section')) {
               if (nextVal && !nextVal.toLowerCase().includes('semester') && !nextVal.toLowerCase().includes('fee') && !/^\\d{3,4}$/.test(nextVal) && !/^[0-9A-Z]{2,6}-\\d{3,4}$/i.test(nextVal)) {
                 section = nextVal;
               }
             }
          }
          
          var spans = document.querySelectorAll('span, label');
          for (var k = 0; k < spans.length; k++) {
             var id = (spans[k].id || '').toLowerCase();
             var val = (spans[k].innerText || '').trim();
             if (val) {
               if (id.includes('name') && !id.includes('father') && !id.includes('mother') && name === 'Unknown') name = val;
               if ((id.includes('uid') || id.includes('roll')) && uid === 'Unknown') uid = val;
               if ((id.includes('course') || id.includes('program')) && course === 'Unknown') course = val;
               if (id.includes('semester') && semester === 'N/A') semester = val;
               if (id.includes('section') && !section && !val.toLowerCase().includes('section') && !/^\\d{3,4}$/.test(val) && !/^[0-9A-Z]{2,6}-\\d{3,4}$/i.test(val)) {
                 section = val;
               }
             }
          }
          
          var inputs = document.querySelectorAll('input[type="text"]');
          for (var inp = 0; inp < inputs.length; inp++) {
             var inpId = (inputs[inp].id || '').toLowerCase();
             var inpVal = (inputs[inp].value || '').trim();
             if (inpVal) {
               if (inpId.includes('name') && !inpId.includes('father') && !inpId.includes('mother') && name === 'Unknown') name = inpVal;
               if ((inpId.includes('uid') || inpId.includes('roll')) && uid === 'Unknown') uid = inpVal;
               if ((inpId.includes('course') || inpId.includes('program')) && course === 'Unknown') course = inpVal;
               if (inpId.includes('semester') && semester === 'N/A') semester = inpVal;
               if (inpId.includes('section') && !section) section = inpVal;
             }
          }

          // Photo Extraction: Search for student profile image
          var photoUrl = '';
          var photoImg = null;
          var imgs = document.querySelectorAll('img');
          for (var m = 0; m < imgs.length; m++) {
             var img = imgs[m];
             var rawSrc = img.src || img.getAttribute('data-src') || img.getAttribute('src') || '';
             var id = (img.id || '').toLowerCase();
             var lowSrc = rawSrc.toLowerCase();
             var className = (img.className || '').toLowerCase();

             if (!lowSrc || lowSrc.includes('logo') || lowSrc.includes('header') || lowSrc.includes('banner') || lowSrc.includes('loader') || lowSrc.includes('icon')) {
               continue;
             }

             if (id.includes('photo') || id.includes('student') || id.includes('profile') || id.includes('image1') || id.includes('imgstudent') || id.includes('imgprofile') || lowSrc.includes('showimage') || lowSrc.includes('photo') || lowSrc.includes('upload') || className.includes('photo') || className.includes('student')) {
               photoImg = img;
               break;
             }
          }

          if (!photoImg) {
            var cph = document.querySelector('#ContentPlaceHolder1, [id*="ContentPlaceHolder"]');
            if (cph) {
              var cphImgs = cph.querySelectorAll('img');
              for (var c = 0; c < cphImgs.length; c++) {
                var cSrc = cphImgs[c].src || '';
                var cLow = cSrc.toLowerCase();
                if (cLow && !cLow.includes('logo') && !cLow.includes('header') && !cLow.includes('banner') && !cLow.includes('icon')) {
                  photoImg = cphImgs[c];
                  break;
                }
              }
            }
          }

          if (photoImg) {
            var rawSrc = photoImg.src || photoImg.getAttribute('src') || '';
            var fullSrc = '';
            try {
              fullSrc = new URL(rawSrc, window.location.href).href;
              if (fullSrc.startsWith('http://')) fullSrc = fullSrc.replace('http://', 'https://');
            } catch(e) {
              fullSrc = rawSrc;
            }

            // Convert to base64 via Canvas for instant offline rendering without cookie hurdles
            try {
              if (photoImg.complete && photoImg.naturalWidth > 0) {
                var canvas = document.createElement('canvas');
                canvas.width = photoImg.naturalWidth;
                canvas.height = photoImg.naturalHeight;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(photoImg, 0, 0);
                var b64 = canvas.toDataURL('image/jpeg', 0.85);
                if (b64 && b64.length > 200) {
                  photoUrl = b64;
                }
              }
            } catch(e) {}

            if (!photoUrl && fullSrc) {
              photoUrl = fullSrc;
            }
          }

          if (cgpa === 'N/A') {
            var bodyText = document.body ? document.body.innerText : '';
            var cgpaM = bodyText.match(/(?:C\\.?G\\.?P\\.?A\\.?|G\\.?P\\.?A\\.?|S\\.?G\\.?P\\.?A\\.?)\\s*[:\\-\\=]?\\s*([0-9]{1,2}\\.[0-9]{1,3})/i);
            if (cgpaM && parseFloat(cgpaM[1]) <= 10) cgpa = cgpaM[1];
          }

          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'SCRAPE_RESULT',
            step: 'profile',
            data: { name: name, uid: uid, course: course, cgpa: cgpa, semester: semester, section: section, photoUrl: photoUrl }
          }));
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'profile', data: null }));
        }
      })();
      true;
    `
  },
  {
    id: 'subjects',
    url: 'https://student.culko.in/frmMyCourse.aspx',
    msg: 'Extracting Subjects & Section...',
    script: `
      (function() {
        try {
          var subjects = [];
          var section = '';

          var headerCells = document.querySelectorAll('#ContentPlaceHolder1_gvMyCourses tr:first-child th');
          var sectionIdx = -1;
          for (var h = 0; h < headerCells.length; h++) {
             var hText = (headerCells[h].innerText || '').toLowerCase();
             if (hText.includes('section') || hText.includes('sec')) {
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
                  if (secVal && !/^[0-9A-Z]{2,6}-\\d{3,4}$/i.test(secVal)) {
                    section = secVal;
                  }
               }
            }

            var credits = '3.0';
            var creditSpan = rows[i].querySelector('span[id*="lblCredit"]');
            if (creditSpan) {
              credits = creditSpan.innerText.trim();
            } else {
              var tds = Array.from(rows[i].querySelectorAll('td')).map(function(td) { return td.innerText.trim(); });
              var credNum = tds.find(function(t) { return /^[1-9](\\.[0-9]+)?$/.test(t); });
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

          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'SCRAPE_RESULT',
            step: 'subjects',
            data: { list: subjects, section: section }
          }));
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'subjects', data: { list: [], section: '' } }));
        }
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
              var time = (cells[0].innerText || '').trim();
              for (var j = 1; j < cells.length && j < daysMap.length; j++) {
                 var text = (cells[j].innerText || '').trim();
                 if (text && text.length > 3 && text !== '\\u00a0' && text !== '-') {
                   var parts = text.split(/\\bBy\\b/);
                   var leftPart = parts[0] || '';
                   var rightPart = parts[1] || '';
                   
                   var leftSplit = leftPart.split(':');
                   var subjectName = leftSplit[0] ? leftSplit[0].trim() : '';
                   if (leftSplit[1] && leftSplit[1].trim() === 'P') subjectName += ' (Lab)';
                   var group = leftSplit[3] ? leftSplit[3].trim() : '';
                   
                   var rightSplit = rightPart.split(/\\bat\\b/);
                   var teacher = rightSplit[0] ? rightSplit[0].trim() : '';
                   var room = rightSplit[1] ? rightSplit[1].trim() : '';
                   
                   var dayName = daysMap[j];
                   if (dayName && timetable[dayName]) {
                      timetable[dayName].push({
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

          // Detect Section from page heading (e.g. "Class / Section : 25CSH-1" or "25BCS-3")
          var detectedSection = '';
          var headings = document.querySelectorAll('h1, h2, h3, h4, label, span, td');
          for (var h = 0; h < headings.length; h++) {
            var ht = headings[h].innerText || '';
            var secMatch = ht.match(/(?:section|sec|class\\/sec|class\\s*\\/\\s*section)\\s*[:\\-\\s]\\s*([0-9A-Z\\-]+)/i);
            if (secMatch) {
              var cand = secMatch[1].trim();
              if (!/^\\d{3,4}$/.test(cand) && !/^[0-9A-Z]{2,6}-\\d{3,4}$/i.test(cand)) {
                detectedSection = cand;
                break;
              }
            }
            var m = ht.match(/\\b(\\d{2}[A-Z]{2,5}-[A-Z]{0,6}-?\\d{1,2})\\b/);
            if (m && !/^[0-9A-Z]{2,6}-\\d{3,4}$/i.test(m[1])) {
              detectedSection = m[1];
              break;
            }
          }

          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'SCRAPE_RESULT',
            step: 'timetable',
            data: timetable,
            section: detectedSection
          }));
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'timetable', data: null, error: e.message }));
        }
      })();
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
          var maxWait = 4500;
          var interval = 150;
          var elapsed = 0;
          
          var tryParse = function() {
            var rows = document.querySelectorAll('#SortTable tbody tr, #SortTable tr');
            
            if (rows.length === 0 && elapsed < maxWait) {
              elapsed += interval;
              setTimeout(tryParse, interval);
              return;
            }
            
            for (var i = 0; i < rows.length; i++) {
              var cells = rows[i].querySelectorAll('td');
              if (cells.length < 4) continue;
              
              var code = cells[0].innerText.trim();
              var title = cells[1].innerText.trim();
              var eligDelivered = cells.length >= 9 ? (parseFloat(cells[8].innerText.trim()) || 0) : 0;
              var eligAttended = cells.length >= 10 ? (parseFloat(cells[9].innerText.trim()) || 0) : 0;
              var eligPercText = cells.length >= 11 ? cells[10].innerText.trim().replace('%','') : '';
              var eligPerc = parseFloat(eligPercText) || 0;
              
              var totalDelv = cells.length >= 3 ? (parseFloat(cells[2].innerText.trim()) || 0) : 0;
              var totalAttd = cells.length >= 4 ? (parseFloat(cells[3].innerText.trim()) || 0) : 0;
              
              var finalTotal = eligDelivered > 0 ? eligDelivered : totalDelv;
              var finalAttended = eligAttended > 0 ? eligAttended : totalAttd;
              var finalPerc = eligPerc > 0 ? eligPerc : (finalTotal > 0 ? Math.round((finalAttended / finalTotal) * 100) : 0);
              
              var viewActionTarget = '';
              if (cells.length >= 12 && cells[11]) {
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
      (function() {
        try {
          var marksData = [];
          
          // 1. Accordion style
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

          // 2. Fallback table rows
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

          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: marksData }));
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: [] }));
        }
      })();
      true;
    `
  },
];

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
  const [showSkipButton, setShowSkipButton] = useState(false);

  const currentStep = SCRAPE_STEPS[currentStepIndex];

  // Refs mirror state so async callbacks / safety timeout read fresh values
  const scrapedDataRef = useRef<any>({});
  const cookieRef = useRef<string>('');
  const finishedRef = useRef(false);
  const stepIndexRef = useRef(0);

  // CRITICAL: Reset ALL refs and state every time this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      scrapedDataRef.current = {};
      cookieRef.current = '';
      finishedRef.current = false;
      stepIndexRef.current = 0;
      setCurrentStepIndex(0);
      setShowSkipButton(false);

      // Pre-load cookies from SecureStore & AsyncStorage
      SecureStore.getItemAsync('culko_cookies').then((c) => {
        if (c) {
          cookieRef.current = c;
        } else {
          AsyncStorage.getItem('culko_cookies').then((ac) => {
            if (ac) cookieRef.current = ac;
          }).catch(() => {});
        }
      }).catch(() => {});
    }, [])
  );

  // Keep stepIndexRef in sync with state
  useEffect(() => {
    stepIndexRef.current = currentStepIndex;
  }, [currentStepIndex]);

  // Clean section helper directly validating portal values
  const cleanSection = (rawSec: string | undefined | null): string => {
    if (!rawSec) return '';
    let s = String(rawSec).trim().toUpperCase();
    s = s.replace(/^(?:SECTION|SEC|CLASS\s*\/\s*SEC|CLASS\s*SECTION)\s*[:\-\s]+/i, '').trim();
    if (!s || s === 'N/A' || s === 'NA' || s === 'NONE' || s === 'NULL' || s === 'UNDEFINED' || s === 'SELECT') return '';
    if (/^[0-9A-Z]{2,6}-\d{3,4}[A-Z]?$/i.test(s)) return ''; // reject course codes like 25CSH-214
    if (/^(SEMESTER|SEM|FEE|CREDIT|SR|NO)/i.test(s)) return '';
    if (/^\d{3,4}$/.test(s)) return '';
    return s;
  };

  const finalizeSync = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    try {
      const existing = useStudyOSStore.getState();
      const newData = scrapedDataRef.current;
      const subjList = newData.subjects?.list || [];

      // Detect real section from portal data, prioritizing subjects registered courses
      const resolvedSection =
        cleanSection(newData.subjects?.section) ||
        cleanSection(newData.timetable?.section) ||
        cleanSection(newData.profile?.section) ||
        cleanSection(existing.profile?.section) ||
        '';

      const baseSubjects = subjList.length > 0 ? subjList : (existing.subjects || []);

      // Merge attendance into subjects
      const rawAttendance = newData.attendance || {};
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

      // Resolved Profile
      const savedUid = await SecureStore.getItemAsync('culko_u').catch(() => null);
      const effectiveUid =
        (newData.profile?.uid && newData.profile.uid !== 'Unknown' && newData.profile.uid !== 'Error')
          ? newData.profile.uid
          : (savedUid || existing.profile?.uid || undefined);

      const resolvedPhotoUrl =
        (newData.profile?.photoUrl && newData.profile.photoUrl.trim() !== '')
          ? newData.profile.photoUrl
          : (existing.profile?.photoUrl || '');

      const resolvedProfile = {
        ...(existing.profile || {}),
        ...(newData.profile || {}),
        photoUrl: resolvedPhotoUrl,
        name: (newData.profile?.name && newData.profile.name !== 'Unknown' && newData.profile.name !== 'Error')
          ? newData.profile.name
          : (existing.profile?.name || user?.fullName || 'Student'),
        uid: effectiveUid || 'Unknown',
        section: resolvedSection,
      };

      // Resolved Timetable
      const hasValidTimetable = (tt: any) => {
        if (!tt) return false;
        return Object.values(tt).some((day: any) => Array.isArray(day) && day.length > 0);
      };

      const findBestTimetableSection = (sec: string) => {
        const keys = Object.keys(timetableData as any);
        if (!sec) return keys[0] || '';
        const clean = sec.trim().toUpperCase();
        if ((timetableData as any)[clean]) return clean;
        const prefix = clean.replace(/-\d+[A-Z]?$/, '');
        const matched = keys.find(k => k === clean || k.startsWith(clean) || clean.startsWith(k));
        if (matched) return matched;
        if (prefix) {
          const prefixMatch = keys.find(k => k.startsWith(prefix));
          if (prefixMatch) return prefixMatch;
        }
        return keys[0] || '';
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
        marks: (newData.marks && newData.marks.length) ? newData.marks : (existing.marks || []),
        datesheet: existing.datesheet || [],
        isScrapedDataLoaded: true
      });

      // Internal marks push notification if new marks were uploaded
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

      // Sync user profile to backend MongoDB
      if (userId && (effectiveUid || resolvedSection)) {
        try {
          await Promise.race([
            syncUserWithDB(userId, {
              section_code: resolvedSection || undefined,
              uid: effectiveUid,
              name: resolvedProfile.name || undefined,
              semester: resolvedProfile.semester ? String(resolvedProfile.semester) : undefined,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('DB Sync timeout')), 4500))
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
      console.error('Finalize sync crashed:', error);
      router.navigate('/(app)/dashboard');
    }
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    if (!navState.loading) {
      const step = SCRAPE_STEPS[stepIndexRef.current];
      if (!step) return;

      // Inject saved session cookies to prevent redirects on Android WebViews
      let cookieInject = '';
      if (cookieRef.current) {
        const parts = cookieRef.current.split(';').map((c: string) => c.trim()).filter(Boolean);
        cookieInject = parts.map((c: string) => `document.cookie = ${JSON.stringify(c + '; path=/')};`).join('\n');
      }

      if (cookieInject) {
        webViewRef.current?.injectJavaScript(cookieInject + '\ntrue;');
      }

      setTimeout(() => {
        const captureAndScrape = `
          (function() {
            try {
              var c = document.cookie;
              if (c) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOKIES', data: c }));
            } catch(e) {}
          })();
          ${step.script}
        `;
        webViewRef.current?.injectJavaScript(captureAndScrape);
      }, 100);
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'COOKIES') {
        if (finishedRef.current) return;
        if (data.data) {
          cookieRef.current = data.data;
          SecureStore.setItemAsync('culko_cookies', data.data).catch(() => {});
          AsyncStorage.setItem('culko_cookies', data.data).catch(() => {});
        }
      } else if (data.type === 'SCRAPE_RESULT') {
        const expectedStep = SCRAPE_STEPS[stepIndexRef.current];
        if (!expectedStep || data.step !== expectedStep.id) {
          return;
        }

        const newData = { ...scrapedDataRef.current, [data.step]: data.data };
        scrapedDataRef.current = newData;

        const nextIndex = stepIndexRef.current + 1;
        if (nextIndex < SCRAPE_STEPS.length) {
          stepIndexRef.current = nextIndex;
          setCurrentStepIndex(nextIndex);
        } else {
          await finalizeSync();
        }
      }
    } catch (e) {
      console.log('[Sync] Error parsing message:', e);
    }
  };

  // Skip button appears after 3 seconds on any step
  useEffect(() => {
    setShowSkipButton(false);
    const t = setTimeout(() => setShowSkipButton(true), 3000);
    return () => clearTimeout(t);
  }, [currentStepIndex]);

  // Fast poller script: executes immediately when DOM is populated
  const fastScrapeScript = `
    (function() {
      var hasScraped = false;
      function checkAndRun() {
        if (hasScraped) return;
        try {
          var c = document.cookie;
          if (c) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOKIES', data: c }));
        } catch(e) {}

        var hasDomContent = document.body && (
          document.querySelector('table') || 
          document.querySelector('#SortTable') || 
          document.querySelector('#ContentPlaceHolder1_gvMyCourses') ||
          document.querySelector('#accordion') ||
          document.querySelectorAll('td, span').length > 8
        );

        if (hasDomContent) {
          hasScraped = true;
          try {
            ${currentStep?.script || ''}
          } catch(err) {}
        }
      }

      checkAndRun();
      var poller = setInterval(function() {
        if (hasScraped) { clearInterval(poller); return; }
        checkAndRun();
      }, 150);

      setTimeout(function() {
        if (!hasScraped) {
          clearInterval(poller);
          try {
            ${currentStep?.script || ''}
          } catch(err) {}
        }
      }, 2500);
    })();
    true;
  `;

  // Per-step safety net: if a step's page takes more than 3.8 seconds, advance immediately
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!finishedRef.current && currentStep) {
        console.log('[Sync] Step safety timeout advancing:', currentStep.id);
        handleMessage({ nativeEvent: { data: JSON.stringify({ type: 'SCRAPE_RESULT', step: currentStep.id, data: null }) } });
      }
    }, 3800);
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

      {/* Dedicated Re-mounting Hidden WebView per step (b9dcce2 architecture) */}
      {currentStep && (
        <View style={styles.hiddenWebviewContainer}>
          <WebView
            key={currentStep.id}
            ref={webViewRef}
            source={{
              uri: currentStep.url,
              headers: cookieRef.current ? { Cookie: cookieRef.current } : undefined
            }}
            onNavigationStateChange={handleNavigationStateChange}
            onMessage={handleMessage}
            injectedJavaScript={fastScrapeScript}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            cacheEnabled={true}
            onError={(e) => {
              console.log('[Sync] WebView Error on step:', currentStep.id, e.nativeEvent.description);
              handleMessage({ nativeEvent: { data: JSON.stringify({ type: 'SCRAPE_RESULT', step: currentStep.id, data: null }) } });
            }}
            onHttpError={(e) => {
              console.log('[Sync] WebView HTTP Error on step:', currentStep.id, e.nativeEvent.statusCode);
              handleMessage({ nativeEvent: { data: JSON.stringify({ type: 'SCRAPE_RESULT', step: currentStep.id, data: null }) } });
            }}
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
