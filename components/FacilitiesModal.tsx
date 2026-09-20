import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { useStudyOSStore } from '../store/studyosStore';
import { Typography, Spacing, Radius } from '../constants/theme';
import * as SecureStore from 'expo-secure-store';

interface FacilitiesModalProps {
  visible: boolean;
  type: 'hostel' | 'transport' | 'profile' | 'leave' | 'fees' | 'datesheet' | null;
  onClose: () => void;
}

// Module-level persistent cache across modal open/closes
const globalFacilityCache: Record<string, any[]> = {};
const globalDatesheetMeta: Record<string, {
  opts: { label: string; value: string }[];
  selectId: string | null;
  selectedVal: string | null;
}> = {};

export function FacilitiesModal({ visible, type, onClose }: FacilitiesModalProps) {
  const { colors } = useThemeStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [cookies, setCookies] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cookiesLoaded, setCookiesLoaded] = useState(false);
  const [subType, setSubType] = useState<'ml' | 'dl' | 'hostel' | 'details' | 'receipts' | 'theory' | 'practical' | null>(null);
  const [receiptViewerUrl, setReceiptViewerUrl] = useState<string | null>(null);
  const [datesheetOpts, setDatesheetOpts] = useState<{label: string, value: string}[]>([]);
  const [datesheetSelectId, setDatesheetSelectId] = useState<string | null>(null);
  const [selectedDatesheetVal, setSelectedDatesheetVal] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);
  const dataCache = useRef<Record<string, any[]>>({});

  let targetUrl = '';
  if (type === 'hostel') targetUrl = 'https://student.culko.in/frmStudenHostelDetails.aspx';
  else if (type === 'transport') targetUrl = 'https://student.culko.in/frmTransportDetails.aspx';
  else if (type === 'profile') targetUrl = 'https://student.culko.in/frmStudentProfile.aspx';
  else if (type === 'leave') {
    if (subType === 'ml') targetUrl = 'https://student.culko.in/frmStudentMedicalLeaveApply.aspx';
    else if (subType === 'dl') targetUrl = 'https://student.culko.in/frmStudentApplyDutyLeave.aspx';
    else if (subType === 'hostel') targetUrl = 'https://student.culko.in/frmStudentHostelLeave.aspx';
  } else if (type === 'fees') {
    if (subType === 'details') targetUrl = 'https://student.culko.in/frmAccountStudentDetails.aspx';
    else if (subType === 'receipts') targetUrl = 'https://student.culko.in/frmAccountsStudentReceiptList.aspx';
  } else if (type === 'datesheet') {
    if (subType === 'practical') targetUrl = 'https://student.culko.in/frmStudentPracticleDateSheet.aspx';
    else targetUrl = 'https://student.culko.in/frmStudentDatesheet.aspx';
  }

  useEffect(() => {
    if (visible && type) {
      if (type === 'leave' && subType === null) {
        setSubType('ml');
        return;
      }
      if (type === 'fees' && subType === null) {
        setSubType('details');
        return;
      }
      if (type === 'datesheet' && subType === null) {
        setSubType('theory');
        return;
      }
      
      const effectiveSubType = (type === 'datesheet' && !subType) ? 'theory' : subType;
      const cacheKey = type ? ((type === 'leave' || type === 'fees' || type === 'datesheet') ? `${type}_${effectiveSubType}` : type) : '';
      
      const cached = cacheKey ? (dataCache.current[cacheKey] || globalFacilityCache[cacheKey] || (type === 'datesheet' ? (globalFacilityCache['datesheet_theory'] || globalFacilityCache['datesheet']) : null)) : null;
      const hasCache = !!(cached && cached.length > 0);
      
      if (hasCache) {
        setData(cached);
        dataCache.current[cacheKey] = cached;
        if (type === 'datesheet') {
          const meta = globalDatesheetMeta[cacheKey] || globalDatesheetMeta['datesheet_theory'] || globalDatesheetMeta['datesheet'];
          if (meta) {
            if (meta.opts && meta.opts.length > 0) setDatesheetOpts(meta.opts);
            if (meta.selectId) setDatesheetSelectId(meta.selectId);
            if (meta.selectedVal) setSelectedDatesheetVal(meta.selectedVal);
          }
        }
        setLoading(false);
        setError(null);
      } else {
        setLoading(true);
        setData([]);
        setError(null);
      }

      setCookiesLoaded(false);
      SecureStore.getItemAsync('culko_cookies').then(c => {
        if (c) setCookies(c);
        setTimeout(() => setCookiesLoaded(true), 350);
      });
      
      const timer = setTimeout(() => {
        if (!hasCache) {
          setLoading(prev => {
            if (prev) setError('Network timeout. Please check your connection or login again.');
            return false;
          });
        }
      }, 15000);
      
      return () => clearTimeout(timer);
    } else {
      setCookiesLoaded(false);
      setSubType(null);
    }
  }, [visible, type, subType]);

  const INJECTED_JAVASCRIPT = `
    window.open = function(url) {
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'OPEN_URL', url: url }));
        }
        return null;
    };
    
    setTimeout(function() {
      try {
        var pageType = "${type}";
        var subPageType = "${subType}";
        var results = [];
        
        if (pageType === 'leave' || pageType === 'fees' || pageType === 'datesheet') {
              var tables = document.querySelectorAll('table');
              for(var i=0; i<tables.length; i++) {
                 var rows = tables[i].querySelectorAll('tr');
                 if (rows.length > 1) {
                     var inputSelector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]), select, textarea';
                     var firstRowHasInput = rows[0].querySelectorAll(inputSelector).length > 0;
                     if (firstRowHasInput) continue; // Skip form tables
                     
                     var headers = [];
                     var ths = rows[0].querySelectorAll('th, td');
                     for(var h=0; h<ths.length; h++) {
                        headers.push(ths[h].innerText.trim());
                     }
                     
                     var headerStr = headers.join(' ').toLowerCase();
                     var hasTh = rows[0].querySelectorAll('th').length > 0;
                     var isGrid = tables[i].id.toLowerCase().includes('grid') || tables[i].className.toLowerCase().includes('grid') || tables[i].getAttribute('rules') === 'all' || hasTh;
                     
                     var isValidGrid = isGrid || (headers.length >= 2 && (headerStr.includes('status') || headerStr.includes('action') || headerStr.includes('category') || headerStr.includes('type') || headerStr.includes('date') || headerStr.includes('leave') || headerStr.includes('amount') || headerStr.includes('fee') || headerStr.includes('balance') || headerStr.includes('receipt')));
                     
                     if (isValidGrid) {
                          var parsedCount = 0;
                          for(var r=1; r<rows.length; r++) {
                             var rowHasInput = rows[r].querySelectorAll(inputSelector).length > 0;
                             if (rowHasInput) continue;
                             
                             var tds = rows[r].querySelectorAll('td');
                             if (tds.length === headers.length) {
                                 var rowData = {};
                                 for(var c=0; c<tds.length; c++) {
                                    var head = headers[c] || 'Column_' + c;
                                     if (head.toLowerCase().includes('file name')) continue; // Ignore file name
                                     var val = tds[c].innerText.trim();
                                     if (val) rowData[head] = val;
                                     
                                     var actionEl = tds[c].querySelector('a, input[type="button"], input[type="image"], input[type="submit"]');
                                     if (actionEl && !actionEl.id.toLowerCase().includes('sort')) {
                                         if (actionEl.getAttribute('href') && actionEl.getAttribute('href').includes('javascript:')) {
                                             rowData['_downloadScript'] = actionEl.getAttribute('href');
                                         } else if (actionEl.getAttribute('onclick')) {
                                             rowData['_downloadScript'] = actionEl.getAttribute('onclick');
                                         } else if (actionEl.tagName === 'A' && actionEl.getAttribute('href')) {
                                             rowData['_downloadUrl'] = actionEl.getAttribute('href');
                                         }
                                     }
                                  }
                                  if (Object.keys(rowData).length > 0) {
                                    results.push(rowData);
                                    parsedCount++;
                                 }
                             }
                          }
                          // Do not break; allow extracting multiple grid sections
                     }
                 }
              }
               
               // Extract Datesheet Dropdown options
               var datesheetOptions = [];
               var datesheetSelectId = null;
               if (pageType === 'datesheet') {
                   var selects = document.querySelectorAll('select');
                   for(var s=0; s<selects.length; s++) {
                       if (selects[s].id.toLowerCase().includes('date') || selects[s].id.toLowerCase().includes('type')) {
                           datesheetSelectId = selects[s].id;
                           var opts = selects[s].options;
                           for (var o=0; o<opts.length; o++) {
                               if (opts[o].value && opts[o].text && !opts[o].text.includes('Select')) {
                                   datesheetOptions.push({ label: opts[o].text, value: opts[o].value });
                               }
                           }
                           break;
                       }
                   }
               }
        } else {
            // 1. Parse tables
            var tables = document.querySelectorAll('table');
            for (var t = 0; t < tables.length; t++) {
              var rows = tables[t].querySelectorAll('tr');
              for (var r = 0; r < rows.length; r++) {
                var row = rows[r];
                var ths = row.querySelectorAll('th');
                var tds = row.querySelectorAll('td');
                
                if (ths.length > 0 && tds.length > 0 && ths.length === tds.length) {
                  for (var i = 0; i < ths.length; i++) {
                    var label = ths[i].innerText ? ths[i].innerText.trim().replace(/:$/, '') : '';
                    var val = tds[i].innerText ? tds[i].innerText.trim() : '';
                    if (label && val) results.push({ label: label, value: val });
                  }
                }
                else if (tds.length === 2) {
                   var label = tds[0].innerText ? tds[0].innerText.trim().replace(/:$/, '') : '';
                   var val = tds[1].innerText ? tds[1].innerText.trim() : '';
                   if (label && val && label.length < 30) {
                     results.push({ label: label, value: val });
                   }
                }
                else if (tds.length === 4) {
                   var l1 = tds[0].innerText ? tds[0].innerText.trim().replace(/:$/, '') : '';
                   var v1 = tds[1].innerText ? tds[1].innerText.trim() : '';
                   var l2 = tds[2].innerText ? tds[2].innerText.trim().replace(/:$/, '') : '';
                   var v2 = tds[3].innerText ? tds[3].innerText.trim() : '';
                   if (l1 && v1 && l1.length < 30) results.push({ label: l1, value: v1 });
                   if (l2 && v2 && l2.length < 30) results.push({ label: l2, value: v2 });
                }
              }
            }

            // 2. Parse inputs/spans
            if (results.length < 3) {
               var elems = document.querySelectorAll('span, input[type="text"]');
               for (var i = 0; i < elems.length; i++) {
                 var el = elems[i];
                 var text = (el.tagName === 'INPUT') ? el.value : el.innerText;
                 text = text ? text.trim() : '';
                 if (text && el.id && (el.id.includes('lbl') || el.id.includes('txt'))) {
                   var idParts = el.id.split('_');
                   var name = idParts[idParts.length - 1].replace('lbl', '').replace('txt', '');
                   var exists = false;
                   for (var j=0; j<results.length; j++) { if(results[j].label === name) exists = true; }
                   if (!exists && text.length > 0) {
                     results.push({ label: name, value: text });
                   }
                 }
               }
            }
        }
        
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DATA',
            data: results,
            datesheetOptions: typeof datesheetOptions !== 'undefined' ? datesheetOptions : [],
            datesheetSelectId: typeof datesheetSelectId !== 'undefined' ? datesheetSelectId : null
          }));
        }
      } catch (e) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ERROR',
            message: e.toString()
          }));
        }
      }
    }, 1000);
    true;
  `;

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SESSION_EXPIRED') {
        setError('Session expired. Please reconnect in StudyOS.');
        setLoading(false);
        return;
      }
      if (msg.type === 'DATA') {
        const effectiveSubType = (type === 'datesheet' && !subType) ? 'theory' : subType;
        const cacheKey = type ? ((type === 'leave' || type === 'fees' || type === 'datesheet') ? `${type}_${effectiveSubType}` : type) : '';

        if (msg.datesheetOptions && msg.datesheetOptions.length > 0) {
           setDatesheetOpts(msg.datesheetOptions);
           const initialVal = selectedDatesheetVal || msg.datesheetOptions[0]?.value;
           if (!selectedDatesheetVal && msg.datesheetOptions[0]) {
             setSelectedDatesheetVal(msg.datesheetOptions[0].value);
           }
           if (cacheKey) {
             globalDatesheetMeta[cacheKey] = {
               opts: msg.datesheetOptions,
               selectId: msg.datesheetSelectId || datesheetSelectId,
               selectedVal: initialVal || null
             };
           }
        }
        if (msg.datesheetSelectId) {
           setDatesheetSelectId(msg.datesheetSelectId);
        }
        
        const hasData = msg.data && msg.data.length > 0;
        
        if (hasData) {
            setData(msg.data);
            if (cacheKey) {
              dataCache.current[cacheKey] = msg.data;
              globalFacilityCache[cacheKey] = msg.data;
            }
            if (type === 'datesheet') {
              globalFacilityCache['datesheet'] = msg.data;
              globalFacilityCache[`datesheet_${subType || 'theory'}`] = msg.data;
              useStudyOSStore.getState().setScrapedData({ datesheet: msg.data });
            }
        } else if (type === 'leave' || (type === 'fees' && subType === 'receipts')) {
            setData([]);
            if (cacheKey) {
              dataCache.current[cacheKey] = [];
              globalFacilityCache[cacheKey] = [];
            }
        } else if (type === 'datesheet' && (!msg.data || msg.data.length === 0)) {
            // NEVER wipe cached datesheet data if we already have it!
            const existing = (cacheKey ? dataCache.current[cacheKey] : null) || (cacheKey ? globalFacilityCache[cacheKey] : null) || globalFacilityCache['datesheet'];
            if (!existing || existing.length === 0) {
              setData([]);
            }
        } else {
            const existing = cacheKey ? (dataCache.current[cacheKey] || globalFacilityCache[cacheKey]) : null;
            if (!existing || existing.length === 0) {
               setError(type === 'hostel' ? 'No Hostel Allotted' : type === 'transport' ? 'No Transport Allotted' : type === 'fees' ? 'No Fee Details Found' : 'No Profile Data');
            }
        }
        setLoading(false);
      } else if (msg.type === 'OPEN_URL') {
         let fullUrl = msg.url;
         if (fullUrl && !fullUrl.startsWith('http')) {
             fullUrl = 'https://student.culko.in/' + fullUrl.replace(/^\/+/, '');
         }
         setReceiptViewerUrl(fullUrl);
      } else if (msg.type === 'ERROR') {
        setError('Failed to extract data.');
        setLoading(false);
      }
    } catch (e) {
      setError('Invalid response from server.');
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>
              {type === 'hostel' ? 'Hostel Details' : type === 'transport' ? 'Transport Details' : type === 'profile' ? 'Profile Details' : type === 'fees' ? 'Fee Details' : type === 'datesheet' ? 'Datesheet' : 'Leave History'}
            </Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.surfaceHigh }]}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          {type === 'leave' && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
              <TouchableOpacity 
                style={[styles.leaveOptionBtn, { flex: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 0, marginBottom: 0, backgroundColor: subType === 'ml' ? colors.primary : colors.surfaceHigh, borderColor: subType === 'ml' ? colors.primary : colors.border }]} 
                onPress={() => setSubType('ml')}
              >
                <Text style={[styles.leaveOptionText, { color: subType === 'ml' ? '#fff' : colors.textMuted }]}>ML</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.leaveOptionBtn, { flex: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 0, marginBottom: 0, backgroundColor: subType === 'dl' ? colors.primary : colors.surfaceHigh, borderColor: subType === 'dl' ? colors.primary : colors.border }]} 
                onPress={() => setSubType('dl')}
              >
                <Text style={[styles.leaveOptionText, { color: subType === 'dl' ? '#fff' : colors.textMuted }]}>DL</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.leaveOptionBtn, { flex: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 0, marginBottom: 0, backgroundColor: subType === 'hostel' ? colors.primary : colors.surfaceHigh, borderColor: subType === 'hostel' ? colors.primary : colors.border }]} 
                onPress={() => setSubType('hostel')}
              >
                <Text style={[styles.leaveOptionText, { color: subType === 'hostel' ? '#fff' : colors.textMuted }]}>Hostel</Text>
              </TouchableOpacity>
            </View>
          )}

          {type === 'fees' && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
              <TouchableOpacity 
                style={[styles.leaveOptionBtn, { flex: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 0, marginBottom: 0, backgroundColor: subType === 'details' ? colors.primary : colors.surfaceHigh, borderColor: subType === 'details' ? colors.primary : colors.border }]} 
                onPress={() => setSubType('details')}
              >
                <Text style={[styles.leaveOptionText, { color: subType === 'details' ? '#fff' : colors.textMuted }]}>Account Details</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.leaveOptionBtn, { flex: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 0, marginBottom: 0, backgroundColor: subType === 'receipts' ? colors.primary : colors.surfaceHigh, borderColor: subType === 'receipts' ? colors.primary : colors.border }]} 
                onPress={() => setSubType('receipts')}
              >
                <Text style={[styles.leaveOptionText, { color: subType === 'receipts' ? '#fff' : colors.textMuted }]}>Receipts</Text>
              </TouchableOpacity>
            </View>
          )}

          {type === 'datesheet' && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: datesheetOpts.length > 0 ? 12 : 24 }}>
              <TouchableOpacity 
                style={[styles.leaveOptionBtn, { flex: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 0, marginBottom: 0, backgroundColor: subType === 'theory' ? colors.primary : colors.surfaceHigh, borderColor: subType === 'theory' ? colors.primary : colors.border }]} 
                onPress={() => setSubType('theory')}
              >
                <Text style={[styles.leaveOptionText, { color: subType === 'theory' ? '#fff' : colors.textMuted }]}>Theory</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.leaveOptionBtn, { flex: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 0, marginBottom: 0, backgroundColor: subType === 'practical' ? colors.primary : colors.surfaceHigh, borderColor: subType === 'practical' ? colors.primary : colors.border }]} 
                onPress={() => setSubType('practical')}
              >
                <Text style={[styles.leaveOptionText, { color: subType === 'practical' ? '#fff' : colors.textMuted }]}>Practical</Text>
              </TouchableOpacity>
            </View>
          )}

          {type === 'datesheet' && subType === 'theory' && datesheetOpts.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: Spacing.xl, alignItems: 'center' }}>
                {datesheetOpts.map((opt, i) => (
                  <TouchableOpacity 
                    key={i}
                    style={{
                      paddingVertical: 6, 
                      paddingHorizontal: 16, 
                      backgroundColor: selectedDatesheetVal === opt.value ? colors.primary : colors.surfaceHigh, 
                      borderColor: selectedDatesheetVal === opt.value ? colors.primary : colors.border, 
                      borderWidth: 1,
                      borderRadius: 20,
                    }} 
                    onPress={() => {
                      setSelectedDatesheetVal(opt.value);
                      setLoading(true);
                      if (webViewRef.current && datesheetSelectId) {
                         webViewRef.current.injectJavaScript(`
                           var sel = document.getElementById('${datesheetSelectId}');
                           if(sel) {
                             sel.value = '${opt.value}';
                             sel.dispatchEvent(new Event('change'));
                             setTimeout(function(){ __doPostBack('${datesheetSelectId.replace(/_/g, '$')}', ''); }, 100);
                           }
                           true;
                         `);
                      }
                    }}
                  >
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: selectedDatesheetVal === opt.value ? '#fff' : colors.textMuted }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {loading && (
                <View style={styles.centerContent}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.loadingText, { color: colors.textMuted }]}>Securely fetching {subType || type} info...</Text>
                </View>
              )}

              {error && (
                <View style={styles.centerContent}>
                  <Ionicons name="information-circle-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
                </View>
              )}

              {!loading && !error && (
                <ScrollView style={styles.dataContainer} contentContainerStyle={{ paddingBottom: Spacing.xl }} showsVerticalScrollIndicator={false}>
                    {type === 'datesheet' ? (
                      data.length > 0 ? data.map((item, index) => {
                        const courseCode = item['course code'] || item['Course Code'] || '';
                        const courseName = item['Course Name'] || item['course name'] || 'Exam';
                        const selectedLabel = datesheetOpts.find(o => o.value === selectedDatesheetVal)?.label || item['Autoconducttype'] || item['Type'] || (subType === 'practical' ? 'Practical' : 'Exam');
                        const typeVal = selectedLabel;
                        const dateStr = item['Exam Date'] || item['Exam_Date'] || item['Date'] || '';
                        const timeStr = item['Exam Timing'] || item['Exam_Timing'] || '';
                        const venue = item['Exam Venue'] || item['Exam_Venue'] || '';
                        const mode = item['Mode OF Exam'] || item['Mode Of Exam'] || item['Mode'] || '';

                        const dParts = dateStr.split(' ');
                        const day = dParts[0] || '';
                        const month = dParts[1] ? dParts[1].toUpperCase() : '';
                        
                        return (
                          <View key={index} style={[styles.examCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
                            <View style={styles.examCardLeft}>
                              <Text style={[styles.examMonth, { color: colors.primary }]}>{month}</Text>
                              <Text style={[styles.examDay, { color: colors.text }]}>{day}</Text>
                            </View>
                            <View style={styles.examCardRight}>
                              <Text style={[styles.examCourseName, { color: colors.text, marginBottom: 4 }]} numberOfLines={2}>{courseName}</Text>
                              
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                <Text style={[styles.examCourseCode, { color: colors.textMuted }]}>{courseCode}</Text>
                                {typeVal ? (
                                  <View style={[styles.statusBadge, { backgroundColor: colors.primary + '20', marginLeft: 8, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 }]}>
                                    <Text style={[styles.statusText, { color: colors.primary, fontSize: 10 }]}>{typeVal}</Text>
                                  </View>
                                ) : null}
                              </View>
                              
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                                {timeStr ? (
                                  <View style={styles.examDetail}>
                                    <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                                    <Text style={[styles.examDetailText, { color: colors.textMuted }]}>{timeStr}</Text>
                                  </View>
                                ) : null}
                                {venue ? (
                                  <View style={styles.examDetail}>
                                    <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                                    <Text style={[styles.examDetailText, { color: colors.textMuted }]}>{venue}</Text>
                                  </View>
                                ) : null}
                                {mode ? (
                                  <View style={styles.examDetail}>
                                    <Ionicons name="laptop-outline" size={14} color={colors.textMuted} />
                                    <Text style={[styles.examDetailText, { color: colors.textMuted }]}>{mode}</Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </View>
                        );
                      }) : (
                        <View style={styles.centerContent}>
                           <Text style={{ color: colors.textMuted }}>No exams found in datesheet.</Text>
                        </View>
                      )
                    ) : type === 'leave' || type === 'fees' ? (
                      data.length > 0 ? data.map((item, index) => {
                         const statusKey = Object.keys(item).find(k => k.toLowerCase().includes('status') || k.toLowerCase().includes('action') || k.toLowerCase().includes('approval'));
                         const statusValue = statusKey ? item[statusKey] : null;
                         const lowerStatus = statusValue?.toLowerCase() || '';
                         const isRejected = lowerStatus.includes('reject') || lowerStatus.includes('cancel') || lowerStatus.includes('declin') || lowerStatus.includes('disapprov') || lowerStatus.includes('not approv');
                         const isApproved = !isRejected && lowerStatus.includes('approv');
                         const statusColor = isApproved ? '#22c55e' : isRejected ? '#ef4444' : '#eab308';
                         const statusBg = isApproved ? '#22c55e20' : isRejected ? '#ef444420' : '#eab30820';
                         
                         return (
                         <View key={index} style={[styles.leaveCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
                           <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                             <Text style={[styles.leaveCardTitle, { color: colors.text, flex: 1, marginRight: 8 }]}>{item['Category'] || item['Leave_Type'] || item['Leave Type'] || item['Receipt No'] || item['Receipt_No'] || item['Receipt No.'] || item['Fee Head'] || item['Fee_Head'] || item['Head'] || 'Record'}</Text>
                             {statusValue && (
                               <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                                 <Text style={[styles.statusText, { color: statusColor }]}>{statusValue}</Text>
                               </View>
                             )}
                           </View>
                           {Object.keys(item).map(k => {
                             if (k.startsWith('_') || k.startsWith('Column_') || k.toLowerCase().includes('download') || k === 'Category' || k === 'Leave_Type' || k === 'Leave Type' || k === 'Receipt No' || k === 'Receipt_No' || k === 'Receipt No.' || k === 'Fee Head' || k === 'Fee_Head' || k === 'Head' || k === statusKey || !item[k]) return null;
                             return (
                               <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                 <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{k.replace(/_/g, ' ')}</Text>
                                 <Text style={{ color: colors.text, fontSize: 13, flex: 2, textAlign: 'right', fontFamily: 'Inter_500Medium' }}>{item[k]}</Text>
                               </View>
                             )
                           })}
                         </View>
                         );
                       }) : (
                       <View style={styles.centerContent}>
                          <Text style={{ color: colors.textMuted }}>No records found.</Text>
                       </View>
                     )
                  ) : (
                      data.length > 0 ? (
                        <View style={[styles.leaveCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
                          {data.filter(item => item.value && item.value.trim() !== '' && item.label && item.label.toLowerCase() !== 'sno').map((item, index, filteredArray) => (
                            <View key={index} style={[styles.dataRow, { borderBottomColor: index === filteredArray.length - 1 ? 'transparent' : colors.border }]}>
                              <Text style={[styles.dataLabel, { color: colors.textMuted }]}>{item.label?.replace(/([A-Z])/g, ' $1').trim()}</Text>
                              <Text style={[styles.dataValue, { color: colors.text }]}>{item.value}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null
                    )}
                </ScrollView>
              )}

              {cookiesLoaded && targetUrl !== '' && (
                <View style={{ height: 0, width: 0, opacity: 0 }}>
                  <WebView
                    ref={webViewRef}
                    key={`${targetUrl}_${subType || 'default'}`}
                    source={{ 
                      uri: targetUrl,
                      headers: { Cookie: cookies }
                    }}
                    injectedJavaScript={INJECTED_JAVASCRIPT}
                    onMessage={handleMessage}
                    javaScriptEnabled={true}
                    sharedCookiesEnabled={true}
                    thirdPartyCookiesEnabled={true}
                  />
                </View>
              )}

              {receiptViewerUrl && (
                <Modal visible={true} animationType="slide" onRequestClose={() => setReceiptViewerUrl(null)}>
                  <View style={{ flex: 1, backgroundColor: colors.background }}>
                    <View style={[styles.header, { borderBottomColor: colors.border, padding: Spacing.xl, paddingTop: 60, marginBottom: 0 }]}>
                      <Text style={[styles.title, { color: colors.text, fontSize: 18 }]}>Receipt Document</Text>
                      <TouchableOpacity onPress={() => setReceiptViewerUrl(null)} style={[styles.closeButton, { backgroundColor: colors.surfaceHigh }]}>
                        <Ionicons name="close" size={24} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                    <WebView
                      source={{ uri: receiptViewerUrl, headers: { Cookie: cookies } }}
                      sharedCookiesEnabled={true}
                      thirdPartyCookiesEnabled={true}
                      javaScriptEnabled={true}
                      scalesPageToFit={true}
                    />
                  </View>
                </Modal>
              )}
        </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    padding: Spacing.xl,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.xl,
    borderBottomWidth: 1,
    marginBottom: Spacing.xl,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#374151', // Fallback, overridden by surfaceHigh/border
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  leaveCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  leaveCardTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  loadingText: {
    ...Typography.body,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.body,
    marginTop: Spacing.md,
    fontSize: 16,
    textAlign: 'center',
  },
  dataContainer: {
    flex: 1,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  dataLabel: {
    ...Typography.label,
    fontSize: 13,
    flex: 1,
    marginRight: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dataValue: {
    ...Typography.body,
    flex: 2,
    textAlign: 'right',
  },
  leaveOptionsContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  leavePrompt: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  leaveOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  leaveOptionIcon: {
    marginRight: Spacing.md,
  },
  leaveOptionText: {
    ...Typography.body,
    fontFamily: 'Inter_600SemiBold',
  },
  examCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  examCardLeft: {
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(150,150,150,0.2)',
    width: 80,
  },
  examMonth: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    marginBottom: 4,
  },
  examDay: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 24,
  },
  examCardRight: {
    padding: 16,
    flex: 1,
  },
  examCourseName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    flex: 1,
    lineHeight: 20,
  },
  examCourseCode: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  examDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  examDetailText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  }
});
