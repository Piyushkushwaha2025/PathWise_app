const fs = require('fs');
const file = 'd:/AI/PathWise_Versions/v1.0.3/components/FacilitiesModal.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');
let start = lines.findIndex(l => l.includes('data.length > 0 ? data.map((item, index) => ('));
let end = lines.findIndex((l, i) => i > start && l.includes(')) : ('));
if (start !== -1 && end !== -1) {
    let replacement =                      data.length > 0 ? data.map((item, index) => {
                         const statusKey = Object.keys(item).find(k => k.toLowerCase().includes('status') || k.toLowerCase().includes('action') || k.toLowerCase().includes('approval'));
                         const statusValue = statusKey ? item[statusKey] : null;
                         const isApproved = statusValue?.toLowerCase().includes('approv');
                         const isRejected = statusValue?.toLowerCase().includes('reject') || statusValue?.toLowerCase().includes('cancel');
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
                       }) : (.split('\n');
    lines.splice(start, end - start + 1, ...replacement);
    fs.writeFileSync(file, lines.join('\n'));
    console.log('Success');
} else {
    console.log('Failed to find lines');
}
