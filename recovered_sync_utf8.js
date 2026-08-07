7D	1
Z__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";
  var _s = $RefreshSig$();
  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopNamespace(e) {
    if (e && e.__esModule) return e;
    var n = {};
    if (e) Object.keys(e).forEach(function (k) {
      var d = Object.getOwnPropertyDescriptor(e, k);
      Object.defineProperty(n, k, d.get ? d : {
        enumerable: true,
        get: function () {
          return e[k];
        }
      });
    });
    n.default = e;
    return n;
  Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function () {
      return SyncScreen;
    }
  });
  var _react = require(_dependencyMap[0], "react");
  var _reactNative = require(_dependencyMap[1], "react-native");
  var _reactNativeWebview = require(_dependencyMap[2], "react-native-webview");
  var _expoRouter = require(_dependencyMap[3], "expo-router");
  var _constantsTheme = require(_dependencyMap[4], "../../../constants/theme");
  var _storeUseThemeStore = require(_dependencyMap[5], "../../../store/useThemeStore");
  var _storeStudyosStore = require(_dependencyMap[6], "../../../store/studyosStore");
  var _storeStudySessionStore = require(_dependencyMap[7], "../../../store/studySessionStore");
  var _expoSecureStore = require(_dependencyMap[8], "expo-secure-store");
  var SecureStore = _interopNamespace(_expoSecureStore);
  var _clerkClerkExpo = require(_dependencyMap[9], "@clerk/clerk-expo");
  var _libDb = require(_dependencyMap[10], "../../../lib/db");
  var _reactJsxRuntime = require(_dependencyMap[11], "react/jsx-runtime");
  var SCRAPE_STEPS = [{
    id: 'profile',
    url: 'https://student.culko.in/frmStudentProfile.aspx',
    msg: 'Extracting Profile...',
    script: `
      try {
        var debugHtml = document.body.innerHTML;
        var tables = Array.from(document.querySelectorAll('table')).map((t, i) => 'Table ' + i + ': ' + t.id + ' rows: ' + t.rows.length);
        var spans = Array.from(document.querySelectorAll('span')).map(s => s.id + '=' + s.innerText.trim()).filter(s => s.length > 5 && s.includes('lbl'));
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DEBUG_HTML',
          step: 'profile',
          spans: spans.slice(0, 20),
          tables: tables
        }));
        var name = 'Unknown';
        var uid = 'Unknown';
        var course = 'Unknown';
        var semester = 'N/A';
        
        var tds = document.querySelectorAll('td');
        for (var i = 0; i < tds.length; i++) {
           var txt = tds[i].innerText.trim().toLowerCase();
           var nextText = (tds[i+1] && tds[i+1].innerText) ? tds[i+1].innerText.trim() : null;
           
           if (txt.includes('name') && !txt.includes('father') && !txt.includes('mother')) {
             name = nextText || name;
           }
           if (txt.includes('uid') || txt.includes('roll no')) {
             uid = nextText || uid;
           }
           if (txt.includes('course') || txt.includes('program')) {
             course = nextText || course;
           }
           if (txt === 'semester' || txt.includes('semester :') || txt.includes('semester:-')) {
             semester = nextText || semester;
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
           }
        }
        
        var inputs = document.querySelectorAll('input[type="text"]');
        for (var k = 0; k < inputs.length; k++) {
           var id = inputs[k].id.toLowerCase();
           var val = inputs[k].value.trim();
           if (val) {
             if (id.includes('name') && !id.includes('father') && !id.includes('mother')) name = val;
             if (id.includes('uid') || id.includes('roll')) uid = val;
             if (id.includes('course') || id.includes('program')) course = val;
             if (id.includes('semester')) semester = val;
           }
        }
        
        var photoUrl = '';
        var imgs = document.querySelectorAll('img');
        for (var m = 0; m < imgs.length; m++) {
          var img = imgs[m];
          var rawSrc = img.src || '';
          var dataSrc = img.getAttribute('data-src') || img.getAttribute('lazy-src') || '';
          var src = dataSrc || rawSrc; 
          
          var id = img.id ? img.id.toLowerCase() : '';
          var srcPath = src.split('?')[0].split('/').pop().toLowerCase(); 
          var fullLowerSrc = src.toLowerCase();
          
          if (fullLowerSrc && !fullLowerSrc.includes('logo') && !fullLowerSrc.includes('header') && !fullLowerSrc.includes('banner') && !fullLowerSrc.includes('loader')) {
             if (id.includes('photo') || id.includes('profilepic') || id.includes('imgstudent') || srcPath.includes('photo') || srcPath.includes('profile')) {
                photoUrl = src;
                break;
             }
             if (!photoUrl && !srcPath.includes('icon') && id.includes('contentplaceholder')) {
                photoUrl = src; 
             }
          }
        }
        
        if (!photoUrl) {
           for (var m = 0; m < imgs.length; m++) {
              var img = imgs[m];
              var rawSrc = img.src || '';
              var dataSrc = img.getAttribute('data-src') || img.getAttribute('lazy-src') || '';
              var src = dataSrc || rawSrc;
              var srcPath = src.split('?')[0].split('/').pop().toLowerCase();
              
              if (src && !src.toLowerCase().includes('logo') && !src.toLowerCase().includes('header') && !src.toLowerCase().includes('loader') && !srcPath.includes('icon')) {
                 if (src.includes('data:image') && id.includes('profile')) {
                   photoUrl = src;
                   break;
                 }
              }
           }
        }
        if (photoUrl && photoUrl.startsWith('http://')) {
           photoUrl = photoUrl.replace('http://', 'https://');
        }
        
        var allImgs = Array.from(imgs).map(i => i.id + '=' + (i.getAttribute('data-src') || i.src));
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DEBUG_HTML',
          step: 'profile_images',
          images: allImgs
        }));
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SCRAPE_RESULT',
          step: 'profile',
          data: { name, uid, course, cgpa: 'N/A', semester, photoUrl }
        }));
      } catch(e) {
         window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'profile', data: { name: 'Error', uid: '', course: '', cgpa: '' } }));
      }
      true;
    `
  }, {
    id: 'subjects',
    url: 'https://student.culko.in/frmMyCourse.aspx',
    msg: 'Extracting Subjects...',
    script: `
      try {
        if (!window.location.href.toLowerCase().includes('mycourse')) return;
        var rows = document.querySelectorAll('#ContentPlaceHolder1_gvMyCourses tr');
        if (rows.length < 2) return; 
        try {
          var attA = Array.from(document.querySelectorAll('a')).find(a => a.href && (a.href.toLowerCase().includes('attendancesummary') || a.innerText.toLowerCase().includes('attendance')));
          if (attA && attA.href) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ATTENDANCE_URL', url: attA.href }));
          }
        } catch(e){}
        var debugHtml = document.body.innerHTML;
        var tablesHtml = Array.from(document.querySelectorAll('table')).map(t => t.outerHTML).join('\\n---TAB---\\n');
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DEBUG_HTML',
          step: 'subjects',
          htmlSnippet: tablesHtml.substring(0, 3000)
        }));
        var subjects = [];
        var section = '';
        var headerCells = document.querySelectorAll('#ContentPlaceHolder1_gvMyCourses tr:first-child th');
        var sectionIdx = -1;
        for (var h = 0; h < headerCells.length; h++) {
           if (headerCells[h].innerText.toLowerCase().includes('section')) {
              sectionIdx = h;
              break;
           }
        }
        for (var i = 1; i < rows.length; i++) {
          var code = rows[i].querySelector('span[id*="lblCourseCode"]')?.innerText.trim();
          var name = rows[i].querySelector('span[id*="lblCourseName"]')?.innerText.trim();
          var type = rows[i].querySelector('span[id*="lblType"]')?.innerText.trim();
          
          if (!section && sectionIdx !== -1) {
             var cells = rows[i].querySelectorAll('td');
             if (cells.length > sectionIdx) {
                var secVal = cells[sectionIdx].innerText.trim();
                if (secVal) section = secVal;
             }
          }
          var credits = '0';
          var creditSpan = rows[i].querySelector('span[id*="lblCredit"]');
          if (creditSpan) {
            credits = creditSpan.innerText.trim();
          } else {
            var tds = Array.from(rows[i].querySelectorAll('td')).map(td => td.innerText.trim());
            var credNum = tds.find(t => /^[1-9](\.[0-9]+)?$/.test(t));
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
        if (subjects.length === 0) return; 
        
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'subjects', data: { list: subjects, section: section } }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ 
          type: 'SCRAPE_RESULT', step: 'subjects', 
          data: { list: [], section: '' } 
        }));
      }
      true;
    `
  }, {
    id: 'timetable',
    url: 'https://student.culko.in/frmMyTimeTable.aspx',
    msg: 'Extracting Timetable...',
    script: `
      try {
        
        var rows = document.querySelectorAll('#ContentPlaceHolder1_grdMain tr');
        if (rows.length < 2) {
          
          var tables = document.querySelectorAll('table');
          for (var t = 0; t < tables.length; t++) {
            var r = tables[t].querySelectorAll('tr');
            if (r.length >= 2) {
              var firstRowText = r[0].innerText.toLowerCase();
              if (firstRowText.includes('monday') || firstRowText.includes('tuesday') || firstRowText.includes('time') || firstRowText.includes('day') || firstRowText.includes('period')) {
                rows = r;
                break;
              }
            }
          }
        }
        var bodyText = document.body.innerText.toLowerCase();
        var hasNoData = bodyText.includes('no time table') || bodyText.includes('no record') || bodyText.includes('no schedule') || bodyText.includes('not found') || bodyText.includes('no data');
        if (rows.length < 2 && !hasNoData) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DEBUG_HTML',
            step: 'timetable_guard',
            msg: 'Waiting for rows. Rows found: ' + rows.length + ', hasNoData: ' + hasNoData
          }));
          return;
        }
        try {
          var attA = Array.from(document.querySelectorAll('a')).find(a => a.href && (a.href.toLowerCase().includes('attendancesummary') || a.innerText.toLowerCase().includes('attendance')));
          if (attA && attA.href) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ATTENDANCE_URL', url: attA.href }));
          }
        } catch(e){}
        var timetable = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [] };
        var dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        var daysInColumns = false;
        var headerCells = [];
        var colDaysMap = [];
        
        if (rows.length > 0) {
          headerCells = rows[0].querySelectorAll('th, td');
          var foundAnyDay = false;
          for (var c = 0; c < headerCells.length; c++) {
            var hText = headerCells[c].innerText.trim().toLowerCase();
            var matched = null;
            for (var d = 0; d < dayNames.length; d++) {
              if (hText.includes(dayNames[d])) {
                matched = dayNames[d].charAt(0).toUpperCase() + dayNames[d].slice(1);
                foundAnyDay = true;
                break;
              }
            }
            colDaysMap.push(matched);
          }
          if (foundAnyDay) {
            daysInColumns = true;
          }
        }
        for (var i = 1; i < rows.length; i++) {
          var cells = rows[i].querySelectorAll('td');
          if (cells.length >= 2) {
            var rowFirstCell = cells[0].innerText.trim().toLowerCase();
            var rowDayMatch = null;
            for (var d = 0; d < dayNames.length; d++) {
              if (rowFirstCell.includes(dayNames[d])) {
                rowDayMatch = dayNames[d].charAt(0).toUpperCase() + dayNames[d].slice(1);
                break;
              }
            }
            var timeFromRow = cells[0].innerText.trim();
            for (var j = 1; j < cells.length; j++) {
               var text = cells[j].innerText.replace(/\r?\n|\r/g, ' ').trim();
               if (text && text.length > 3 && text.toLowerCase() !== 'free' && text !== '&nbsp;' && text !== '-') {
                 var matchBy = text.match(/(.*?)\s+by\s+(.*)/i) || text.match(/(.*?)\s+teacher[:\s]+(.*)/i);
                 var leftPart = matchBy ? matchBy[1].trim() : text;
                 var rightPart = matchBy ? matchBy[2].trim() : '';
                 
                 var matchAt = rightPart.match(/(.*?)\s+(?:at|in|room)\s+(.*)/i);
                 var teacher = matchAt ? matchAt[1].trim() : rightPart.trim();
                 var room = matchAt ? matchAt[2].trim() : '';
                 if (!room && !matchBy) {
                   var matchRoom = text.match(/(.*?)\s+(?:at|in|room)[:\s]+(.*)/i);
                   if (matchRoom) {
                     leftPart = matchRoom[1].trim();
                     room = matchRoom[2].trim();
                   }
                 }
                 var leftSplit = leftPart.split(':').map(function(s){ return s.trim(); });
                 var subjectName = leftSplit[0] || leftPart;
                 if (leftSplit[1] && (leftSplit[1].toUpperCase() === 'P' || leftSplit[1].toUpperCase() === 'LAB' || leftSplit[1].toUpperCase().includes('PRACT'))) {
                   subjectName += ' (Lab)';
                 }
                 var group = leftSplit[3] || leftSplit[2] || '';
                 if (group && group.length > 15) group = '';
                 
                 var targetDay = daysInColumns ? colDaysMap[j] : rowDayMatch;
                 var targetTime = daysInColumns ? timeFromRow : (headerCells[j] ? headerCells[j].innerText.trim() : '');
                 
                 if (targetDay && timetable[targetDay]) {
                    timetable[targetDay].push({
                       subjectName: subjectName,
                       teacher: teacher || 'Assigned Faculty',
                       time: targetTime,
                       room: room || 'Campus',
                       group: group
                    });
                 }
               }
            }
          }
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'timetable', data: timetable }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'timetable', data: {} }));
      }
      true;
    `
  }, {
    id: 'attendance',
    url: 'https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx',
    msg: 'Extracting Attendance...',
    script: `
      try {
        
        var tables = document.querySelectorAll('table');
        if (tables.length === 0 && !document.body.innerText.toLowerCase().includes('no attendance')) return;
        var attendanceData = {};
        for (var t = 0; t < tables.length; t++) {
          var rows = tables[t].querySelectorAll('tr');
          if (rows.length < 2) continue;
          
          for (var i = 1; i < rows.length; i++) {
            var cells = rows[i].querySelectorAll('td');
            if (cells.length >= 4) {
               var textArr = Array.from(cells).map(c => c.innerText.trim());
               var code = textArr.find(txt => /^[0-9A-Z]{2,8}[-_]?[0-9]{3}/.test(txt));
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
                     var validCounts = numArr.slice(0, numArr.length - 1).filter(n => n >= 0 && n <= 500);
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
                 var dataObj = { total: total, attended: attended, percentage: percentage };
                 if (code) attendanceData[code] = dataObj;
                 if (altName) attendanceData[altName] = dataObj;
                 if (altName2 && altName2 !== altName) attendanceData[altName2] = dataObj;
               }
            }
          }
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'attendance', data: attendanceData }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'attendance', data: {} }));
      }
      true;
    `
  }, {
    id: 'marks',
    url: 'https://student.culko.in/frmStudentMarksView.aspx',
    msg: 'Extracting Marks...',
    script: `
      try {
        
        var marksData = [];
        var rows = document.querySelectorAll('table tr');
        if (rows.length < 2) return;
        
        
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
        
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: marksData }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: [] }));
      }
      true;
    `
  }];
  function SyncScreen() {
    _s();
    var colors = (0, _storeUseThemeStore.useThemeStore)(s => s.colors);
    var styles = useStyles(colors);
    var router = (0, _expoRouter.useRouter)();
    var {
      userId
    } = (0, _clerkClerkExpo.useAuth)();
    var {
      user
    } = (0, _clerkClerkExpo.useUser)();
    var {
      setScrapedData
    } = (0, _storeStudyosStore.useStudyOSStore)();
    var {
      setSession
    } = (0, _storeStudySessionStore.useStudySessionStore)();
    var webViewRef = (0, _react.useRef)(null);
    var [currentStepIndex, setCurrentStepIndex] = (0, _react.useState)(0);
    var [scrapedDataState, setScrapedDataState] = (0, _react.useState)({});
    var [webviewKey, setWebviewKey] = (0, _react.useState)(`sync-${Date.now()}`);
    var [isTimedOut, setIsTimedOut] = (0, _react.useState)(false);
    var timeoutRef = (0, _react.useRef)(null);
    // Refs to avoid stale closure issues inside intervals/timeouts
    var currentStepIndexRef = (0, _react.useRef)(0);
    var scrapedDataRef = (0, _react.useRef)({});
    var lastCookiesRef = (0, _react.useRef)('');
    var stepCompletedRef = (0, _react.useRef)(false);
    // Previously synced & persisted data 
 used as a fallback when a portal link
    // is unreachable so the app shows the last known good data instead of blocking.
    var cachedDataRef = (0, _react.useRef)(null);
    // Keep refs in sync with state
    (0, _react.useEffect)(() => {
      currentStepIndexRef.current = currentStepIndex;
    }, [currentStepIndex]);
    (0, _react.useEffect)(() => {
      scrapedDataRef.current = scrapedDataState;
    }, [scrapedDataState]);
    // Helper to complete or auto-skip a step with results
    var advanceStep = async (stepId, data, _p) => {
      var isWatchdog = _p === undefined ? false : _p;
      var liveStepIndex = currentStepIndexRef.current;
      var liveStep = SCRAPE_STEPS[liveStepIndex];
      if (!liveStep || stepId !== liveStep.id) {
        console.log(`[SYNC] Ignoring stale result for step "${stepId}" (current step is "${liveStep?.id}")`);
        return;
      }
      console.log(`[SYNC] ${isWatchdog ? '
 Auto-skipped' : '
 Scraped'} step ${liveStepIndex + 1}/${SCRAPE_STEPS.length}: ${stepId}`);
      stepCompletedRef.current = true;
      var newData = {
        ...scrapedDataRef.current,
        [stepId]: data
      };
      scrapedDataRef.current = newData;
      setScrapedDataState(newData);
      // ===== CLERK ACCOUNT LINKING CHECK =====
      if (stepId === 'profile' && data?.uid && data.uid !== 'Unknown' && user) {
        var uid = data.uid;
        var boundUid = user.unsafeMetadata?.studyOsId;
        if (!boundUid) {
          await user.update({
            unsafeMetadata: {
              ...user.unsafeMetadata,
              studyOsId: uid
            }
          });
        } else if (boundUid.toLowerCase() !== uid.toLowerCase()) {
          await SecureStore.deleteItemAsync('culko_cookies');
          await SecureStore.deleteItemAsync('culko_u');
          await SecureStore.deleteItemAsync('culko_p');
          webViewRef.current?.injectJavaScript('try { document.cookie = ""; localStorage.clear(); sessionStorage.clear(); window.location.href = "about:blank"; } catch(e){} true;');
          router.replace({
            pathname: '/(app)/studyos/connect',
            params: {
              error: 'account_linked'
            }
          });
          return;
        }
      }
      // =======================================
      var nextIndex = liveStepIndex + 1;
      if (nextIndex < SCRAPE_STEPS.length) {
        currentStepIndexRef.current = nextIndex;
        setCurrentStepIndex(nextIndex);
      } else {
        // All steps done 
 merge and navigate
        await finalizeSync(newData);
      }
    };
    // Merge whatever we scraped (plus any previously cached values for steps that
    // failed) and persist + navigate to the dashboard. Tolerant of both the
    // in-sync working shape ({list, section}) and the persisted store shape
    // (subjects as a flat array).
    var finalizeSync = async data => {
      var newData = data || {};
      var rawSubjects = newData.subjects;
      var subjList = Array.isArray(rawSubjects) ? rawSubjects : rawSubjects?.list || [];
      var section = rawSubjects && rawSubjects.section || newData.profile?.section || '';
      var updatedSubjects = subjList.map(subj => {
        var att = newData.attendance?.[subj.code];
        if (!att && subj.code) {
          var cleanCode = subj.code.replace(/^[A-Z]+_/, '').trim();
          att = newData.attendance?.[cleanCode];
          if (!att) {
            var matchingKey = Object.keys(newData.attendance || {}).find(k => subj.code.includes(k) || k.includes(cleanCode));
            if (matchingKey) att = newData.attendance[matchingKey];
          }
        }
        if (!att && subj.name) {
          var nameLower = subj.name.toLowerCase().trim();
          var _matchingKey = Object.keys(newData.attendance || {}).find(k => {
            var kl = k.toLowerCase().trim();
            return kl === nameLower || kl.includes(nameLower) || nameLower.includes(kl);
          });
          if (_matchingKey) att = newData.attendance[_matchingKey];
        }
        if (att) {
          return {
            ...subj,
            attendancePercentage: att.percentage,
            attendedClasses: att.attended,
            totalClasses: att.total
          };
        }
        return subj;
      });
      if (newData.profile) newData.profile.section = section;
      var finalTimetable = newData.timetable || {};
      // Fallback 1: If scraped timetable is empty, try to restore the old cached timetable
      if (Object.keys(finalTimetable).length === 0 && cachedDataRef.current?.timetable && Object.keys(cachedDataRef.current.timetable).length > 0) {
        finalTimetable = cachedDataRef.current.timetable;
      }
      await setScrapedData({
        profile: newData.profile,
        subjects: updatedSubjects,
        timetable: finalTimetable,
        marks: newData.marks || [],
        detailedAttendanceCache: newData.attendance || {},
        isScrapedDataLoaded: true
      });
      if (userId && section) {
        (0, _libDb.syncUserWithDB)(userId, section, newData.profile?.uid).catch(e => console.error('Failed to sync section to DB', e));
      }
      await setSession('cu', 'culko-scraped', 0);
      await SecureStore.setItemAsync('culko_cookies', lastCookiesRef.current || '');
      router.replace('/(app)/studyos/dashboard');
    };
    // Skip a step that failed (e.g. its portal link is unreachable) and fall back
    // to whatever was previously synced & stored, so the app never blocks on a
    // dead link 
 it just shows the last known good data.
    var skipStepWithCache = (stepId, isDeadLink = false) => {
      var liveStep = SCRAPE_STEPS[currentStepIndexRef.current];
      if (!liveStep || stepId !== liveStep.id) return; // stale / already moved on
      var cached = stepId === 'attendance' ? cachedDataRef.current?.detailedAttendanceCache : cachedDataRef.current?.[stepId];
      var data = cached;
      if (data === undefined || data === null) {
        data = stepId === 'marks' ? [] : stepId === 'subjects' ? {
          list: [],
          section: ''
        } : {};
      }
      console.log(`[SYNC] ${isDeadLink ? '
 Link unreachable' : '
 Skipped'} step "${stepId}" 
 using ${cached ? 'cached' : 'default'} data`);
      advanceStep(stepId, data, true);
    };
    // Drive navigation + scraping for the CURRENT step only.
    // Event-driven: we react to actual navigation / load events instead of
    // hammering the bridge with a 200ms poll. A lightweight "are we still on the
    // right page?" pulse runs every 1.5s with a hard 30s cap (was 14s) so a slow
    // portal is given time instead of being silently skipped with empty data.
    (0, _react.useEffect)(() => {
      stepCompletedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        // Best-effort finish: if a step is stuck (e.g. a dead portal link), merge
        // whatever we scraped with previously cached data and proceed to the
        // dashboard instead of showing a fatal "Sync Timed Out" screen.
        var merged = {
          ...(cachedDataRef.current || {}),
          ...scrapedDataRef.current
        };
        var hasAnything = !!(merged.profile || merged.subjects && (Array.isArray(merged.subjects) ? merged.subjects.length : merged.subjects.list?.length) || merged.timetable && Object.keys(merged.timetable).length || merged.marks && merged.marks.length);
        if (hasAnything) {
          console.log('[SYNC] 
 Global timeout 
 finalizing with cached + scraped data');
          await finalizeSync(merged);
        } else {
          setIsTimedOut(true);
        }
      }, 75000);
      var step = SCRAPE_STEPS[currentStepIndex];
      if (!step) return;
      // Clear any previous step's "already scraped" guard so this step can run.
      try {
        webViewRef.current?.injectJavaScript(`(function(){ try { window.__scraped_${step.id} = false; } catch(e){} })(); true;`);
      } catch (e) {}
      var expectedKeyword = step.url.split('/').pop()?.split('?')[0]?.toLowerCase() || '';
      // Fire the current step's navigation/scrape immediately.
      var runSmartScript = forceNav => {
        webViewRef.current?.injectJavaScript(`
        (function() {
          try {
            var c = document.cookie;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOKIES', data: c }));
          } catch(e){}
          try {
            var currentUrl = window.location.href.toLowerCase();
            var expectedKeyword = '${expectedKeyword}';
            var stepId = '${step.id}';
            var isCorrectPage = currentUrl.includes(expectedKeyword) && !expectedKeyword.startsWith('javascript:');
            if (!isCorrectPage) {
              var pageText = document.body ? document.body.innerText.toLowerCase() : '';
              var hasTable = document.querySelector('table') !== null;
              if (stepId === 'timetable' && hasTable && (pageText.includes('time table') || pageText.includes('timetable') || pageText.includes('schedule'))) isCorrectPage = true;
              if (stepId === 'attendance' && hasTable && (pageText.includes('attendance') || pageText.includes('total classes'))) isCorrectPage = true;
              if (stepId === 'marks' && hasTable && (pageText.includes('result') || pageText.includes('grade') || pageText.includes('marks'))) isCorrectPage = true;
            }
            // Fast-abort: If we are on the Home page but we expected a specific inner page,
            // it means the portal completely removed the inner page and redirected us to Dashboard.
            if (!isCorrectPage && currentUrl.includes('home') && expectedKeyword !== 'home') {
               // Give the webview 1.5s to start the navigation before declaring it dead,
               // otherwise we might falsely abort while the old Home page is still visible during network transit.
               if (!window['__nav_timer_' + stepId]) {
                   window['__nav_timer_' + stepId] = Date.now();
               } else if (Date.now() - window['__nav_timer_' + stepId] > 2000) {
                   window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PAGE_ERROR', step: stepId }));
                   return;
               }
            }
            // Detect a dead/error page served with HTTP 200 (ASP.NET custom error
            // page). If we landed on the step's URL but it's an error page, report
            // it so the orchestrator can skip the step and fall back to cached data.
            if (currentUrl.includes(expectedKeyword)) {
              var bodyTxt = (document.body ? document.body.innerText : '').toLowerCase();
              if (bodyTxt.includes('page not found') || bodyTxt.includes('404') || bodyTxt.includes('could not be found') || bodyTxt.includes('server error') || bodyTxt.includes('this page isn') || bodyTxt.includes('does not exist') || bodyTxt.includes('removed') || bodyTxt.includes('no longer available') || bodyTxt.includes('object reference not set') || bodyTxt.includes('unhandled exception')) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PAGE_ERROR', step: stepId }));
                return;
              }
            }
            if (isCorrectPage) {
              // Guard: if this step already scraped successfully, skip the
              // (expensive) re-run on repeat pulses. The flag is keyed by step id
              // and cleared by the orchestrator when the step changes.
              try {
                if (window['__scraped_' + stepId]) { return; }
                ${step.script}
                window['__scraped_' + stepId] = true;
              } catch(e) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_ERROR', step: stepId, msg: e.message })); }
            } else if (${forceNav}) {
              var targetUrl = '${step.url}';
              var linkToClick = Array.from(document.querySelectorAll('a')).find(function(a) {
                var h = (a.href || '').toLowerCase();
                var txt = (a.innerText || '').toLowerCase().replace(/\\s+/g, '');
                var oc = (a.getAttribute('onclick') || '').toLowerCase();
                var kw = stepId === 'timetable' ? 'timetable' : stepId === 'attendance' ? 'attendance' : stepId === 'marks' ? 'marks' : expectedKeyword;
                return h.includes(expectedKeyword) || txt.includes(kw) || oc.includes(kw);
              });
              if (linkToClick) linkToClick.click();
              else window.location.href = targetUrl;
            }
          } catch(e){}
        })();
        true;
      `);
      };
      // Kick off this step immediately: navigate to its page (force) if we're not
      // already there, otherwise scrape right away.
      setTimeout(() => runSmartScript(true), 50);
      // Lightweight keep-alive pulse: only re-runs if the step hasn't completed yet.
      // 700ms (was 1.5s) so a slow-rendering CUIMS table is caught as soon as it
      // appears instead of waiting a full extra 1.5s per tick.
      var pulse = setInterval(() => {
        if (stepCompletedRef.current) return;
        runSmartScript(false);
      }, 700);
      // Watchdog: auto-skip if a step is genuinely stuck. Lowered to 8s
      // so a slow CUIMS attendance/marks page can't drag the whole sync 
 with the
      // cached-data fallback, advancing early just shows the last known good data.
      var watchdogTimer = setTimeout(() => {
        if (stepCompletedRef.current) return;
        var liveIdx = currentStepIndexRef.current;
        var liveStep = SCRAPE_STEPS[liveIdx];
        if (liveStep && liveIdx >= 1) {
          // Prefer previously cached data over empty defaults so a slow/dead step
          // never drops data the user already has.
          var cached = liveStep.id === 'attendance' ? cachedDataRef.current?.detailedAttendanceCache : cachedDataRef.current?.[liveStep.id];
          var defaultData = cached !== undefined && cached !== null ? cached : liveStep.id === 'marks' ? [] : liveStep.id === 'subjects' ? {
            list: [],
            section: ''
          } : {};
          console.log(`[SYNC] 
 Watchdog expired for step "${liveStep.id}" (8s). Auto-advancing with ${cached ? 'cached' : 'default'} data.`);
          advanceStep(liveStep.id, defaultData, true);
        }
      }, 8000);
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        clearTimeout(watchdogTimer);
        clearInterval(pulse);
      };
    }, [currentStepIndex, webviewKey]);
    // Reset all state on every focus (handles account switch without reopen)
    (0, _expoRouter.useFocusEffect)((0, _react.useCallback)(() => {
      var freshKey = `sync-${Date.now()}`;
      // Snapshot the last successfully synced data so failed steps can fall back to it.
      cachedDataRef.current = _storeStudyosStore.useStudyOSStore.getState();
      setCurrentStepIndex(0);
      currentStepIndexRef.current = 0;
      stepCompletedRef.current = false;
      setScrapedDataState({});
      scrapedDataRef.current = {};
      setWebviewKey(freshKey);
      setIsTimedOut(false);
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }, []));
    var currentStep = SCRAPE_STEPS[currentStepIndex];
    var triggerScriptInjection = (isRetry = false) => {
      var step = SCRAPE_STEPS[currentStepIndexRef.current];
      if (!step) return;
      var delay = isRetry ? 100 : 300;
      setTimeout(() => {
        var expectedKeyword = step.url.split('/').pop()?.split('?')[0]?.toLowerCase() || '';
        var smartScript = `
        (function() {
          try {
            var c = document.cookie;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOKIES', data: c }));
          } catch(e){}
          try {
            var currentUrl = window.location.href.toLowerCase();
            if (!currentUrl.includes('${expectedKeyword}')) {
              var now = Date.now();
              var lastNav = Number(sessionStorage.getItem('last_nav_time') || 0);
              var lastTarget = sessionStorage.getItem('last_nav_target') || '';
              var targetUrl = '${step.url}';
              if (lastTarget !== targetUrl || now - lastNav > 8000) {
                sessionStorage.setItem('last_nav_time', now);
                sessionStorage.setItem('last_nav_target', targetUrl);
                window.location.href = targetUrl;
              }
            } else {
              try { ${step.script} } catch(e){}
            }
          } catch(e){}
        })();
        true;
      `;
        webViewRef.current?.injectJavaScript(smartScript);
      }, delay);
    };
    var handleNavigationStateChange = navState => {
      // Just trigger injection on any navigation end 
 smart script handles URL check internally
      if (!navState.loading) {
        triggerScriptInjection();
      }
    };
    var handleMessage = async event => {
      try {
        var data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'COOKIES') {
          if (data.data) {
            lastCookiesRef.current = data.data;
            SecureStore.setItemAsync('culko_cookies', data.data).catch(() => {});
          }
        } else if ((data.type === 'ATTENDANCE_URL' || data.type === 'TIMETABLE_URL' || data.type === 'MARKS_URL' || data.type === 'DYNAMIC_URL') && data.url) {
          var fullUrl = data.url;
          if (!fullUrl.startsWith('http') && !fullUrl.startsWith('javascript:')) {
            fullUrl = `https://student.culko.in/${fullUrl.replace(/^\//, '')}`;
          }
          var targetStepId = data.step || (data.type === 'ATTENDANCE_URL' ? 'attendance' : data.type === 'TIMETABLE_URL' ? 'timetable' : 'marks');
          console.log(`Dynamic ${targetStepId} URL found:`, fullUrl);
          var targetStep = SCRAPE_STEPS.find(s => s.id === targetStepId);
          if (targetStep && (fullUrl.startsWith('http') || fullUrl.startsWith('javascript:'))) {
            targetStep.url = fullUrl;
          }
        } else if (data.type === 'PAGE_ERROR') {
          // Portal returned an error page (e.g. the timetable link was removed).
          // Skip this step and fall back to cached data instead of hanging.
          skipStepWithCache(data.step, true);
        } else if (data.type === 'DEBUG_HTML') {
          console.log('========= DEBUG HTML FOR STEP:', data.step, '=========');
          console.log(JSON.stringify(data, null, 2));
        } else if (data.type === 'SCRAPE_RESULT') {
          await advanceStep(data.step, data.data);
        }
      } catch (e) {
        console.log('Error parsing scrape message', e);
      }
    };
    // HTTP-level failure for a step's main page (e.g. 404 when the university
    // removes a link). Skip the step and use cached data.
    var handleHttpError = e => {
      var status = e?.nativeEvent?.statusCode;
      var url = (e?.nativeEvent?.url || '').toLowerCase();
      if (!status || status < 400) return;
      var liveStep = SCRAPE_STEPS[currentStepIndexRef.current];
      if (!liveStep) return;
      var expectedKeyword = liveStep.url.split('/').pop()?.toLowerCase() || '';
      if (expectedKeyword && url.includes(expectedKeyword)) {
        console.log(`[SYNC] 
 HTTP ${status} for step "${liveStep.id}" page 
 link likely removed`);
        skipStepWithCache(liveStep.id, true);
      }
    };
    return (0, _reactJsxRuntime.jsxs)(_reactNative.View, {
      style: styles.container,
      children: [(0, _reactJsxRuntime.jsx)(_reactNative.View, {
        style: styles.content,
        children: isTimedOut ? (0, _reactJsxRuntime.jsxs)(_reactJsxRuntime.Fragment, {
          children: [(0, _reactJsxRuntime.jsx)(_reactNative.Text, {
            style: [styles.title, {
              color: colors.error || '#ef4444'
            }],
            children: "Sync Timed Out"
          }), (0, _reactJsxRuntime.jsx)(_reactNative.Text, {
            style: [styles.subtitle, {
              color: colors.textDim
            }],
            children: "Could not load college data. Please check your connection."
          }), (0, _reactJsxRuntime.jsx)(_reactNative.TouchableOpacity, {
            onPress: () => router.replace({
              pathname: '/(app)/studyos/connect',
              params: {
                reset: 'true'
              }
            }),
            style: {
              marginTop: 20,
              backgroundColor: colors.primary,
              paddingHorizontal: 28,
              paddingVertical: 14,
              borderRadius: 100
            },
            children: (0, _reactJsxRuntime.jsx)(_reactNative.Text, {
              style: {
                color: '#fff',
                fontWeight: 'bold',
                fontSize: 15
              },
              children: "Try Again"
            })
          })]
        }) : (0, _reactJsxRuntime.jsxs)(_reactJsxRuntime.Fragment, {
          children: [(0, _reactJsxRuntime.jsx)(_reactNative.ActivityIndicator, {
            size: "large",
            color: colors.primary
          }), (0, _reactJsxRuntime.jsx)(_reactNative.Text, {
            style: styles.title,
            children: "Syncing College Data"
          }), (0, _reactJsxRuntime.jsx)(_reactNative.Text, {
            style: styles.subtitle,
            children: currentStep?.msg || 'Finishing up...'
          }), (0, _reactJsxRuntime.jsxs)(_reactNative.Text, {
            style: styles.progressText,
            children: [currentStepIndex + 1, " / ", SCRAPE_STEPS.length, " Steps"]
          })]
        })
      }), !isTimedOut && (0, _reactJsxRuntime.jsx)(_reactNative.View, {
        style: styles.hiddenWebviewContainer,
        children: (0, _reactJsxRuntime.jsx)(_reactNativeWebview.WebView, {
          ref: webViewRef,
          source: {
            uri: SCRAPE_STEPS[0].url
          },
          onNavigationStateChange: handleNavigationStateChange,
          onLoadEnd: () => triggerScriptInjection(),
          onHttpError: handleHttpError,
          onMessage: handleMessage,
          javaScriptEnabled: true,
          domStorageEnabled: true,
          sharedCookiesEnabled: true,
          incognito: false,
          cacheEnabled: true,
          thirdPartyCookiesEnabled: true
        }, webviewKey)
      })]
    });
  _s(SyncScreen, "w16x2rsXvP+kAeYCZ+ab474DPnE=", false, function () {
    return [_storeUseThemeStore.useThemeStore, useStyles, _expoRouter.useRouter, _clerkClerkExpo.useAuth, _clerkClerkExpo.useUser, _storeStudyosStore.useStudyOSStore, _storeStudySessionStore.useStudySessionStore, _expoRouter.useFocusEffect];
  });
  _c = SyncScreen;
  var useStyles = colors => _reactNative.StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: _constantsTheme.Spacing.xl
    },
    title: {
      ..._constantsTheme.Typography.h2,
      color: colors.text,
      marginTop: _constantsTheme.Spacing.xl,
      marginBottom: _constantsTheme.Spacing.sm
    },
    subtitle: {
      ..._constantsTheme.Typography.body,
      color: colors.primary,
      fontSize: 16,
      marginBottom: _constantsTheme.Spacing.lg
    },
    progressText: {
      ..._constantsTheme.Typography.small,
      color: colors.textDim
    },
    hiddenWebviewContainer: {
      width: 0,
      height: 0,
      opacity: 0,
      position: 'absolute',
      left: -1000
    }
  });
  var _c;
  $RefreshReg$(_c, "SyncScreen");
dependenciesoutputnamedatareactasyncTypeisESMImportlocsexportNamesimportsstartfilenameidentifierNamelinecolumnindexRtGiGa+/H7VrI7GDQDLhO1UbpU8=react-nativeKyzuX10g6ixS9UfynhmjlvCIG3g=react-native-webviewYJc7i/oIweCWhKjzjfYLEcLeUJA=expo-router/+ErnBisjrT6aDU+GRp5Qz/lYoY=../../../constants/themedDBTivleuDf9urw2+EtZcwmZVXs=../../../store/useThemeStoreuYbfhzVu/HdaPVdt663P9aDFLQ8=../../../store/studyosStoret6Bv8cR4yHNx80frQrGWhaBXGbA=../../../store/studySessionStoreHLGkK9ie7gIVcO0WwJngrgBLjDY=expo-secure-storeBU2XtfznZ4PiVldqd/oueHCCaLo=@clerk/clerk-expo99IxybUddBffxYGKZiCPWHYhwHo=../../../lib/dbKup+Ll3AL8fS6dRmf1QLkqzwKNM=react/jsx-runtime3suYSPX9nHbHZ1xNTsKXtKj0atE=datatypecodelineCountfunctionMaphasCjsExportsreactServerReferencereactClientReferenceexpoDomComponentReferenceloaderReference__version__count__names__packedObjectdefinePropertyexportsenumerableSyncScreen_reactrequire_dependencyMap_reactNative_reactNativeWebview_expoRouter_constantsTheme_storeUseThemeStore_storeStudyosStore_storeStudySessionStore_expoSecureStoreSecureStore_interopNamespace_clerkClerkExpo_libDb_reactJsxRuntimeSCRAPE_STEPSscriptcolorsuseThemeStorestylesuseStylesrouteruseRouteruserIduseAuthuseruseUsersetScrapedDatauseStudyOSStoresetSessionuseStudySessionStorewebViewRefuseRefcurrentStepIndexsetCurrentStepIndexuseStatescrapedDataStatesetScrapedDataStatewebviewKeysetWebviewKeyDateisTimedOutsetIsTimedOuttimeoutRefcurrentStepIndexRefscrapedDataReflastCookiesRefstepCompletedRefcachedDataRefuseEffectcurrentadvanceStepstepIddataisWatchdogundefinedliveStepIndexliveStepconsolelengthnewDataboundUidunsafeMetadatastudyOsIdupdatetoLowerCasedeleteItemAsyncinjectJavaScriptreplacepathnameparamserrornextIndexfinalizeSyncrawSubjectssubjectssubjListArrayisArraylistsectionprofileupdatedSubjectssubjattendancecodecleanCodetrimmatchingKeykeysfindincludesnamenameLowerattendancePercentagepercentageattendedClassesattendedtotalClassestotalfinalTimetabletimetablemarksdetailedAttendanceCacheisScrapedDataLoadedsyncUserWithDBcatchsetItemAsyncskipStepWithCacheisDeadLinkcachedclearTimeoutsetTimeoutmergedhasAnythingstepexpectedKeywordsplitrunSmartScriptforceNavpulsesetIntervalwatchdogTimerliveIdxdefaultDataclearIntervaluseFocusEffectuseCallbackfreshKeygetStatecurrentSteptriggerScriptInjectionisRetrydelaysmartScripthandleNavigationStateChangenavStateloadinghandleMessageeventJSONparsenativeEventtypefullUrlstartsWithtargetStepIdtargetStepstringifyhandleHttpErrorstatusstatusCodejsxsViewstylecontainerchildrencontentFragmentTexttitlecolorsubtitletextDimTouchableOpacityonPressresetmarginTopbackgroundColorprimarypaddingHorizontalpaddingVerticalborderRadiusfontWeightfontSizeActivityIndicatorsizeprogressTexthiddenWebviewContainerWebViewsourceonNavigationStateChangeonLoadEndonHttpErroronMessagejavaScriptEnableddomStorageEnabledsharedCookiesEnabledincognitocacheEnabledthirdPartyCookiesEnabledStyleSheetcreateflexbackgroundjustifyContentalignItemspaddingSpacingTypographytextmarginBottombodysmallwidthheightopacitypositionleft$RefreshReg$namesmappings<global>SyncScreenuseThemeStore$argument_0useEffect$argument_0advanceStepfinalizeSyncsubjList.map$argument_0Object.keys.find$argument_0syncUserWithDB._catch$argument_0skipStepWithCachesetTimeout$argument_0runSmartScriptsetInterval$argument_0<anonymous>useFocusEffect$argument_0triggerScriptInjectionhandleNavigationStateChangehandleMessageSecureStore.setItemAsync._catch$argument_0SCRAPE_STEPS.find$argument_0handleHttpErrorTouchableOpacity.props.onPressWebView.props.onLoadEnduseStylesAAA;eC4f;+BCC,eD;YEyB,yDF;YEC,oDF;sBGG;GHyC;uBIM;yCCM;YCO,mDD;uECO;SDG;KDO;eGsB,qDH;GJM;4BQK;GRY;YEO;oCOG;KPiB;2BQU;KRuE;eOI,0BP;8BSK;KTG;qCOK;KPgB;WUE;KVI;GFC;gBaI;aDW;OCE;KbC;iCcK;eLI;KK4B;GdC;sCeE;GfK;wBgBE;qECM,QD;6CES,0BF;GhBiB;0BmBI;GnBW;uBoBU,8FpB;uBqByB,8BrB;CDc;kBuBE;EvBkCjs/module
