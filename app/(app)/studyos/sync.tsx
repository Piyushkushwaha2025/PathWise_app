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

          try {
            var attA = Array.from(document.querySelectorAll('a')).find(function(a) {
              return a.href && (a.href.toLowerCase().includes('attendancesummary') || a.innerText.toLowerCase().includes('attendance'));
            });
            if (attA && attA.href) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DYNAMIC_URL', step: 'attendance', url: attA.href }));
            }
          } catch(e){}

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

          var headerCells = document.querySelectorAll('#ContentPlaceHolder1_gvMyCourses tr:first-child th, #ContentPlaceHolder1_gvMyCourses tr:first-child td');
          var sectionIdx = -1;
          var creditIdx = -1;
          for (var h = 0; h < headerCells.length; h++) {
             var hText = (headerCells[h].innerText || '').toLowerCase().trim();
             if (hText.includes('section') || hText === 'sec') {
                sectionIdx = h;
             }
             if (hText.includes('credit') || hText === 'cr' || hText === 'cr.') {
                creditIdx = h;
             }
          }

          var courseTable = document.querySelector('#ContentPlaceHolder1_gvMyCourses, table[id*="gvMyCourse"], table[id*="Course"], table[id*="course"]');
          var rows = courseTable ? courseTable.querySelectorAll('tr') : document.querySelectorAll('#ContentPlaceHolder1_gvMyCourses tr');
          if (!rows || rows.length < 2) {
             var allTables = document.querySelectorAll('table');
             for (var tb = 0; tb < allTables.length; tb++) {
                var tRows = allTables[tb].querySelectorAll('tr');
                if (tRows.length >= 2) {
                   var fRowTxt = (tRows[0].innerText || '').toLowerCase();
                   if (fRowTxt.includes('course') || fRowTxt.includes('subject') || fRowTxt.includes('code')) {
                      rows = tRows;
                      break;
                   }
                }
             }
          }

          for (var i = 1; i < rows.length; i++) {
            var cells = rows[i].querySelectorAll('td');
            if (cells.length < 2) continue;

            var code = rows[i].querySelector('span[id*="lblCourseCode"], span[id*="CourseCode"], [id*="CourseCode"]')?.innerText.trim();
            var name = rows[i].querySelector('span[id*="lblCourseName"], span[id*="CourseName"], span[id*="lblTitle"], [id*="CourseName"], [id*="Subject"]')?.innerText.trim();
            var type = rows[i].querySelector('span[id*="lblType"], [id*="Type"]')?.innerText.trim();
            
            if (!code) {
              for (var c = 0; c < cells.length; c++) {
                var cTxt = cells[c].innerText.trim();
                var m = cTxt.match(/^[0-9A-Z]{2,6}[-_][0-9]{3,4}[A-Z]?$/i);
                if (m) { code = m[0]; break; }
              }
            }

            // Fallback for name if span was not found: scan cells for course title text
            if (!name) {
              for (var cn = 0; cn < cells.length; cn++) {
                var cellTxt = cells[cn].innerText.trim();
                if (cellTxt && cellTxt !== code && !/^\d+$/.test(cellTxt) && !['theory', 'practical', 'core', 'elective'].includes(cellTxt.toLowerCase()) && cellTxt.length > 2) {
                  name = cellTxt;
                  break;
                }
              }
            }

            if (!section && sectionIdx !== -1 && cells.length > sectionIdx) {
               var secVal = cells[sectionIdx].innerText.trim();
               if (secVal && !/^[0-9A-Z]{2,6}-\d{3,4}$/i.test(secVal)) {
                 section = secVal;
               }
            }

            var credits = '';
            var creditSpan = rows[i].querySelector('span[id*="lblCredit"], [id*="Credit"]');
            if (creditSpan && creditSpan.innerText.trim()) {
              var sVal = creditSpan.innerText.trim();
              if (!isNaN(parseFloat(sVal))) credits = sVal;
            } else if (creditIdx !== -1 && cells.length > creditIdx) {
              var cVal = cells[creditIdx].innerText.trim();
              if (cVal && !isNaN(parseFloat(cVal))) {
                credits = cVal;
              }
            }

            if (code) {
              name = name || code;
              var fullSubjName = name;
              if (type && !fullSubjName.toLowerCase().includes(type.toLowerCase())) {
                fullSubjName += ' (' + type + ')';
              }
              subjects.push({ 
                 code: code, 
                 name: fullSubjName, 
                 credits: credits, 
                 totalClasses: 0, 
                 attendedClasses: 0, 
                 attendancePercentage: 0 
              });
            }
          }

          try {
            var attA2 = Array.from(document.querySelectorAll('a')).find(function(a) {
              return a.href && (a.href.toLowerCase().includes('attendancesummary') || a.innerText.toLowerCase().includes('attendance'));
            });
            if (attA2 && attA2.href) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DYNAMIC_URL', step: 'attendance', url: attA2.href }));
            }
          } catch(e){}

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
          var maxWait = 2500;
          var interval = 35;
          var elapsed = 0;

          function viewActionTargetOf(row) {
            var viewBtn = row.querySelector('input[value="VIEW"], input[value="View"], input[type="button"][chk]');
            if (viewBtn && viewBtn.getAttribute('chk')) {
              var chkVal = viewBtn.getAttribute('chk');
              var hiddenInp = row.querySelector('input[type="hidden"]');
              if (hiddenInp && hiddenInp.value) {
                return hiddenInp.value + "|" + chkVal;
              }
            }
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

          var tryParse = function() {
            var tables = document.querySelectorAll('table');
            for (var t = 0; t < tables.length; t++) {
              var rows = tables[t].querySelectorAll('tr');
              if (rows.length < 2) continue;

              for (var i = 0; i < rows.length; i++) {
                var cells = rows[i].querySelectorAll('td');
                if (cells.length < 4) continue;

                var textArr = Array.from(cells).map(function(c) { return c.innerText.trim(); });
                var code = null;
                for (var x = 0; x < textArr.length; x++) {
                  if (/^[0-9A-Z]{2,8}[-_]?[0-9]{3}/.test(textArr[x])) { code = textArr[x]; break; }
                }

                // Robust course title detection: search cells for actual course name, never accept row serial numbers or percentages
                var detectedTitle = "";
                for (var a = 0; a < textArr.length; a++) {
                  var tItem = textArr[a];
                  if (tItem && tItem !== code && !/^\d+$/.test(tItem) && !tItem.includes('%') && !/^[0-9A-Z]{2,8}[-_]?[0-9]{3}/.test(tItem) && /[a-zA-Z]{3,}/.test(tItem)) {
                    var lowT = tItem.toLowerCase();
                    if (!['view', 'theory', 'practical', 'lecture', 'tutorial', 'regular', 'attendance', 'details'].includes(lowT)) {
                      if (!detectedTitle || detectedTitle.length < tItem.length) {
                        detectedTitle = tItem;
                      }
                    }
                  }
                }

                // Method A: Exact column positions from SortTable if present
                var eligDelivered = cells.length >= 9 ? (parseFloat(cells[8].innerText.trim()) || 0) : 0;
                var eligAttended = cells.length >= 10 ? (parseFloat(cells[9].innerText.trim()) || 0) : 0;
                var eligPercText = cells.length >= 11 ? cells[10].innerText.trim().replace('%','') : '';
                var eligPerc = parseFloat(eligPercText) || 0;
                var totalDelv = cells.length >= 3 ? (parseFloat(cells[2].innerText.trim()) || 0) : 0;
                var totalAttd = cells.length >= 4 ? (parseFloat(cells[3].innerText.trim()) || 0) : 0;

                var total = eligDelivered > 0 ? eligDelivered : totalDelv;
                var attended = eligAttended > 0 ? eligAttended : totalAttd;
                var percentage = eligPerc > 0 ? eligPerc : (total > 0 ? Math.round((attended / total) * 100) : 0);

                // Method B: Heuristic numbers search if columns didn't yield values
                if (total === 0 && attended === 0) {
                  var numArr = [];
                  var explicitPerc = null;
                  for (var j = 0; j < textArr.length; j++) {
                    var rawVal = textArr[j].trim();
                    if (rawVal.includes('%')) explicitPerc = Number(rawVal.replace('%', '').trim());
                    var clean = rawVal.replace('%','').trim();
                    if (clean !== '' && !isNaN(Number(clean))) numArr.push(Number(clean));
                  }
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
                    }
                  }
                  if (total > 0 && attended > 0 && (percentage === 0 || isNaN(percentage))) {
                    percentage = Number(((attended / total) * 100).toFixed(2));
                  }
                }

                if (total > 0 || percentage > 0 || (code && code.length >= 4)) {
                  var vTarget = viewActionTargetOf(rows[i]);
                  var finalTitle = detectedTitle || code || "";
                  var dataObj = { code: code || "", title: finalTitle, total: total, attended: attended, percentage: percentage, viewActionTarget: vTarget };
                  if (code) attendanceData[code] = dataObj;
                  if (detectedTitle && detectedTitle !== code) attendanceData[detectedTitle] = dataObj;
                }
              }
            }

            var keys = Object.keys(attendanceData);
            if (keys.length > 0) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'SCRAPE_RESULT',
                step: 'attendance',
                data: attendanceData
              }));
              return;
            }

            if (elapsed < maxWait) {
              elapsed += interval;
              setTimeout(tryParse, interval);
              return;
            }

            // Timed out: return whatever we have or empty
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'SCRAPE_RESULT',
              step: 'attendance',
              data: attendanceData
            }));
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
      const hasScrapedAttendance = Object.keys(rawAttendance).length > 0;

      let updatedSubjects = (baseSubjects || []).map((subj: any) => {
        let att = rawAttendance[subj.code];

        const normSubjCode = (subj.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const normSubjName = (subj.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        if (!att && normSubjCode) {
          for (const [key, val] of Object.entries(rawAttendance) as [string, any][]) {
            const normKey = key.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            if (normKey && (normSubjCode.includes(normKey) || normKey.includes(normSubjCode))) {
              att = val;
              break;
            }
            const valCodeNorm = (val.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            if (valCodeNorm && (normSubjCode.includes(valCodeNorm) || valCodeNorm.includes(normSubjCode))) {
              att = val;
              break;
            }
          }
        }

        if (!att && normSubjName) {
          for (const [key, val] of Object.entries(rawAttendance) as [string, any][]) {
            const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normKey && (normSubjName.includes(normKey) || normKey.includes(normSubjName))) {
              att = val;
              break;
            }
            const valTitleNorm = (val.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (valTitleNorm && (normSubjName.includes(valTitleNorm) || valTitleNorm.includes(normSubjName))) {
              att = val;
              break;
            }
          }
        }

        if (att) {
          // Never overwrite existing valid attendance with 0 if scrape returned 0
          if (subj.totalClasses > 0 && att.total === 0 && att.attended === 0) {
            return subj;
          }
          return {
            ...subj,
            attendancePercentage: att.percentage,
            attendedClasses: att.attended,
            totalClasses: att.total,
            viewActionTarget: att.viewActionTarget || subj.viewActionTarget
          };
        }

        // If attendance was not in this scrape, retain existing attendance if available
        if (!hasScrapedAttendance && existing.subjects) {
          const ex = existing.subjects.find((s: any) => s.code === subj.code || s.name === subj.name);
          if (ex && ex.totalClasses > 0) {
            return {
              ...subj,
              attendancePercentage: ex.attendancePercentage,
              attendedClasses: ex.attendedClasses,
              totalClasses: ex.totalClasses,
              viewActionTarget: ex.viewActionTarget || subj.viewActionTarget
            };
          }
        }

        return subj;
      });

      // If baseSubjects was empty or subjects list was missing, build subjects directly from attendance data!
      if (updatedSubjects.length === 0 && hasScrapedAttendance) {
        const createdSubjects: any[] = [];
        const seenCodes = new Set<string>();
        for (const [key, val] of Object.entries(rawAttendance) as [string, any][]) {
          const code = val.code || (/^[0-9A-Z]{2,8}[-_]?[0-9]{3}/.test(key) ? key : '');
          if (code && !seenCodes.has(code)) {
            seenCodes.add(code);
            createdSubjects.push({
              code: code,
              name: val.title || key,
              credits: '',
              attendancePercentage: val.percentage || 0,
              attendedClasses: val.attended || 0,
              totalClasses: val.total || 0,
              viewActionTarget: val.viewActionTarget || '',
            });
          }
        }
        if (createdSubjects.length > 0) {
          updatedSubjects = createdSubjects;
        }
      } else if (hasScrapedAttendance) {
        // If some subjects in attendance were not in baseSubjects, add them!
        const existingCodes = new Set(updatedSubjects.map((s: any) => (s.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()));
        for (const [key, val] of Object.entries(rawAttendance) as [string, any][]) {
          const code = val.code || (/^[0-9A-Z]{2,8}[-_]?[0-9]{3}/.test(key) ? key : '');
          const normCode = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          if (normCode && !existingCodes.has(normCode) && (val.total > 0 || val.percentage > 0)) {
            existingCodes.add(normCode);
            updatedSubjects.push({
              code: code,
              name: val.title || key,
              credits: '',
              attendancePercentage: val.percentage || 0,
              attendedClasses: val.attended || 0,
              totalClasses: val.total || 0,
              viewActionTarget: val.viewActionTarget || '',
            });
          }
        }
      }

      // Build a title dictionary from marks, timetable, previous subjects, and lmsCourses to ensure all subjects have authentic titles
      const titleDictionary: Record<string, string> = {};

      const registerTitle = (c: string | undefined, title: string | undefined) => {
        if (!c || !title) return;
        const normCode = c.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const cleanTitle = title.trim();
        if (normCode && cleanTitle && !/^\d+$/.test(cleanTitle) && cleanTitle.length > 2 && cleanTitle.toUpperCase() !== normCode) {
          if (!titleDictionary[normCode] || titleDictionary[normCode].length < cleanTitle.length) {
            titleDictionary[normCode] = cleanTitle;
          }
        }
      };

      // 1. From Marks
      const allMarks = [...(newData.marks || []), ...(existing.marks || [])];
      for (const m of allMarks) {
        if (m.code) {
          registerTitle(m.code, m.subjectName || m.fullName);
        } else if (m.fullName) {
          const mCode = m.fullName.match(/\(([0-9A-Z]{2,8}[-_]?[0-9]{3})\)/i);
          if (mCode) registerTitle(mCode[1], m.subjectName);
        }
      }

      // 2. From Timetable
      const allTimetable = { ...(existing.timetable || {}), ...(newData.timetable || {}) };
      for (const daySlots of Object.values(allTimetable) as any[]) {
        if (Array.isArray(daySlots)) {
          for (const slot of daySlots) {
            if (slot?.subjectName) {
              const parts = slot.subjectName.split(' ');
              const possibleCode = parts[0];
              if (/^[0-9A-Z]{2,8}[-_]?[0-9]{3}/i.test(possibleCode)) {
                const restOfName = parts.slice(1).join(' ').trim();
                registerTitle(possibleCode, restOfName);
              }
            }
          }
        }
      }

      // 3. From Attendance raw titles
      for (const [key, val] of Object.entries(rawAttendance) as [string, any][]) {
        const c = val.code || (/^[0-9A-Z]{2,8}[-_]?[0-9]{3}/.test(key) ? key : '');
        if (c && val.title && !/^\d+$/.test(val.title)) {
          registerTitle(c, val.title);
        }
      }

      // 4. From Existing subjects
      if (existing.subjects && Array.isArray(existing.subjects)) {
        for (const es of existing.subjects) {
          if (es.code && es.name && !/^\d+$/.test(es.name) && es.name !== es.code) {
            registerTitle(es.code, es.name);
          }
        }
      }

      // 5. From LMS Courses
      if (existing.lmsCourses && Array.isArray(existing.lmsCourses)) {
        for (const lms of existing.lmsCourses) {
          if (lms.shortname && lms.fullname) {
            registerTitle(lms.shortname, lms.fullname);
          }
        }
      }

      // Resolve and heal subject names
      updatedSubjects = updatedSubjects.map((sub: any) => {
        const normCode = (sub.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const currentName = (sub.name || '').trim();
        const isCorruptOrMissing = !currentName || /^\d+$/.test(currentName) || currentName === sub.code || currentName === '1';

        if (isCorruptOrMissing && titleDictionary[normCode]) {
          return { ...sub, name: titleDictionary[normCode] };
        }
        if (isCorruptOrMissing) {
          return { ...sub, name: currentName && !/^\d+$/.test(currentName) ? currentName : (sub.code || 'Subject') };
        }
        return sub;
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

      const rawUserFull = user?.fullName?.trim();
      const ep = user?.primaryEmailAddress?.emailAddress?.split('@')[0]?.toLowerCase();
      const safeFallbackName = (rawUserFull && (!ep || rawUserFull.toLowerCase() !== ep) && rawUserFull.toLowerCase() !== 'learner' && rawUserFull.toLowerCase() !== 'student') ? rawUserFull : '';

      const resolvedProfile = {
        ...(existing.profile || {}),
        ...(newData.profile || {}),
        photoUrl: resolvedPhotoUrl,
        name: (newData.profile?.name && newData.profile.name !== 'Unknown' && newData.profile.name !== 'Error')
          ? newData.profile.name
          : (existing.profile?.name || safeFallbackName),
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

      // Sync user profile to backend MongoDB (fast race, non-blocking fallback)
      if (userId && (effectiveUid || resolvedSection)) {
        try {
          await Promise.race([
            syncUserWithDB(userId, {
              section_code: resolvedSection || undefined,
              uid: effectiveUid,
              name: resolvedProfile.name || undefined,
              semester: resolvedProfile.semester ? String(resolvedProfile.semester) : undefined,
              email: user?.primaryEmailAddress?.emailAddress || undefined,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('DB Sync timeout')), 2500))
          ]);
        } catch (e: any) {
          if (e?.code === 'UID_ALREADY_LINKED' || e?.code === 'ACCOUNT_ALREADY_BOUND') {
            await SecureStore.deleteItemAsync('culko_cookies').catch(() => {});
            await SecureStore.deleteItemAsync('culko_u').catch(() => {});
            await SecureStore.deleteItemAsync('culko_p').catch(() => {});
            await clearSession();
            Alert.alert(
              'Account Locked',
              e.message || (e?.code === 'ACCOUNT_ALREADY_BOUND'
                ? 'This PathWise account is already linked to a different College ID.'
                : 'This College ID is already linked to another PathWise account.'),
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
      }, 25);
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
      } else if ((data.type === 'ATTENDANCE_URL' || data.type === 'DYNAMIC_URL') && data.url) {
        let fullUrl = data.url;
        if (!fullUrl.startsWith('http')) {
          fullUrl = `https://student.culko.in/${fullUrl.replace(/^\//, '')}`;
        }
        const targetStepId = data.step || 'attendance';
        const targetStep = SCRAPE_STEPS.find(s => s.id === targetStepId);
        if (targetStep && (fullUrl.startsWith('http://') || fullUrl.startsWith('https://'))) {
          console.log(`[Sync] Dynamic ${targetStepId} URL updated:`, fullUrl);
          targetStep.url = fullUrl;
        }
      } else if (data.type === 'SCRAPE_RESULT') {
        const expectedStep = SCRAPE_STEPS[stepIndexRef.current];
        if (!expectedStep || data.step !== expectedStep.id) {
          return;
        }

        console.log('[Sync] Scraped step:', data.step, data.data ? `(${Object.keys(data.data).length} keys)` : '(null)');

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
          document.readyState === 'complete' ||
          document.readyState === 'interactive' ||
          document.querySelector('table') || 
          document.querySelector('#SortTable') || 
          document.querySelector('#ContentPlaceHolder1_gvMyCourses') ||
          document.querySelector('#accordion') ||
          document.querySelectorAll('td, span').length > 5
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
      }, 35);

      setTimeout(function() {
        if (!hasScraped) {
          clearInterval(poller);
          try {
            ${currentStep?.script || ''}
          } catch(err) {}
        }
      }, 800);
    })();
    true;
  `;

  // Per-step safety net: allow 3.2s for attendance/marks AJAX, 1.8s for fast pages
  useEffect(() => {
    const timeoutMs = (currentStep?.id === 'attendance' || currentStep?.id === 'marks') ? 3200 : 1800;
    const timer = setTimeout(() => {
      if (!finishedRef.current && currentStep) {
        console.log('[Sync] Step safety timeout advancing:', currentStep.id);
        handleMessage({ nativeEvent: { data: JSON.stringify({ type: 'SCRAPE_RESULT', step: currentStep.id, data: null }) } });
      }
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [currentStepIndex]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.title}>Syncing College Data</Text>
        <Text style={styles.subtitle}>{currentStep?.msg || 'Finishing up...'}</Text>
        <Text style={styles.progressText}>{currentStepIndex + 1} / {SCRAPE_STEPS.length} Steps</Text>

        
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
            injectedJavaScriptBeforeContentLoaded={fastScrapeScript}
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
