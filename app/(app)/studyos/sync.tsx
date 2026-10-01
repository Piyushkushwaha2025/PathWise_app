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
        var hasScraped = false;
        var startTime = Date.now();

        function tryScrape() {
          if (hasScraped) return;
          try {
            var name = 'Unknown';
            var uid = 'Unknown';
            var course = 'Unknown';
            var semester = 'N/A';
            var section = '';

            // 1. Text cells
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
               var secMatch = (tds[i].innerText || '').match(/(?:section|sec|class\/sec|class\s*\/\s*section)\s*[:\-\s]\s*([0-9A-Z\-]+)/i);
               if (secMatch) {
                 var secCand = secMatch[1].trim();
                 if (!/^\d{3,4}$/.test(secCand) && !/^[0-9A-Z]{2,6}-\d{3,4}$/i.test(secCand)) section = secCand;
               } else if (txt.includes('section')) {
                 if (nextVal && !nextVal.toLowerCase().includes('semester') && !nextVal.toLowerCase().includes('fee') && !/^\d{3,4}$/.test(nextVal) && !/^[0-9A-Z]{2,6}-\d{3,4}$/i.test(nextVal)) {
                   section = nextVal;
                 }
               }
            }

            // 2. Spans / Labels
            var spans = document.querySelectorAll('span, label');
            for (var k = 0; k < spans.length; k++) {
               var id = (spans[k].id || '').toLowerCase();
               var val = (spans[k].innerText || '').trim();
               if (val) {
                 if (id.includes('name') && !id.includes('father') && !id.includes('mother') && name === 'Unknown') name = val;
                 if ((id.includes('uid') || id.includes('roll')) && uid === 'Unknown') uid = val;
                 if ((id.includes('course') || id.includes('program')) && course === 'Unknown') course = val;
                 if (id.includes('semester') && semester === 'N/A') semester = val;
                 if (id.includes('section') && !section && !val.toLowerCase().includes('section') && !/^\d{3,4}$/.test(val) && !/^[0-9A-Z]{2,6}-\d{3,4}$/i.test(val)) {
                   section = val;
                 }
               }
            }

            // 3. Inputs
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

            // 4. Photo Extraction with Base64 Canvas
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

            var photoReady = false;
            if (photoImg) {
              var rawSrc = photoImg.src || photoImg.getAttribute('src') || '';
              var fullSrc = '';
              try {
                fullSrc = new URL(rawSrc, window.location.href).href;
                if (fullSrc.startsWith('http://')) fullSrc = fullSrc.replace('http://', 'https://');
              } catch(e) {
                fullSrc = rawSrc;
              }

              // Try canvas base64 conversion
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
                    photoReady = true;
                  }
                }
              } catch(e) {}

              if (!photoUrl && fullSrc) {
                photoUrl = fullSrc;
                if (photoImg.complete || (Date.now() - startTime > 800)) {
                  photoReady = true;
                }
              }
            } else {
              if (Date.now() - startTime > 800) photoReady = true;
            }

            var hasBasicInfo = (name !== 'Unknown' || uid !== 'Unknown' || tds.length > 6);
            var timeElapsed = Date.now() - startTime;

            if (hasBasicInfo && (photoReady || timeElapsed > 1200)) {
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
        }, 100);
        setTimeout(function() {
          if (!hasScraped) {
            clearInterval(timer);
            tryScrape();
            if (!hasScraped) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'profile', data: null }));
            }
          }
        }, 3000);
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
        var startTime = Date.now();

        function tryScrape() {
          if (hasScraped) return;
          try {
            var attendanceData = {};
            var subjectsList = [];
            var seenCodes = {};
            var section = '';

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

                // Check eligible delivered / attended columns or fallback
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

            var pageText = document.body ? document.body.innerText : '';
            var secMatch = pageText.match(/(?:section|sec|class\/sec)\s*[:\-\s]\s*([0-9A-Z\-]+)/i);
            if (secMatch) {
              var sCand = secMatch[1].trim();
              if (!/^\d{3,4}$/.test(sCand) && !/^[0-9A-Z]{2,6}-\d{3,4}$/i.test(sCand)) section = sCand;
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
                  totalAttended: sumAttd,
                  section: section
                }
              }));
            } else if (pageText.toLowerCase().includes('no attendance') || Date.now() - startTime > 2800) {
              hasScraped = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SCRAPE_RESULT',
                step: 'attendance',
                data: { attendance: {}, subjects: [], overallAttendance: 0, totalDelivered: 0, totalAttended: 0, section: '' }
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
        }, 100);
        setTimeout(function() {
          if (!hasScraped) {
            clearInterval(timer);
            tryScrape();
            if (!hasScraped) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'attendance', data: null }));
            }
          }
        }, 3000);
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
        var startTime = Date.now();

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
               } else if (hText.includes('section') || hText.includes('sec.') || hText === 'sec') {
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
                 if (secVal && !/^\d{3,4}$/.test(secVal) && !/^[0-9A-Z]{2,6}-\d{3,4}$/i.test(secVal)) section = secVal;
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
                if (optText && !optText.toLowerCase().includes('select') && !/^\d{3,4}$/.test(optText) && !/^[0-9A-Z]{2,6}-\d{3,4}$/i.test(optText)) section = optText;
              }
            }
            if (!section) {
              var secEl = document.querySelector('[id*="lblSection" i], [id*="lblClass" i]');
              if (secEl && secEl.innerText) {
                var sTxt = secEl.innerText.trim();
                if (sTxt && !sTxt.toLowerCase().includes('select') && !/^\d{3,4}$/.test(sTxt) && !/^[0-9A-Z]{2,6}-\d{3,4}$/i.test(sTxt)) section = sTxt;
              }
            }

            if (subjects.length > 0) {
              hasScraped = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SCRAPE_RESULT',
                step: 'subjects',
                data: { list: subjects, section: section }
              }));
            } else if (Date.now() - startTime > 2800) {
              hasScraped = true;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SCRAPE_RESULT',
                step: 'subjects',
                data: { list: [], section: section }
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
        }, 100);
        setTimeout(function() {
          if (!hasScraped) {
            clearInterval(timer);
            tryScrape();
            if (!hasScraped) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'subjects', data: { list: [], section: '' } }));
            }
          }
        }, 3000);
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
        var startTime = Date.now();

        function tryScrape() {
          if (hasScraped) return;
          try {
            var timetable = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [] };
            var dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

            // 1. Locate the timetable table
            var tables = document.querySelectorAll('table');
            var rows = [];
            for (var t = 0; t < tables.length; t++) {
              var tId = (tables[t].id || '').toLowerCase();
              var tHtml = tables[t].innerHTML.toLowerCase();
              if (tId.includes('grdmain') || tId.includes('timetable') || (tHtml.includes('monday') && (tHtml.includes('tuesday') || tHtml.includes('wednesday')))) {
                var foundRows = Array.from(tables[t].querySelectorAll('tr'));
                if (foundRows.length >= 2) {
                  rows = foundRows;
                  break;
                }
              }
            }

            if (rows.length < 2) {
              for (var t2 = 0; t2 < tables.length; t2++) {
                var r2 = Array.from(tables[t2].querySelectorAll('tr'));
                if (r2.length >= 2) {
                  var txt2 = tables[t2].innerText.toLowerCase();
                  if (txt2.includes('monday') || txt2.includes('tuesday')) {
                    rows = r2;
                    break;
                  }
                }
              }
            }

            // 2. Check layout (days in columns vs days in rows)
            var daysInColumns = false;
            var colDaysMap = [];
            var headerCells = rows[0] ? Array.from(rows[0].querySelectorAll('th, td')) : [];

            for (var c = 0; c < headerCells.length; c++) {
              var hText = headerCells[c].innerText.trim().toLowerCase();
              var matchedCol = null;
              for (var d = 0; d < dayNames.length; d++) {
                if (hText.includes(dayNames[d])) {
                  matchedCol = dayNames[d].charAt(0).toUpperCase() + dayNames[d].slice(1);
                  daysInColumns = true;
                  break;
                }
              }
              colDaysMap.push(matchedCol);
            }

            // 3. Extract class cells
            for (var i = 1; i < rows.length; i++) {
              var cells = Array.from(rows[i].querySelectorAll('td'));
              if (cells.length < 2) continue;

              var firstCellText = cells[0].innerText.trim();
              var firstCellLower = firstCellText.toLowerCase();

              var rowDayMatch = null;
              for (var d2 = 0; d2 < dayNames.length; d2++) {
                if (firstCellLower.includes(dayNames[d2])) {
                  rowDayMatch = dayNames[d2].charAt(0).toUpperCase() + dayNames[d2].slice(1);
                  break;
                }
              }

              for (var j = 1; j < cells.length; j++) {
                var rawText = cells[j].innerText.replace(/\\r?\\n|\\r/g, ' ').replace(/\\s+/g, ' ').trim();
                if (!rawText || rawText.length < 3 || rawText === '-' || rawText === '\\u00a0') continue;
                var lowRaw = rawText.toLowerCase();
                if (lowRaw === 'free' || lowRaw === 'lunch' || lowRaw === 'break' || lowRaw === 'recess') continue;

                var targetDay = daysInColumns ? colDaysMap[j] : rowDayMatch;
                if (!targetDay || !timetable[targetDay]) continue;

                var targetTime = daysInColumns ? firstCellText : (headerCells[j] ? headerCells[j].innerText.replace(/\\r?\\n|\\r/g, ' ').trim() : '');

                var subjectName = '';
                var teacher = '';
                var room = '';
                var group = '';

                if (/\\bby\\b/i.test(rawText)) {
                  var parts = rawText.split(/\\bby\\b/i);
                  var left = parts[0].trim();
                  var right = parts[1] || '';

                  var atSplit = right.split(/\\b(?:at|in|room)\\b/i);
                  teacher = atSplit[0].trim();
                  room = atSplit[1] ? atSplit[1].trim() : '';

                  var colSplit = left.split(':');
                  subjectName = colSplit[0] ? colSplit[0].trim() : left;
                  if (colSplit[1] && /^(P|LAB|PRACT)/i.test(colSplit[1].trim())) subjectName += ' (Lab)';
                  if (colSplit[2] && colSplit[2].trim().length <= 10) group = colSplit[2].trim();
                  if (colSplit[3] && colSplit[3].trim().length <= 10) group = colSplit[3].trim();
                } else if (rawText.includes(':')) {
                  var colParts = rawText.split(':').map(function(s) { return s.trim(); });
                  subjectName = colParts[0] || '';
                  if (colParts[1] && /^(P|LAB|PRACT)/i.test(colParts[1])) subjectName += ' (Lab)';
                  if (colParts.length >= 3) teacher = colParts[2];
                  if (colParts.length >= 4) room = colParts[3];
                  if (colParts.length >= 5) group = colParts[4];
                } else {
                  subjectName = rawText;
                }

                if (subjectName) {
                  timetable[targetDay].push({
                    subjectName: subjectName,
                    teacher: teacher || 'Assigned Faculty',
                    time: targetTime || 'Scheduled',
                    room: room || 'Campus',
                    group: group || ''
                  });
                }
              }
            }

            // 4. Section detection on timetable page
            var detectedSection = '';
            var secDropdown = document.querySelector('select[id*="ddlSection" i], select[name*="ddlSection" i], select[id*="Section" i]');
            if (secDropdown && secDropdown.selectedOptions && secDropdown.selectedOptions[0]) {
              var optVal = secDropdown.selectedOptions[0].text.trim();
              if (optVal && !optVal.toLowerCase().includes('select') && !/^\\d{3,4}$/.test(optVal) && !/^[0-9A-Z]{2,6}-\\d{3,4}$/i.test(optVal)) {
                detectedSection = optVal;
              }
            }
            if (!detectedSection) {
              var secEl = document.querySelector('[id*="lblSection" i], [id*="lblClass" i], [id*="lblStudentSection" i]');
              if (secEl && secEl.innerText) {
                var tVal = secEl.innerText.trim();
                if (tVal && !tVal.toLowerCase().includes('select') && !/^\\d{3,4}$/.test(tVal) && !/^[0-9A-Z]{2,6}-\\d{3,4}$/i.test(tVal)) {
                  detectedSection = tVal;
                }
              }
            }
            if (!detectedSection) {
              var headings = document.querySelectorAll('h1, h2, h3, h4, label, span, td, b, strong');
              for (var h = 0; h < headings.length; h++) {
                var ht = (headings[h].innerText || '').trim();
                var m = ht.match(/(?:section|sec|class\\/sec|class\\s*\\/\\s*section)\\s*[:\\-\\s]\\s*([0-9A-Z\\-]+)/i);
                if (m && m[1]) {
                  var cand = m[1].trim();
                  if (!/^\\d{3,4}$/.test(cand) && !/^[0-9A-Z]{2,6}-\\d{3,4}$/i.test(cand)) {
                    detectedSection = cand;
                    break;
                  }
                }
                var mSec = ht.match(/\\b(\\d{2}[A-Z]{2,5}(?:-[A-Z0-9]+)?-[0-9]{1,2}[A-Z]?)\\b/i);
                if (mSec && mSec[1]) {
                  detectedSection = mSec[1].trim();
                  break;
                }
              }
            }

            var hasClasses = Object.values(timetable).some(function(arr) { return arr.length > 0; });
            var bodyTxt = (document.body ? document.body.innerText : '').toLowerCase();
            var hasNoRecord = bodyTxt.includes('no time table') || bodyTxt.includes('no record') || bodyTxt.includes('no schedule') || bodyTxt.includes('not found');

            if (hasClasses || hasNoRecord || Date.now() - startTime > 2800) {
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
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'timetable', data: {}, section: '' }));
          }
        }

        tryScrape();
        var timer = setInterval(function() {
          if (hasScraped) { clearInterval(timer); return; }
          tryScrape();
        }, 100);
        setTimeout(function() {
          if (!hasScraped) {
            clearInterval(timer);
            tryScrape();
            if (!hasScraped) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'timetable', data: {}, section: '' }));
            }
          }
        }, 3000);
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
        var startTime = Date.now();

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

            if (marksData.length === 0) {
              var gridRows = document.querySelectorAll('table.GridView tr, #ContentPlaceHolder1_gvMarks tr, table tr');
              var subIdx = 1, mstIdx = 3, pracIdx = 4;
              if (gridRows.length > 1) {
                var ths = Array.from(gridRows[0].querySelectorAll('th, td')).map(function(h) { return h.innerText.toLowerCase(); });
                for (var h2 = 0; h2 < ths.length; h2++) {
                  if (ths[h2].includes('subject') || ths[h2].includes('course')) subIdx = h2;
                  if (ths[h2].includes('mst') || ths[h2].includes('mid')) mstIdx = h2;
                  if (ths[h2].includes('prac') || ths[h2].includes('lab')) pracIdx = h2;
                }
                for (var r2 = 1; r2 < gridRows.length; r2++) {
                  var c2 = gridRows[r2].querySelectorAll('td');
                  if (c2.length > subIdx) {
                    var sNm = c2[subIdx].innerText.trim();
                    var mM = c2.length > mstIdx ? c2[mstIdx].innerText.trim() : 'N/A';
                    var pM = c2.length > pracIdx ? c2[pracIdx].innerText.trim() : 'N/A';
                    if (sNm && sNm !== '') {
                      marksData.push({ subjectName: sNm, mstMarks: mM, practicalMarks: pM, exams: [] });
                    }
                  }
                }
              }
            }

            var pageTxt = (document.body ? document.body.innerText : '').toLowerCase();
            var hasNoMarks = pageTxt.includes('no record') || pageTxt.includes('not found') || pageTxt.includes('no marks');

            if (marksData.length > 0 || hasNoMarks || Date.now() - startTime > 2800) {
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
        }, 100);
        setTimeout(function() {
          if (!hasScraped) {
            clearInterval(timer);
            tryScrape();
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: [] }));
          }
        }, 3000);
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
  const currentStep = SCRAPE_STEPS[currentStepIndex];

  const scrapedDataRef = useRef<any>({});
  const cookieRef = useRef<string>('');
  const finishedRef = useRef(false);
  const stepIndexRef = useRef(0);
  const stepCompletedRef = useRef(false);
  const cachedDataRef = useRef<any>(null);
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [cookiesLoaded, setCookiesLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      scrapedDataRef.current = {};
      cookieRef.current = '';
      finishedRef.current = false;
      stepIndexRef.current = 0;
      stepCompletedRef.current = false;
      setCurrentStepIndex(0);
      setShowSkipButton(false);
      setCookiesLoaded(false);

      // Snapshot existing store for resilient fallback
      cachedDataRef.current = useStudyOSStore.getState();

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
    stepCompletedRef.current = false;
  }, [currentStepIndex]);

  const injectStepScript = (step: typeof SCRAPE_STEPS[0]) => {
    if (!step || stepCompletedRef.current || finishedRef.current) return;

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

  // Keep-alive pulse and watchdog per step for snappy, reliable extraction
  useEffect(() => {
    if (!cookiesLoaded) return;
    const step = SCRAPE_STEPS[currentStepIndex];
    if (!step || finishedRef.current) return;

    stepCompletedRef.current = false;

    // Run scraper after 150ms
    const t0 = setTimeout(() => {
      injectStepScript(step);
    }, 150);

    // Keep-alive pulse every 600ms to catch dynamic tables
    const pulse = setInterval(() => {
      if (stepCompletedRef.current || finishedRef.current) return;
      injectStepScript(step);
    }, 600);

    // Watchdog: 4.5s max per step
    const watchdog = setTimeout(() => {
      if (stepCompletedRef.current || finishedRef.current) return;
      console.log(`[Sync] Watchdog auto-advancing step "${step.id}" (4.5s cap)`);
      advanceStep(step.id, null);
    }, 4500);

    return () => {
      clearTimeout(t0);
      clearInterval(pulse);
      clearTimeout(watchdog);
    };
  }, [currentStepIndex, cookiesLoaded]);

  // Show skip button after 2.5s on any step
  useEffect(() => {
    setShowSkipButton(false);
    const t = setTimeout(() => setShowSkipButton(true), 2500);
    return () => clearTimeout(t);
  }, [currentStepIndex]);

  const advanceStep = async (stepId: string, data: any) => {
    const liveIndex = stepIndexRef.current;
    const liveStep = SCRAPE_STEPS[liveIndex];
    if (!liveStep || stepId !== liveStep.id || stepCompletedRef.current || finishedRef.current) {
      return;
    }

    stepCompletedRef.current = true;

    // Use cached fallback if data is null/empty
    const cached = cachedDataRef.current;
    let effectiveData = data;
    if (!effectiveData) {
      if (stepId === 'attendance') effectiveData = cached?.detailedAttendanceCache || null;
      else if (stepId === 'marks') effectiveData = cached?.marks || [];
      else if (stepId === 'timetable') effectiveData = cached?.timetable || {};
      else if (stepId === 'subjects') effectiveData = { list: cached?.subjects || [], section: '' };
      else if (stepId === 'profile') effectiveData = cached?.profile || null;
    }

    if (effectiveData) {
      scrapedDataRef.current[stepId] = effectiveData;
      // Incremental persistence
      if (stepId === 'attendance' && effectiveData.subjects?.length) {
        useStudyOSStore.getState().setScrapedData({ subjects: effectiveData.subjects });
      } else if (stepId === 'subjects' && effectiveData.list?.length) {
        useStudyOSStore.getState().setScrapedData({ subjects: effectiveData.list });
      } else if (stepId === 'profile' && effectiveData.name) {
        useStudyOSStore.getState().setScrapedData({ profile: effectiveData });
      } else if (stepId === 'timetable' && effectiveData && Object.keys(effectiveData).length > 0) {
        useStudyOSStore.getState().setScrapedData({ timetable: effectiveData });
      } else if (stepId === 'marks' && effectiveData?.length) {
        useStudyOSStore.getState().setScrapedData({ marks: effectiveData });
      }
    }

    const nextIndex = liveIndex + 1;
    if (nextIndex < SCRAPE_STEPS.length) {
      stepIndexRef.current = nextIndex;
      setCurrentStepIndex(nextIndex);
      const nextStep = SCRAPE_STEPS[nextIndex];
      webViewRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(nextStep.url)}; true;`);
    } else {
      await finalizeSync();
    }
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

      // Helper to clean and validate section string directly from portal
      const cleanSection = (rawSec: string | undefined | null): string => {
        if (!rawSec) return '';
        let s = String(rawSec).trim().toUpperCase();
        s = s.replace(/^(?:SECTION|SEC|CLASS\s*\/\s*SEC|CLASS\s*SECTION)\s*[:\-\s]+/i, '').trim();
        if (!s || s === 'N/A' || s === 'NA' || s === 'NONE' || s === 'NULL' || s === 'UNDEFINED' || s === 'SELECT' || s === '--SELECT--') return '';
        if (/^[0-9A-Z]{2,6}-\d{3,4}[A-Z]?$/i.test(s)) return ''; // course code like 25CSH-214
        if (/^(SEMESTER|SEM|FEE|CREDIT|SR|NO)/i.test(s)) return '';
        if (/^\d{3,4}$/.test(s)) return '';
        return s;
      };

      // Resolved Profile
      const savedUid = await SecureStore.getItemAsync('culko_u').catch(() => null);
      const effectiveUid =
        (newData.profile?.uid && newData.profile.uid !== 'Unknown' && newData.profile.uid !== 'Error')
          ? newData.profile.uid
          : (savedUid || existing.profile?.uid || undefined);

      const resolvedSection =
        cleanSection(newData.timetable?.section) ||
        cleanSection(newData.subjects?.section) ||
        cleanSection(newData.attendance?.section) ||
        cleanSection(newData.profile?.section) ||
        cleanSection(existing.profile?.section) ||
        '';

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
        overallAttendance: newData.attendance?.overallAttendance !== undefined ? newData.attendance.overallAttendance : existing.profile?.overallAttendance
      };

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
        if (expectedStep && data.step === expectedStep.id) {
          advanceStep(data.step, data.data);
        }
      }
    } catch (e) {
      console.log('Error parsing scrape message', e);
    }
  };

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
              if (!navState.loading && currentStep) {
                injectStepScript(currentStep);
              }
            }}
            onLoadEnd={() => {
              if (currentStep) {
                injectStepScript(currentStep);
              }
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
                advanceStep(currentStep.id, null);
              }
            }}
            onHttpError={(e) => {
              console.log('[Sync] WebView HTTP Error on step:', currentStep?.id, e.nativeEvent.statusCode);
              if (currentStep) {
                advanceStep(currentStep.id, null);
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
