import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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

function parseExamDateInfo(dateStr: string) {
  if (!dateStr || typeof dateStr !== 'string') {
    return { day: '--', month: 'EXAM', year: '', dayOfWeek: '', countdown: null };
  }
  const clean = dateStr.trim();
  const monthsShort = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  
  let parsedDate: Date | null = null;
  let day = '--';
  let month = 'EXAM';
  let year = '';
  let dayOfWeek = '';

  // 1. Match DD-MMM-YYYY or DD MMM YYYY or DD/MMM/YYYY (e.g. 15-OCT-2024, 05 Dec 2024)
  const namedMatch = clean.match(/^(\d{1,2})[-/\s]+([a-zA-Z]{3,})[-/\s]+(\d{2,4})/);
  if (namedMatch) {
    day = namedMatch[1].padStart(2, '0');
    month = namedMatch[2].substring(0, 3).toUpperCase();
    year = namedMatch[3].length === 2 ? `20${namedMatch[3]}` : namedMatch[3];
    const mIdx = monthsShort.indexOf(month);
    if (mIdx !== -1) {
      parsedDate = new Date(parseInt(year, 10), mIdx, parseInt(day, 10));
    }
  }

  // 2. Match DD/MM/YYYY or DD-MM-YYYY (e.g. 15/10/2024)
  if (!parsedDate) {
    const numMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (numMatch) {
      day = numMatch[1].padStart(2, '0');
      const mNum = parseInt(numMatch[2], 10);
      month = monthsShort[mNum - 1] || 'EXAM';
      year = numMatch[3].length === 2 ? `20${numMatch[3]}` : numMatch[3];
      parsedDate = new Date(parseInt(year, 10), mNum - 1, parseInt(day, 10));
    }
  }

  // 3. Match YYYY-MM-DD (e.g. 2024-10-15)
  if (!parsedDate) {
    const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
      year = isoMatch[1];
      const mNum = parseInt(isoMatch[2], 10);
      month = monthsShort[mNum - 1] || 'EXAM';
      day = isoMatch[3].padStart(2, '0');
      parsedDate = new Date(parseInt(year, 10), mNum - 1, parseInt(day, 10));
    }
  }

  // 4. Fallback standard Date parsing
  if (!parsedDate) {
    const ts = Date.parse(clean);
    if (!isNaN(ts)) {
      parsedDate = new Date(ts);
      day = String(parsedDate.getDate()).padStart(2, '0');
      month = monthsShort[parsedDate.getMonth()] || 'EXAM';
      year = String(parsedDate.getFullYear());
    }
  }

  let countdown: { text: string; color: string; isPast: boolean } | null = null;
  if (parsedDate && !isNaN(parsedDate.getTime())) {
    const daysOfWeek = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    dayOfWeek = daysOfWeek[parsedDate.getDay()];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(parsedDate);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      countdown = { text: 'TODAY', color: '#ef4444', isPast: false };
    } else if (diffDays === 1) {
      countdown = { text: 'TOMORROW', color: '#f59e0b', isPast: false };
    } else if (diffDays > 1 && diffDays <= 7) {
      countdown = { text: `In ${diffDays}d`, color: '#3b82f6', isPast: false };
    } else if (diffDays > 7) {
      countdown = { text: `In ${diffDays}d`, color: '#10b981', isPast: false };
    } else {
      countdown = { text: 'Completed', color: '#6b7280', isPast: true };
    }
  }

  return { day, month, year, dayOfWeek, countdown };
}

export function FacilitiesModal({ visible, type, onClose }: FacilitiesModalProps) {
  const { colors, theme } = useThemeStore();
  const isDark = theme === 'black' || theme === 'emerald';
  const { subjects } = useStudyOSStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [cookies, setCookies] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cookiesLoaded, setCookiesLoaded] = useState(false);
  const [subType, setSubType] = useState<'ml' | 'dl' | 'hostel' | 'details' | 'receipts' | 'theory' | 'practical' | null>(null);
  const [receiptViewerUrl, setReceiptViewerUrl] = useState<string | null>(null);
  const [datesheetOpts, setDatesheetOpts] = useState<{ label: string; value: string }[]>([]);
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
      
      // CRITICAL FIX: Strictly isolate caches. 'datesheet_practical' MUST NEVER fall back to 'datesheet_theory'!
      const cached = cacheKey ? (dataCache.current[cacheKey] || globalFacilityCache[cacheKey]) : null;
      const hasCache = !!(cached && Array.isArray(cached) && cached.length > 0);
      
      if (hasCache) {
        setData(cached);
        dataCache.current[cacheKey] = cached;
        if (type === 'datesheet') {
          const meta = globalDatesheetMeta[cacheKey];
          if (meta) {
            setDatesheetOpts(meta.opts || []);
            setDatesheetSelectId(meta.selectId || null);
            setSelectedDatesheetVal(meta.selectedVal || null);
          } else {
            setDatesheetOpts([]);
            setDatesheetSelectId(null);
            setSelectedDatesheetVal(null);
          }
        }
        setLoading(false);
        setError(null);
      } else {
        setLoading(true);
        setData([]);
        if (type === 'datesheet') {
          const meta = globalDatesheetMeta[cacheKey];
          if (meta) {
            setDatesheetOpts(meta.opts || []);
            setDatesheetSelectId(meta.selectId || null);
            setSelectedDatesheetVal(meta.selectedVal || null);
          } else {
            setDatesheetOpts([]);
            setDatesheetSelectId(null);
            setSelectedDatesheetVal(null);
          }
        }
        setError(null);
      }

      setCookiesLoaded(false);
      SecureStore.getItemAsync('culko_cookies').then((c) => {
        if (c) setCookies(c);
        setTimeout(() => setCookiesLoaded(true), 350);
      });
      
      const timer = setTimeout(() => {
        if (!hasCache) {
          setLoading((prev) => {
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

  const handleRefresh = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setLoading(true);
    setError(null);
    const effectiveSubType = (type === 'datesheet' && !subType) ? 'theory' : subType;
    const cacheKey = type ? ((type === 'leave' || type === 'fees' || type === 'datesheet') ? `${type}_${effectiveSubType}` : type) : '';
    if (cacheKey) {
      delete dataCache.current[cacheKey];
      delete globalFacilityCache[cacheKey];
    }
    setData([]);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

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
                     if (firstRowHasInput) continue; // Skip form inputs tables
                     
                     // Find the actual header row (check first 3 rows)
                     var headerRowIdx = -1;
                     var headers = [];
                     for(var hr=0; hr<Math.min(rows.length, 3); hr++) {
                        var ths = rows[hr].querySelectorAll('th, td');
                        var testHeaders = [];
                        for(var h=0; h<ths.length; h++) {
                           testHeaders.push(ths[h].innerText.trim());
                        }
                        var hStr = testHeaders.join(' ').toLowerCase();
                        if (hStr.includes('code') || hStr.includes('subject') || hStr.includes('course') || hStr.includes('date') || hStr.includes('paper') || hStr.includes('exam') || hStr.includes('receipt') || hStr.includes('leave') || hStr.includes('status') || hStr.includes('s.no') || hStr.includes('sno') || hStr.includes('head') || hStr.includes('amount') || hStr.includes('timing') || hStr.includes('venue') || hStr.includes('batch') || hStr.includes('group') || hStr.includes('lab')) {
                           headerRowIdx = hr;
                           headers = testHeaders;
                           break;
                        }
                     }

                     if (headerRowIdx === -1 && rows[0].querySelectorAll('th').length > 0) {
                        headerRowIdx = 0;
                        var ths = rows[0].querySelectorAll('th');
                        for(var h=0; h<ths.length; h++) headers.push(ths[h].innerText.trim());
                     }

                     if (headerRowIdx !== -1 && headers.length >= 2) {
                          for(var r=headerRowIdx + 1; r<rows.length; r++) {
                             var rowHasInput = rows[r].querySelectorAll(inputSelector).length > 0;
                             if (rowHasInput) continue;
                             
                             var tds = rows[r].querySelectorAll('td');
                             // Skip single-cell banner messages like "No records found"
                             if (tds.length <= 1 && (tds[0]?.innerText.toLowerCase().includes('no record') || tds[0]?.innerText.toLowerCase().includes('no data'))) {
                                continue;
                             }

                             if (tds.length === headers.length) {
                                 var rowData = {};
                                 for(var c=0; c<tds.length; c++) {
                                    var head = headers[c] || 'Column_' + c;
                                    if (head.toLowerCase().includes('file name')) continue;
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
                                 }
                             }
                          }
                     }
                 }
              }
                
              // Extract Datesheet Dropdown options for active page
              var datesheetOptions = [];
              var datesheetSelectId = null;
              if (pageType === 'datesheet') {
                  var selects = document.querySelectorAll('select');
                  for(var s=0; s<selects.length; s++) {
                      var sId = selects[s].id.toLowerCase();
                      var sName = (selects[s].name || '').toLowerCase();
                      if (sId.includes('date') || sId.includes('type') || sId.includes('exam') || sId.includes('sem') || sName.includes('date') || sName.includes('type')) {
                          datesheetSelectId = selects[s].id;
                          var opts = selects[s].options;
                          for (var o=0; o<opts.length; o++) {
                              if (opts[o].value && opts[o].text && !opts[o].text.includes('Select')) {
                                  datesheetOptions.push({ label: opts[o].text.trim(), value: opts[o].value.trim() });
                              }
                          }
                          if (datesheetOptions.length > 0) break;
                      }
                  }
              }
        } else {
            // Parse profile / hostel / transport key-value tables
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
               selectedVal: initialVal || null,
             };
           }
        } else if (type === 'datesheet') {
           setDatesheetOpts([]);
        }

        if (msg.datesheetSelectId) {
           setDatesheetSelectId(msg.datesheetSelectId);
        }
        
        const hasData = msg.data && Array.isArray(msg.data) && msg.data.length > 0;
        
        if (hasData) {
            setData(msg.data);
            if (cacheKey) {
              dataCache.current[cacheKey] = msg.data;
              globalFacilityCache[cacheKey] = msg.data;
            }
            if (type === 'datesheet') {
              globalFacilityCache[`datesheet_${effectiveSubType}`] = msg.data;
              if (effectiveSubType === 'theory') {
                globalFacilityCache['datesheet'] = msg.data;
                useStudyOSStore.getState().setScrapedData({ datesheet: msg.data });
              }
            }
        } else if (type === 'datesheet') {
            // Explicitly set empty list for practical or theory without falling back to each other!
            setData([]);
            if (cacheKey) {
              dataCache.current[cacheKey] = [];
              globalFacilityCache[cacheKey] = [];
            }
            if (effectiveSubType === 'theory') {
              globalFacilityCache['datesheet'] = [];
            }
        } else if (type === 'leave' || (type === 'fees' && subType === 'receipts')) {
            setData([]);
            if (cacheKey) {
              dataCache.current[cacheKey] = [];
              globalFacilityCache[cacheKey] = [];
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
        
        {/* Modal Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {type === 'datesheet' && (
              <View style={[styles.titleIconPod, { backgroundColor: '#f9731620' }]}>
                <Ionicons name="calendar-number" size={20} color="#f97316" />
              </View>
            )}
            <Text style={[styles.title, { color: colors.text }]}>
              {type === 'hostel' ? 'Hostel Details' : type === 'transport' ? 'Transport Details' : type === 'profile' ? 'Profile Details' : type === 'fees' ? 'Fee Details' : type === 'datesheet' ? 'Datesheet' : 'Leave History'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={handleRefresh} style={[styles.headerIconBtn, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
              <Ionicons name="refresh" size={19} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={[styles.headerIconBtn, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
          
        {/* Leave Sub-tabs */}
        {type === 'leave' && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
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

        {/* Fees Sub-tabs */}
        {type === 'fees' && (
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
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

        {/* Datesheet Segmented Tabs (Theory vs Practical) */}
        {type === 'datesheet' && (
          <View style={styles.datesheetTabContainer}>
            <TouchableOpacity 
              activeOpacity={0.75}
              style={[
                styles.datesheetTabBtn, 
                { 
                  backgroundColor: subType === 'theory' 
                    ? (isDark ? 'rgba(59, 130, 246, 0.18)' : '#eff6ff') 
                    : 'transparent',
                  borderColor: subType === 'theory' ? '#3b82f6' : 'transparent',
                }
              ]} 
              onPress={() => {
                if (subType !== 'theory') {
                  try { Haptics.selectionAsync(); } catch {}
                  setSubType('theory');
                }
              }}
            >
              <Ionicons 
                name="book-outline" 
                size={16} 
                color={subType === 'theory' ? '#3b82f6' : colors.textMuted} 
                style={{ marginRight: 6 }} 
              />
              <Text style={[
                styles.datesheetTabText, 
                { color: subType === 'theory' ? (isDark ? '#93c5fd' : '#1d4ed8') : colors.textMuted }
              ]}>
                Theory Exams
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={0.75}
              style={[
                styles.datesheetTabBtn, 
                { 
                  backgroundColor: subType === 'practical' 
                    ? (isDark ? 'rgba(168, 85, 247, 0.18)' : '#faf5ff') 
                    : 'transparent',
                  borderColor: subType === 'practical' ? '#a855f7' : 'transparent',
                }
              ]} 
              onPress={() => {
                if (subType !== 'practical') {
                  try { Haptics.selectionAsync(); } catch {}
                  setSubType('practical');
                }
              }}
            >
              <Ionicons 
                name="flask-outline" 
                size={16} 
                color={subType === 'practical' ? '#a855f7' : colors.textMuted} 
                style={{ marginRight: 6 }} 
              />
              <Text style={[
                styles.datesheetTabText, 
                { color: subType === 'practical' ? (isDark ? '#d8b4fe' : '#7e22ce') : colors.textMuted }
              ]}>
                Practical / Labs
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Dropdown Options (e.g. Regular / Re-appear) */}
        {type === 'datesheet' && datesheetOpts.length > 0 && (
          <View style={{ marginBottom: 14 }}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={{ gap: 8, paddingRight: Spacing.xl, alignItems: 'center' }}
            >
              {datesheetOpts.map((opt, i) => {
                const isSelected = selectedDatesheetVal === opt.value;
                return (
                  <TouchableOpacity 
                    key={i}
                    style={{
                      paddingVertical: 7, 
                      paddingHorizontal: 16, 
                      backgroundColor: isSelected ? colors.primary : colors.surfaceHigh, 
                      borderColor: isSelected ? colors.primary : colors.border, 
                      borderWidth: 1,
                      borderRadius: 20,
                    }} 
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch {}
                      setSelectedDatesheetVal(opt.value);
                      setLoading(true);
                      if (webViewRef.current && datesheetSelectId) {
                         webViewRef.current.injectJavaScript(`
                           var sel = document.getElementById('${datesheetSelectId}');
                           if(sel) {
                             sel.value = '${opt.value}';
                             sel.dispatchEvent(new Event('change'));
                             setTimeout(function(){ 
                               if (typeof __doPostBack === 'function') {
                                 __doPostBack('${datesheetSelectId.replace(/_/g, '$')}', ''); 
                               } else {
                                 var form = sel.form || document.forms[0];
                                 if (form) form.submit();
                               }
                             }, 100);
                           }
                           true;
                         `);
                      }
                    }}
                  >
                    <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: isSelected ? '#fff' : colors.textMuted }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Loading Indicator */}
        {loading && (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={subType === 'practical' ? '#a855f7' : colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Fetching {subType === 'practical' ? 'practical datesheet' : subType === 'theory' ? 'theory datesheet' : (subType || type)}...
            </Text>
          </View>
        )}

        {/* Error State */}
        {error && !loading && (
          <View style={styles.centerContent}>
            <Ionicons name="information-circle-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.errorText, { color: colors.textMuted }]}>{error}</Text>
            <TouchableOpacity 
              style={[styles.retryBtn, { backgroundColor: colors.primary, marginTop: 14 }]}
              onPress={handleRefresh}
            >
              <Ionicons name="refresh" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.retryBtnText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Data Content View */}
        {!loading && !error && (
          <ScrollView 
            style={styles.dataContainer} 
            contentContainerStyle={{ paddingBottom: Spacing.xl * 2 }} 
            showsVerticalScrollIndicator={false}
          >
              {type === 'datesheet' ? (
                data.length > 0 ? (
                  <>
                    <View style={styles.datesheetCountStrip}>
                      <Text style={[styles.datesheetCountText, { color: colors.textMuted }]}>
                        {data.length} {subType === 'practical' ? 'Practical Lab Examinations' : 'Theory Examinations Scheduled'}
                      </Text>
                    </View>

                    {data.map((item, index) => {
                      const courseCode =
                        item['Course Code'] || item['course code'] ||
                        item['Subject Code'] || item['subject code'] ||
                        item['Paper Code'] || item['paper code'] ||
                        item['Sub Code'] || item['Sub. Code'] ||
                        item['Code'] || item['code'] || '';

                      let courseName =
                        item['Course Name'] || item['course name'] ||
                        item['Subject Name'] || item['subject name'] ||
                        item['Paper Title'] || item['paper title'] ||
                        item['Paper Name'] || item['paper name'] ||
                        item['Sub Name'] || item['Sub. Name'] ||
                        item['Subject'] || item['subject'] ||
                        item['Name'] || item['name'] || '';

                      // Fallback from subjects store if courseName is blank
                      if (!courseName && courseCode && subjects) {
                        const matched = subjects.find(s => s.code.toLowerCase() === courseCode.toLowerCase());
                        if (matched?.name) courseName = matched.name;
                      }
                      if (!courseName) {
                        courseName = subType === 'practical' ? 'Practical Lab Examination' : 'Theory Examination';
                      }

                      const dateStr =
                        item['Exam Date'] || item['Exam_Date'] || item['Date'] || item['date'] ||
                        item['Practical Date'] || item['Practical_Date'] || item['Exam Date & Time'] || '';

                      const timeStr =
                        item['Exam Timing'] || item['Exam_Timing'] || item['Timing'] || item['timing'] ||
                        item['Time'] || item['time'] || item['Exam Time'] || item['Shift'] || item['Slot'] || '';

                      const venue =
                        item['Exam Venue'] || item['Exam_Venue'] || item['Venue'] || item['venue'] ||
                        item['Room'] || item['Room No'] || item['Lab'] || item['Lab No'] || item['Center'] || '';

                      const group =
                        item['Group'] || item['group'] || item['Batch'] || item['batch'] ||
                        item['Sub Group'] || item['SubGroup'] || item['Section'] || '';

                      const mode =
                        item['Mode OF Exam'] || item['Mode Of Exam'] || item['Mode'] || item['mode'] || '';

                      const semester =
                        item['Semester'] || item['semester'] || item['Sem'] || item['sem'] || '';

                      const selectedLabel = datesheetOpts.find((o) => o.value === selectedDatesheetVal)?.label;
                      const examTypeLabel =
                        selectedLabel ||
                        item['Autoconducttype'] || item['Type'] || item['type'] ||
                        (subType === 'practical' ? 'Practical' : 'Regular');

                      const parsed = parseExamDateInfo(dateStr);
                      const isPractical = subType === 'practical';

                      return (
                        <View 
                          key={index} 
                          style={[
                            styles.examCard, 
                            { 
                              backgroundColor: colors.surfaceHigh, 
                              borderColor: colors.border,
                            }
                          ]}
                        >
                          {/* Left Date Pod */}
                          <View 
                            style={[
                              styles.examCardLeft, 
                              { 
                                backgroundColor: isPractical 
                                  ? (isDark ? 'rgba(168, 85, 247, 0.12)' : 'rgba(168, 85, 247, 0.08)') 
                                  : (isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)'),
                                borderRightColor: colors.border,
                              }
                            ]}
                          >
                            {!!parsed.dayOfWeek && (
                              <Text style={[styles.examDayOfWeek, { color: isPractical ? '#a855f7' : colors.primary }]}>
                                {parsed.dayOfWeek}
                              </Text>
                            )}
                            <Text style={[styles.examDay, { color: colors.text }]}>{parsed.day}</Text>
                            <Text style={[styles.examMonth, { color: isPractical ? '#a855f7' : colors.primary }]}>
                              {parsed.month}
                            </Text>
                            {!!parsed.year && (
                              <Text style={[styles.examYear, { color: colors.textMuted }]}>{parsed.year}</Text>
                            )}
                          </View>

                          {/* Right Exam Details */}
                          <View style={styles.examCardRight}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                              <Text style={[styles.examCourseName, { color: colors.text }]} numberOfLines={2}>
                                {courseName}
                              </Text>
                              {parsed.countdown && (
                                <View style={[styles.countdownBadge, { backgroundColor: parsed.countdown.color + '18', borderColor: parsed.countdown.color + '40' }]}>
                                  <Text style={[styles.countdownText, { color: parsed.countdown.color }]}>
                                    {parsed.countdown.text}
                                  </Text>
                                </View>
                              )}
                            </View>
                            
                            {/* Tags Row */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                              {!!courseCode && (
                                <View style={[styles.codeBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                                  <Text style={[styles.codeBadgeText, { color: colors.text }]}>{courseCode}</Text>
                                </View>
                              )}
                              
                              <View style={[
                                styles.typeBadge, 
                                { 
                                  backgroundColor: isPractical ? '#a855f720' : colors.primary + '20',
                                  borderColor: isPractical ? '#a855f740' : colors.primary + '40',
                                }
                              ]}>
                                <Ionicons 
                                  name={isPractical ? 'flask-outline' : 'school-outline'} 
                                  size={11} 
                                  color={isPractical ? '#a855f7' : colors.primary} 
                                  style={{ marginRight: 3 }}
                                />
                                <Text style={[styles.typeBadgeText, { color: isPractical ? '#a855f7' : colors.primary }]}>
                                  {examTypeLabel}
                                </Text>
                              </View>

                              {!!group && (
                                <View style={[styles.groupBadge, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b40' }]}>
                                  <Ionicons name="people-outline" size={11} color="#f59e0b" style={{ marginRight: 3 }} />
                                  <Text style={[styles.groupBadgeText, { color: '#f59e0b' }]}>Batch: {group}</Text>
                                </View>
                              )}

                              {!!semester && (
                                <View style={[styles.groupBadge, { backgroundColor: '#06b6d420', borderColor: '#06b6d440' }]}>
                                  <Text style={[styles.groupBadgeText, { color: '#06b6d4' }]}>Sem {semester}</Text>
                                </View>
                              )}
                            </View>
                            
                            {/* Logistics Grid */}
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                              {!!timeStr && (
                                <View style={[styles.examDetailPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                                  <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                                  <Text style={[styles.examDetailText, { color: colors.textMuted }]}>{timeStr}</Text>
                                </View>
                              )}
                              {!!venue && (
                                <View style={[styles.examDetailPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                                  <Ionicons name={isPractical ? 'hardware-chip-outline' : 'location-outline'} size={13} color={colors.textMuted} />
                                  <Text style={[styles.examDetailText, { color: colors.textMuted }]}>{venue}</Text>
                                </View>
                              )}
                              {!!mode && (
                                <View style={[styles.examDetailPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                                  <Ionicons name="laptop-outline" size={13} color={colors.textMuted} />
                                  <Text style={[styles.examDetailText, { color: colors.textMuted }]}>{mode}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </>
                ) : (
                  /* Dedicated Empty State for Datesheet */
                  <View style={styles.datesheetEmptyContainer}>
                    <View style={[styles.datesheetEmptyIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                      <Ionicons 
                        name={subType === 'practical' ? 'flask-outline' : 'document-text-outline'} 
                        size={46} 
                        color={subType === 'practical' ? '#a855f7' : colors.primary} 
                      />
                    </View>
                    <Text style={[styles.datesheetEmptyTitle, { color: colors.text }]}>
                      {subType === 'practical' ? 'No Practical Exams Found' : 'No Theory Exams Found'}
                    </Text>
                    <Text style={[styles.datesheetEmptySub, { color: colors.textMuted }]}>
                      {subType === 'practical' 
                        ? 'Practical date sheet has not been scheduled or uploaded on the university portal yet.'
                        : 'Theory date sheet has not been announced for your course on the portal yet.'}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={[styles.retryBtn, { backgroundColor: subType === 'practical' ? '#a855f7' : colors.primary }]}
                      onPress={handleRefresh}
                    >
                      <Ionicons name="refresh" size={16} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.retryBtnText}>Re-check Portal</Text>
                    </TouchableOpacity>
                  </View>
                )
              ) : type === 'leave' || type === 'fees' ? (
                data.length > 0 ? data.map((item, index) => {
                   const statusKey = Object.keys(item).find((k) => k.toLowerCase().includes('status') || k.toLowerCase().includes('action') || k.toLowerCase().includes('approval'));
                   const statusValue = statusKey ? item[statusKey] : null;
                   const lowerStatus = statusValue?.toLowerCase() || '';
                   const isRejected = lowerStatus.includes('reject') || lowerStatus.includes('cancel') || lowerStatus.includes('declin') || lowerStatus.includes('disapprov') || lowerStatus.includes('not approv');
                   const isApproved = !isRejected && lowerStatus.includes('approv');
                   const statusColor = isApproved ? '#22c55e' : isRejected ? '#ef4444' : '#eab308';
                   const statusBg = isApproved ? '#22c55e20' : isRejected ? '#ef444420' : '#eab30820';
                    
                   return (
                   <View key={index} style={[styles.leaveCard, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
                     <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                       <Text style={[styles.leaveCardTitle, { color: colors.text, flex: 1, marginRight: 8 }]}>
                         {item['Category'] || item['Leave_Type'] || item['Leave Type'] || item['Receipt No'] || item['Receipt_No'] || item['Receipt No.'] || item['Fee Head'] || item['Fee_Head'] || item['Head'] || 'Record'}
                       </Text>
                       {statusValue && (
                         <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                           <Text style={[styles.statusText, { color: statusColor }]}>{statusValue}</Text>
                         </View>
                       )}
                     </View>
                     {Object.keys(item).map((k) => {
                       if (k.startsWith('_') || k.startsWith('Column_') || k.toLowerCase().includes('download') || k === 'Category' || k === 'Leave_Type' || k === 'Leave Type' || k === 'Receipt No' || k === 'Receipt_No' || k === 'Receipt No.' || k === 'Fee Head' || k === 'Fee_Head' || k === 'Head' || k === statusKey || !item[k]) return null;
                       return (
                         <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                           <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>{k.replace(/_/g, ' ')}</Text>
                           <Text style={{ color: colors.text, fontSize: 13, flex: 2, textAlign: 'right', fontFamily: 'Inter_500Medium' }}>{item[k]}</Text>
                         </View>
                       );
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
                    {data.filter((item) => item.value && item.value.trim() !== '' && item.label && item.label.toLowerCase() !== 'sno').map((item, index, filteredArray) => (
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

        {/* Hidden WebView Scraper Engine */}
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
              onLoadEnd={() => {
                // Ensure scraper executes after navigation/postback
                webViewRef.current?.injectJavaScript(INJECTED_JAVASCRIPT);
              }}
              onMessage={handleMessage}
              javaScriptEnabled={true}
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={true}
            />
          </View>
        )}

        {/* Receipt Document Viewer */}
        {receiptViewerUrl && (
          <Modal visible={true} animationType="slide" onRequestClose={() => setReceiptViewerUrl(null)}>
            <View style={{ flex: 1, backgroundColor: colors.background }}>
              <View style={[styles.header, { borderBottomColor: colors.border, padding: Spacing.xl, paddingTop: 60, marginBottom: 0 }]}>
                <Text style={[styles.title, { color: colors.text, fontSize: 18 }]}>Receipt Document</Text>
                <TouchableOpacity onPress={() => setReceiptViewerUrl(null)} style={[styles.headerIconBtn, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
                  <Ionicons name="close" size={22} color={colors.text} />
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
  modalContainer: {
    flex: 1,
    padding: Spacing.xl,
    paddingTop: 54,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    marginBottom: Spacing.md,
  },
  titleIconPod: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 21,
    letterSpacing: -0.3,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 240,
    paddingHorizontal: 20,
  },
  leaveCard: {
    padding: 16,
    borderRadius: 16,
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
    textAlign: 'center',
  },
  errorText: {
    ...Typography.body,
    marginTop: Spacing.md,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: Radius.full,
    marginTop: 12,
  },
  retryBtnText: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
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
  leaveOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  leaveOptionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },

  // Datesheet Segmented Tabs
  datesheetTabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(150, 150, 150, 0.08)',
    borderRadius: 14,
    padding: 4,
    gap: 6,
    marginBottom: 14,
  },
  datesheetTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
    borderWidth: 1,
  },
  datesheetTabText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
  },
  datesheetCountStrip: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  datesheetCountText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.3,
  },

  // Datesheet Exam Card
  examCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  examCardLeft: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    width: 78,
  },
  examDayOfWeek: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  examDay: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    lineHeight: 26,
  },
  examMonth: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11.5,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  examYear: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9.5,
    marginTop: 1,
  },
  examCardRight: {
    padding: 13,
    flex: 1,
    justifyContent: 'center',
  },
  examCourseName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14.5,
    flex: 1,
    lineHeight: 19,
  },
  countdownBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 7,
    borderWidth: 1,
  },
  countdownText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  codeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  codeBadgeText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
  },
  groupBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  examDetailPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  examDetailText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
  },

  // Datesheet Empty State
  datesheetEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  datesheetEmptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  datesheetEmptyTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 17,
    marginBottom: 8,
    textAlign: 'center',
  },
  datesheetEmptySub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: 280,
  },
});
