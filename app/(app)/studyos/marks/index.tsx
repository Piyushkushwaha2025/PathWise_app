import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Modal, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon, Line, Text as SvgText, Circle } from 'react-native-svg';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { useRouter, useFocusEffect } from 'expo-router';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { useThemeStore } from '../../../../store/useThemeStore';
import { useStudyOSStore } from '../../../../store/studyosStore';
import { useStudySessionStore } from '../../../../store/studySessionStore';
import * as SecureStore from 'expo-secure-store';

const { width } = Dimensions.get('window');
const RADAR_SIZE = width - 180; // Adjusted size to make circle smaller
const CENTER = RADAR_SIZE / 2;
const RADIUS = (RADAR_SIZE / 2) - 35;

export default function MarksScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
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

  useFocusEffect(
    React.useCallback(() => {
      // Reset to Internal Marks whenever the user leaves and comes back to this tab
      return () => {
        setSelectedSemester('');
        setResultData(null);
      };
    }, [])
  );

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSessionModalVisible, setIsSessionModalVisible] = useState(false);
  const cookieScript = useRef<string>('');
  const injectAndScrapeRef = useRef<() => void>(() => {});

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
  }, []);

  // Prioritize subjects from dashboard to ensure all are shown, even if they don't have internal marks yet
  const chartData = subjects?.length > 0 ? subjects.map(s => {
    // Find matching mark object if it exists
    const m = marks?.find(mark => 
      mark.subjectName.toLowerCase() === s.name.toLowerCase() || 
      mark.subjectName.toLowerCase().includes(s.name.toLowerCase()) || 
      s.name.toLowerCase().includes(mark.subjectName.toLowerCase())
    );
    
    let totalObtained = 0;
    let totalMax = 0;
    let hasValidMarks = false;

    if (m) {
      if (m.mstMarks && m.mstMarks.includes('/')) {
         const p = m.mstMarks.split('/');
         if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
            totalObtained += parseFloat(p[0]);
            totalMax += parseFloat(p[1]);
            hasValidMarks = true;
         }
      }
      if (m.practicalMarks && m.practicalMarks.includes('/')) {
         const p = m.practicalMarks.split('/');
         if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
            totalObtained += parseFloat(p[0]);
            totalMax += parseFloat(p[1]);
            hasValidMarks = true;
         }
      }
    }
    
    const score = hasValidMarks && totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    const cleanedName = s.name.replace(/\s*\(?(theory|practical)\)?/gi, '').trim();
    return { subject: cleanedName, score: isNaN(score) ? 0 : score, hasMarks: hasValidMarks };
  }) : marks?.length > 0 ? marks.map(m => {
     // Fallback if subjects array is empty but marks exists
     let totalObtained = 0;
     let totalMax = 0;
     let hasValidMarks = false;
     if (m.mstMarks && m.mstMarks.includes('/')) {
         const p = m.mstMarks.split('/');
         if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
            totalObtained += parseFloat(p[0]);
            totalMax += parseFloat(p[1]);
            hasValidMarks = true;
         }
      }
      if (m.practicalMarks && m.practicalMarks.includes('/')) {
         const p = m.practicalMarks.split('/');
         if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
            totalObtained += parseFloat(p[0]);
            totalMax += parseFloat(p[1]);
            hasValidMarks = true;
         }
      }
     const score = hasValidMarks && totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
     const cleanedName = m.subjectName.replace(/\s*\(?(theory|practical)\)?/gi, '').trim();
     return { subject: cleanedName, score: isNaN(score) ? 0 : score, hasMarks: hasValidMarks };
  }) : [{ subject: 'No Data', score: 0, hasMarks: false }];

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
                 onPress: async () => { await clearSession(); router.replace('/(app)' as any); }
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
        if (data.selected) {
           setSelectedSemester(data.selected);
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
      }
    } catch (e) {}
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    console.log("MARKS WEBVIEW NAV:", navState.url, navState.loading);
    if (!navState.loading) {
      if (navState.url.includes('Login') || navState.url.includes('login')) {
        // Session expired
        setIsLoading(false);
        setRefreshing(false);
        setIsSessionModalVisible(true);
        return;
      }
      setTimeout(() => injectAndScrapeRef.current(), 2000);
    }
  };

  const selectSemester = (value: string) => {
    if (value === 'RECONNECT') {
       setIsModalVisible(false);
       clearSession();
       router.replace('/(app)' as any);
       return;
    }

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
  const overallPercentage = grandTotalMax > 0 ? ((grandTotalObtained / grandTotalMax) * 100).toFixed(2) + '%' : '';

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
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: colors.primary + '15',
              justifyContent: 'center',
              alignItems: 'center',
              borderWidth: 1.5,
              borderColor: colors.primary + '30',
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 4
            }}>
              <Ionicons name="radar-outline" size={24} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Performance Radar</Text>
              <Text style={styles.headerSubtitle}>Tap points for details</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.semesterBtn} onPress={() => setIsModalVisible(true)}>
            <Ionicons name="trophy-outline" size={14} color={colors.primary} />
            <Text style={styles.semesterBtnText}>
              {selectedSemester ? (semesterOptions.find(opt => opt.value === selectedSemester)?.text || 'Final Results') : 'View Final Results'}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.radarContainer}>
          <RadarChart data={chartData} />
        </View>

        {resultData && resultData.subjects.length > 0 && !isLoading && (
          <View style={[styles.listContainer, { marginBottom: 24 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
              <Text style={styles.listTitle}>Final Results</Text>
              <View style={styles.sgpaBadge}>
                <Text style={styles.sgpaText}>SGPA: {resultData.sgpa || 'N/A'}</Text>
              </View>
            </View>

            {resultData.subjects.map((sub, i) => (
              <View key={`res-${i}`} style={styles.resultCard}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.resultSubName}>{sub.name}</Text>
                  <Text style={styles.resultSubCode}>{sub.code} • {sub.credit} Credits</Text>
                  {(sub.internal || sub.external) && (
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                      Int: {sub.internal || '-'} • Ext: {sub.external || '-'}
                    </Text>
                  )}
                </View>
                <View style={styles.gradeBadge}>
                  <Text style={styles.gradeText}>{sub.grade}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.listContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.listTitle}>Internal Marks</Text>
            {overallPercentage ? (
              <View style={styles.sgpaBadge}>
                <Text style={styles.sgpaText}>{overallPercentage}</Text>
              </View>
            ) : null}
          </View>
            {marks && marks.length > 0 ? marks.map((item, index) => {
              const isExpanded = expandedIndex === index;
              
              let totalObtained = 0;
              let totalMax = 0;
              let hasValidMarks = false;

              if (item.mstMarks && item.mstMarks.includes('/')) {
                 const p = item.mstMarks.split('/');
                 if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
                    totalObtained += parseFloat(p[0]);
                    totalMax += parseFloat(p[1]);
                    hasValidMarks = true;
                 }
              }
              if (item.practicalMarks && item.practicalMarks.includes('/')) {
                 const p = item.practicalMarks.split('/');
                 if (p.length === 2 && !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))) {
                    totalObtained += parseFloat(p[0]);
                    totalMax += parseFloat(p[1]);
                    hasValidMarks = true;
                 }
              }
              const percentage = hasValidMarks ? ((totalObtained / totalMax) * 100).toFixed(2) + '%' : '';

              return (
                <View key={index.toString()} style={styles.accordionCard}>
                  <TouchableOpacity 
                    style={styles.accordionHeader} 
                    onPress={() => setExpandedIndex(isExpanded ? null : index)}
                  >
                    <View style={{ flex: 1, paddingRight: 16 }}>
                      <Text style={styles.accordionTitle}>{item.subjectName}</Text>
                      {percentage ? (
                        <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 4 }}>
                           {percentage}
                        </Text>
                      ) : (
                        <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
                           Marks Not Available
                        </Text>
                      )}
                    </View>
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textDim} />
                  </TouchableOpacity>
                  
                  {isExpanded && (
                    <View style={styles.accordionContent}>
                      <View style={styles.markRow}>
                        <Text style={styles.markLabel}>MST</Text>
                        <Text style={styles.markValue}>{item.mstMarks}</Text>
                      </View>
                      <View style={styles.markRow}>
                        <Text style={styles.markLabel}>Practical</Text>
                        <Text style={styles.markValue}>{item.practicalMarks}</Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            }) : (
              <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 40, padding: 20 }}>
                <Ionicons name="document-text-outline" size={64} color="#3b82f640" />
                <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold', marginTop: 16 }}>No Marks Uploaded Yet</Text>
                <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 8, fontSize: 13, lineHeight: 20 }}>
                  There are no internal marks uploaded for the current session yet. You can check back later, or select a past semester from the top right to view your final results.
                </Text>
              </View>
            )}
          </View>
      </ScrollView>

      <Modal visible={isModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Semester</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {semesterOptions.map((opt, i) => {
                const isSel = selectedSemester === opt.value;
                const isMay = opt.text.toLowerCase().includes('may') || opt.text.toLowerCase().includes('odd');
                const isDec = opt.text.toLowerCase().includes('dec') || opt.text.toLowerCase().includes('even') || opt.text.toLowerCase().includes('nov');
                const accentColor = isMay ? '#f59e0b' : isDec ? '#3b82f6' : colors.primary;
                return (
                  <TouchableOpacity
                    key={i.toString()}
                    style={[
                      styles.modalOption,
                      isSel && { backgroundColor: accentColor + '22', borderRadius: 12, borderBottomWidth: 0, borderWidth: 1, borderColor: accentColor + '60' }
                    ]}
                    onPress={() => selectSemester(opt.value)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={[styles.sessionDot, { backgroundColor: accentColor + '30', borderColor: accentColor }]}>
                        <Ionicons
                          name={isMay ? 'sunny-outline' : isDec ? 'snow-outline' : 'school-outline'}
                          size={16}
                          color={accentColor}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalOptionText, isSel && { color: accentColor, fontFamily: 'Inter_700Bold' }]}>
                          {opt.text}
                        </Text>
                        {(isMay || isDec) && (
                          <Text style={{ color: isMay ? '#f59e0b80' : '#3b82f680', fontSize: 11, marginTop: 2 }}>
                            {isMay ? 'Summer Examination' : 'Winter Examination'}
                          </Text>
                        )}
                      </View>
                      {isSel && <Ionicons name="checkmark-circle" size={18} color={accentColor} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {semesterOptions.length === 0 && (
                <View style={{ padding: 20, alignItems: 'center' }}>
                   <ActivityIndicator size="small" color="#3b82f6" />
                   <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 10 }}>Loading sessions from server...</Text>
                   <Text style={{ color: '#666', textAlign: 'center', marginTop: 5, fontSize: 11 }}>This may take a few seconds.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={isSessionModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View
            style={{ backgroundColor: colors.surface, padding: 24, borderRadius: 24, width: '100%', borderWidth: 1, borderColor: colors.border }}
          >
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#ef444420', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="key-outline" size={28} color="#ef4444" />
            </View>
            <Text style={{ color: colors.text, fontSize: 20, fontFamily: 'SpaceGrotesk_700Bold', marginBottom: 8 }}>Connection Lost</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 22, marginBottom: 24 }}>
              For your security, your connection to the college portal has timed out. Please reconnect to continue viewing your marks.
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.surfaceHigh, alignItems: 'center' }}
                onPress={() => setIsSessionModalVisible(false)}
              >
                <Text style={{ color: colors.text, fontFamily: 'Inter_600SemiBold' }}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' }}
                onPress={async () => {
                   setIsSessionModalVisible(false);
                   await clearSession();
                   router.replace('/(app)' as any);
                }}
              >
                <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Reconnect</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
      </View>
    </View>
  );
}

function RadarChart({ data }: { data: { subject: string, score: number, hasMarks?: boolean }[] }) {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const points = data.map((d, i) => {
    const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
    const r = (d.score / 100) * RADIUS;
    return `${CENTER + r * Math.cos(angle)},${CENTER + r * Math.sin(angle)}`;
  }).join(' ');

  return (
    <View style={[styles.chartContainer, { position: 'relative', width: RADAR_SIZE + 80, height: RADAR_SIZE + 80 }]}>
      <Svg width={RADAR_SIZE} height={RADAR_SIZE} style={{ position: 'absolute', left: 40, top: 40 }}>
        {[0.2, 0.4, 0.6, 0.8, 1].map((scale, i) => (
          <Circle
            key={`circle-${i}`}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS * scale}
            stroke={colors.border}
            strokeWidth="1"
            fill="none"
          />
        ))}
        {data.map((_, i) => {
          const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
          const x = CENTER + RADIUS * Math.cos(angle);
          const y = CENTER + RADIUS * Math.sin(angle);
          return <Line key={`line-${i}`} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke={colors.border} strokeWidth="1" />;
        })}
        <Polygon points={points} fill="#3b82f640" stroke="#3b82f6" strokeWidth="2" />
      </Svg>

      {data.map((d, i) => {
        const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
        const labelRadius = RADIUS + 45; // Sweet spot: not too close, not too far
        const x = CENTER + labelRadius * Math.cos(angle) + 40; // +40 for wrapper offset
        const y = CENTER + labelRadius * Math.sin(angle) + 40;
        
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
              transform: [{ translateX: -45 }, { translateY: -22 }],
              width: 90, 
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.text, fontSize: 10, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }} numberOfLines={3}>
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

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Spacing.lg, paddingTop: 50, paddingBottom: 100 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  headerTitle: { color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold' },
  headerSubtitle: { color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' },
  semesterBtn: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  semesterBtnText: { color: colors.primary, fontSize: 12, fontFamily: 'Inter_700Bold' },
  
  radarContainer: { alignItems: 'center', marginBottom: 0, marginTop: -10 },
  chartContainer: { alignItems: 'center', justifyContent: 'center' },
  
  listContainer: { marginTop: Spacing.sm },
  listTitle: { color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold', marginBottom: Spacing.md },
  
  accordionCard: { backgroundColor: colors.surfaceHigh, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: colors.border },
  accordionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  accordionTitle: { color: colors.text, fontSize: 14, fontFamily: 'SpaceGrotesk_700Bold', flex: 1, paddingRight: 16 },
  accordionContent: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: Spacing.md, marginTop: Spacing.xs },
  markRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  markLabel: { color: colors.textMuted, fontSize: 13, fontFamily: 'Inter_500Medium' },
  markValue: { color: colors.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  sgpaBadge: { backgroundColor: '#3b82f620', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: '#3b82f640' },
  sgpaText: { color: '#3b82f6', fontSize: 14, fontFamily: 'SpaceGrotesk_700Bold' },
  resultCard: { backgroundColor: colors.surfaceHigh, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' },
  resultSubName: { color: colors.text, fontSize: 14, fontFamily: 'SpaceGrotesk_600SemiBold', marginBottom: 4 },
  resultSubCode: { color: colors.textMuted, fontSize: 12 },
  gradeBadge: { backgroundColor: '#22c55e20', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#22c55e' },
  gradeText: { color: '#22c55e', fontSize: 14, fontFamily: 'SpaceGrotesk_700Bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.xl, maxHeight: '60%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { color: colors.text, fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold' },
  modalOption: { paddingVertical: Spacing.md, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalOptionText: { color: '#d1d5db', fontSize: 15, fontFamily: 'Inter_500Medium' },
  modalOptionTextSelected: { color: colors.primary, fontFamily: 'Inter_700Bold' },
  sessionDot: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
