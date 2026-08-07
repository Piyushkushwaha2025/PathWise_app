import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { Typography, Spacing, Radius } from '../constants/theme';
import * as SecureStore from 'expo-secure-store';

interface FacilitiesModalProps {
  visible: boolean;
  type: 'hostel' | 'transport' | 'profile' | 'leave' | null;
  onClose: () => void;
}

export function FacilitiesModal({ visible, type, onClose }: FacilitiesModalProps) {
  const { colors } = useThemeStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [cookies, setCookies] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cookiesLoaded, setCookiesLoaded] = useState(false);
  const [leaveType, setLeaveType] = useState<'ml' | 'dl' | 'hostel' | null>(null);
  const webViewRef = useRef<WebView>(null);
  const dataCache = useRef<Record<string, any[]>>({});

  let targetUrl = '';
  if (type === 'hostel') targetUrl = 'https://student.culko.in/frmStudenHostelDetails.aspx';
  else if (type === 'transport') targetUrl = 'https://student.culko.in/frmTransportDetails.aspx';
  else if (type === 'profile') targetUrl = 'https://student.culko.in/frmStudentProfile.aspx';
  else if (type === 'leave') {
    if (leaveType === 'ml') targetUrl = 'https://student.culko.in/frmStudentMedicalLeaveApply.aspx';
    else if (leaveType === 'dl') targetUrl = 'https://student.culko.in/frmStudentApplyDutyLeave.aspx';
    else if (leaveType === 'hostel') targetUrl = 'https://student.culko.in/frmStudentHostelLeave.aspx';
  }

  useEffect(() => {
    if (visible && type) {
      if (type === 'leave' && leaveType === null) {
        setLeaveType('ml');
        return;
      }
      
      const cacheKey = type === 'leave' ? `leave_${leaveType}` : type;
      const hasCache = cacheKey && dataCache.current[cacheKey] !== undefined;
      
      if (hasCache) {
        setData(dataCache.current[cacheKey]);
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
        // Delay WebView creation until after modal slide animation (approx 350ms)
        setTimeout(() => setCookiesLoaded(true), 350);
      });
      
      const timer = setTimeout(() => {
        if (!hasCache) {
          setLoading(prev => {
            if (prev) setError('Network timeout. Please check your connection or login again.');
            return false;
          });
        }
      }, 15000); // 15s timeout
      
      return () => clearTimeout(timer);
    } else {
      setCookiesLoaded(false);
      setLeaveType(null); // Reset when closed
    }
  }, [visible, type, leaveType]);

  const INJECTED_JAVASCRIPT = `
    setTimeout(function() {
      try {
        var pageType = "${type}";
        var results = [];
        
        if (pageType === 'leave') {
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
                     
                     if (isGrid || (headers.length >= 2 && (headerStr.includes('status') || headerStr.includes('action') || headerStr.includes('category') || headerStr.includes('type') || headerStr.includes('date') || headerStr.includes('leave')))) {
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
                                 }
                                 if (Object.keys(rowData).length > 0) {
                                    results.push(rowData);
                                    parsedCount++;
                                 }
                             }
                          }
                          if (parsedCount > 0) break;
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
            data: results
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
      if (msg.type === 'DATA') {
        const hasData = msg.data && msg.data.length > 0;
        const cacheKey = type === 'leave' ? `leave_${leaveType}` : type;
        
        if (hasData) {
           const newDataStr = JSON.stringify(msg.data);
           const oldDataStr = JSON.stringify(cacheKey ? dataCache.current[cacheKey] : null);
           if (newDataStr !== oldDataStr) {
               setData(msg.data);
               if (cacheKey) dataCache.current[cacheKey] = msg.data;
           }
        } else if (type === 'leave') {
           const newDataStr = JSON.stringify([]);
           const oldDataStr = JSON.stringify(cacheKey ? dataCache.current[cacheKey] : null);
           if (newDataStr !== oldDataStr) {
               setData([]);
               if (cacheKey) dataCache.current[cacheKey] = [];
           }
        } else {
           if (!cacheKey || !dataCache.current[cacheKey]) {
              setError(type === 'hostel' ? 'No Hostel Allotted' : type === 'transport' ? 'No Transport Allotted' : 'No Profile Data');
           }
        }
        setLoading(false);
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
              {type === 'hostel' ? 'Hostel Details' : type === 'transport' ? 'Transport Details' : type === 'profile' ? 'Profile Details' : 'Leave History'}
            </Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.surfaceHigh }]}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          {type === 'leave' && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
              <TouchableOpacity 
                style={[styles.leaveOptionBtn, { flex: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 0, marginBottom: 0, backgroundColor: leaveType === 'ml' ? colors.primary : colors.surfaceHigh, borderColor: leaveType === 'ml' ? colors.primary : colors.border }]} 
                onPress={() => setLeaveType('ml')}
              >
                <Text style={[styles.leaveOptionText, { color: leaveType === 'ml' ? '#fff' : colors.textMuted }]}>ML</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.leaveOptionBtn, { flex: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 0, marginBottom: 0, backgroundColor: leaveType === 'dl' ? colors.primary : colors.surfaceHigh, borderColor: leaveType === 'dl' ? colors.primary : colors.border }]} 
                onPress={() => setLeaveType('dl')}
              >
                <Text style={[styles.leaveOptionText, { color: leaveType === 'dl' ? '#fff' : colors.textMuted }]}>DL</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.leaveOptionBtn, { flex: 1, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 0, marginBottom: 0, backgroundColor: leaveType === 'hostel' ? colors.primary : colors.surfaceHigh, borderColor: leaveType === 'hostel' ? colors.primary : colors.border }]} 
                onPress={() => setLeaveType('hostel')}
              >
                <Text style={[styles.leaveOptionText, { color: leaveType === 'hostel' ? '#fff' : colors.textMuted }]}>Hostel</Text>
              </TouchableOpacity>
            </View>
          )}

          {loading && (
                <View style={styles.centerContent}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.loadingText, { color: colors.textMuted }]}>Securely fetching {leaveType || type} info...</Text>
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
                    {type === 'leave' ? (
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
                             <Text style={[styles.leaveCardTitle, { color: colors.text, flex: 1, marginRight: 8 }]}>{item['Category'] || item['Leave_Type'] || item['Leave Type'] || 'Leave Application'}</Text>
                             {statusValue && (
                               <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                                 <Text style={[styles.statusText, { color: statusColor }]}>{statusValue}</Text>
                               </View>
                             )}
                           </View>
                           {Object.keys(item).map(k => {
                             if (k === 'Category' || k === 'Leave_Type' || k === 'Leave Type' || k === statusKey || !item[k]) return null;
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
                          <Text style={{ color: colors.textMuted }}>No leave records found.</Text>
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
    flexDirection: 'column',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  dataLabel: {
    ...Typography.label,
    fontSize: 13,
    marginBottom: 4,
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
  }
});
