import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import { useThemeStore } from '../../../store/useThemeStore';
import { useStudyOSStore } from '../../../store/studyosStore';
import { useStudySessionStore } from '../../../store/studySessionStore';
import * as SecureStore from 'expo-secure-store';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { syncUserWithDB } from '../../../lib/db';
import timetableData from './timetableData.json';

const SCRAPE_STEPS = [
  {
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
           var imgId = imgs[m].id.toLowerCase();
           var imgSrc = imgs[m].src;
           if (imgId.includes('photo') || imgId.includes('student') || imgId.includes('profile') || imgId.includes('img')) {
              if (imgSrc && !imgSrc.toLowerCase().includes('logo') && !imgSrc.toLowerCase().includes('header')) {
                 photoUrl = imgSrc;
                 break;
              }
           }
        }
        
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
  },
  {
    id: 'subjects',
    url: 'https://student.culko.in/frmMyCourse.aspx',
    msg: 'Extracting Subjects...',
    script: `
      try {
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

        var rows = document.querySelectorAll('#ContentPlaceHolder1_gvMyCourses tr');
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
        if(subjects.length === 0) throw new Error("No subjects found");
        
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'subjects', data: { list: subjects, section: section } }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ 
          type: 'SCRAPE_RESULT', step: 'subjects', 
          data: { list: [], section: '' } 
        }));
      }
      true;
    `
  },
  {
    id: 'attendance',
    url: 'https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx?type=etgkYfqBdH1fSfc255iYGw==',
    msg: 'Extracting Attendance...',
    script: `
      try {
        var debugHtml = document.body.innerHTML;
        var tablesHtml = Array.from(document.querySelectorAll('table')).map(t => t.outerHTML).join('\\n---TAB---\\n');
        
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DEBUG_HTML',
          step: 'attendance',
          htmlSnippet: tablesHtml.substring(0, 5000)
        }));

        var attendanceData = {};
        var rows = document.querySelectorAll('table tr');
        for (var i = 1; i < rows.length; i++) {
          var cells = rows[i].querySelectorAll('td');
          if (cells.length >= 4) {
             var textArr = Array.from(cells).map(c => c.innerText.trim());
             var code = textArr.find(t => /^[0-9A-Z]{2,8}[-_]?[0-9]{3}/.test(t));
             var altName = textArr[0] || '';
             var altName2 = textArr[1] || '';
             
             var numArr = [];
             for(var j=0; j<textArr.length; j++) {
                var clean = textArr[j].replace('%', '').trim();
                if(clean !== '' && !isNaN(Number(clean))) {
                   numArr.push(Number(clean));
                }
             }
             
             if (numArr.length >= 2) {
                var percentage = numArr[numArr.length - 1];
                var attended = numArr[numArr.length - 2] || 0;
                var total = numArr[numArr.length - 3] || 0;
                
                var dataObj = { total: total, attended: attended, percentage: percentage };
                if (code) attendanceData[code] = dataObj;
                if (altName) attendanceData[altName] = dataObj;
                if (altName2) attendanceData[altName2] = dataObj;
             }
          }
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'attendance', data: attendanceData }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'attendance', data: {} }));
      }
      true;
    `
  },
  {
    id: 'marks',
    url: 'https://student.culko.in/frmStudentMarksView.aspx',
    msg: 'Extracting Marks...',
    script: `
      try {
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
        
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: marksData }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRAPE_RESULT', step: 'marks', data: [] }));
      }
      true;
    `
  }
];

export default function SyncScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { userId } = useAuth();
  const { setScrapedData } = useStudyOSStore();
  const { setSession } = useStudySessionStore();
  const webViewRef = useRef<WebView>(null);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [scrapedDataState, setScrapedDataState] = useState<any>({});
  
  const currentStep = SCRAPE_STEPS[currentStepIndex];

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    if (!navState.loading && navState.url.includes(currentStep.url.split('?')[0])) {
      // Inject script shortly after page is fully loaded
      setTimeout(() => {
        // Run cookie capture and scrape script simultaneously to save time
        const combinedScript = `
          (function() {
            try {
              var c = document.cookie;
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'COOKIES', data: c }));
            } catch(e) {}
          })();
          ${currentStep.script}
        `;
        webViewRef.current?.injectJavaScript(combinedScript);
      }, 100); // Drastically reduced delay since ASP.NET WebForms render on server
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'COOKIES') {
        // Save latest cookies whenever we get them
        if (data.data) {
          SecureStore.setItemAsync('culko_cookies', data.data).catch(() => {});
        }
      } else if (data.type === 'DEBUG_HTML') {
        console.log('========= DEBUG HTML FOR STEP:', data.step, '=========');
        console.log(JSON.stringify(data, null, 2));
      } else if (data.type === 'SCRAPE_RESULT' && data.step === currentStep.id) {
        console.log('Scraped data for', data.step, data.data);
        const newData = { ...scrapedDataState, [data.step]: data.data };
        setScrapedDataState(newData);

        if (currentStepIndex < SCRAPE_STEPS.length - 1) {
          setCurrentStepIndex(currentStepIndex + 1);
        } else {
          // Merge attendance into subjects
          const subjList = newData.subjects?.list || [];
          const section = newData.subjects?.section || '';
          
          const updatedSubjects = subjList.map((subj: any) => {
            let att = newData.attendance?.[subj.code];
            if (!att && subj.code) {
               // Try without prefix or exact match
               const cleanCode = subj.code.replace(/^[A-Z]+_/, '').trim();
               att = newData.attendance[cleanCode];
               
               // Try matching by checking if any key in attendance is a substring of the subject code
               if (!att) {
                  const matchingKey = Object.keys(newData.attendance || {}).find(k => subj.code.includes(k) || k.includes(cleanCode));
                  if (matchingKey) att = newData.attendance[matchingKey];
               }
            }
            if (att) {
              return { ...subj, attendancePercentage: att.percentage, attendedClasses: att.attended, totalClasses: att.total };
            }
            return subj;
          });

          if (newData.profile) {
             newData.profile.section = section;
          }

          let finalTimetable = {};
          if (section && (timetableData as any)[section]) {
             finalTimetable = (timetableData as any)[section];
          }

          await setScrapedData({
            profile: newData.profile,
            subjects: updatedSubjects,
            timetable: finalTimetable,
            marks: newData.marks || [],
            isScrapedDataLoaded: true
          });
          
          if (userId && section) {
            syncUserWithDB(
              userId, 
              section, 
              newData.profile?.uid
            ).catch(e => console.error('Failed to sync section to DB', e));
          }

          await setSession('cu', 'culko-scraped', 0);
          // Save cookies for future refresh
          await SecureStore.setItemAsync('culko_cookies', newData._cookies || '');
          router.replace('/(app)/studyos/dashboard');
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
      </View>

      {/* Hidden WebView to perform the actual scraping */}
      {currentStep && (
        <View style={styles.hiddenWebviewContainer}>
          <WebView
            ref={webViewRef}
            source={{ uri: currentStep.url }}
            onNavigationStateChange={handleNavigationStateChange}
            onMessage={handleMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
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
