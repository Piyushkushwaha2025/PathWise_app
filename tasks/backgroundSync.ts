import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { setupAndroidChannels } from '../lib/notifications';

const BACKGROUND_SYNC_TASK = 'BACKGROUND_SYNC_TASK';

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    await setupAndroidChannels().catch(() => {});

    let cookies: string | null = null;
    try {
      cookies = await SecureStore.getItemAsync('culko_cookies');
    } catch (_) {}
    if (!cookies) {
      try {
        cookies = await AsyncStorage.getItem('culko_cookies');
      } catch (_) {}
    }
    if (!cookies) return BackgroundFetch.BackgroundFetchResult.NoData;

    const rawOldData = await AsyncStorage.getItem('studyos_scraped_data');
    if (!rawOldData) return BackgroundFetch.BackgroundFetchResult.NoData;

    const oldData = JSON.parse(rawOldData);
    let notificationsSent = 0;
    
    // 1. Fetch Attendance
    try {
      const attRes = await fetch('https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx?type=etgkYfqBdH1fSfc255iYGw==', {
        headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0' }
      });
      const attHtml = await attRes.text();
      
      if (attHtml && !attHtml.includes('login') && oldData.subjects) {
        let updatedSubjects = [...oldData.subjects];
        let hasAttChanges = false;
        
        // Parse table rows
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
        let rowMatch;
        while ((rowMatch = rowRegex.exec(attHtml)) !== null) {
          const rowHtml = rowMatch[1];
          const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
          let cells = [];
          let cellMatch;
          while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
            let text = cellMatch[1].replace(/<[^>]*>/g, '').trim();
            cells.push(text);
          }
          
          if (cells.length >= 4) {
            let code: string | null = null;
            for (let x = 0; x < cells.length; x++) {
              if (/^[0-9A-Z]{2,8}[-_]?[0-9]{3}/.test(cells[x])) {
                code = cells[x];
                break;
              }
            }

            let numArr: number[] = [];
            let explicitPerc: number | null = null;
            for (let j = 0; j < cells.length; j++) {
              const rawVal = cells[j].trim();
              if (rawVal.includes('%')) explicitPerc = Number(rawVal.replace('%', '').trim());
              const clean = rawVal.replace('%', '').trim();
              if (clean !== '' && !isNaN(Number(clean))) numArr.push(Number(clean));
            }

            let total = 0, attended = 0, percentage = 0;
            if (numArr.length >= 2) {
              percentage = (explicitPerc !== null && !isNaN(explicitPerc)) ? explicitPerc : numArr[numArr.length - 1];
              let bestMatch: { attended: number; total: number } | null = null;
              let bestDiff = 999;

              if (percentage > 0) {
                for (let p1 = 0; p1 < numArr.length; p1++) {
                  for (let p2 = 0; p2 < numArr.length; p2++) {
                    const A = numArr[p1], B = numArr[p2];
                    if (B > 0 && A <= B && B <= 500 && A !== percentage && B !== percentage) {
                      const calc = (A / B) * 100;
                      const diff = Math.abs(calc - percentage);
                      if (diff <= 1.5) {
                        if (diff < bestDiff - 0.01 || (Math.abs(diff - bestDiff) <= 0.01 && B > (bestMatch ? bestMatch.total : 0))) {
                          bestDiff = diff;
                          bestMatch = { attended: A, total: B };
                        }
                      }
                    }
                  }
                }
              }
              if (bestMatch && bestDiff <= 1.5) {
                attended = bestMatch.attended;
                total = bestMatch.total;
              } else {
                const validCounts = numArr.slice(0, numArr.length - 1).filter(n => n >= 0 && n <= 500);
                if (validCounts.length >= 2) {
                  attended = Math.min(validCounts[validCounts.length - 1], validCounts[validCounts.length - 2]);
                  total = Math.max(validCounts[validCounts.length - 1], validCounts[validCounts.length - 2]);
                } else {
                  attended = numArr[numArr.length - 2] || 0;
                  total = numArr[numArr.length - 3] || 0;
                }
              }
            }

            if (total > 0 && attended > 0 && (percentage === 0 || isNaN(percentage))) {
              percentage = Number(((attended / total) * 100).toFixed(2));
            }
            
            if (code && total > 0) {
              const cleanCode = code.replace(/^[A-Z]+_/, '').trim();
              const subjIndex = updatedSubjects.findIndex((s: any) => 
                s.code === code || 
                s.code.includes(cleanCode) || 
                code!.includes(s.code.replace(/^[A-Z]+_/, ''))
              );
              
              if (subjIndex !== -1) {
                const oldSubj = updatedSubjects[subjIndex];
                
                if (attended > oldSubj.attendedClasses) {
                  // Marked Present
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: '🎉 Attendance Marked: Present!',
                      body: `Marked Present in ${oldSubj.name.substring(0, 30)}. Total: ${percentage}%`,
                      sound: true,
                      color: '#10b981',
                      channelId: 'pathwise-default-v2',
                    } as any,
                    trigger: {
                      channelId: 'pathwise-default-v2',
                      seconds: 1,
                    } as any,
                  });
                  notificationsSent++;
                  hasAttChanges = true;
                } else if (total > oldSubj.totalClasses && attended === oldSubj.attendedClasses) {
                  // Marked Absent
                  await Notifications.scheduleNotificationAsync({
                    content: {
                      title: '⚠️ Attendance Alert: Marked Absent!',
                      body: `Marked Absent in ${oldSubj.name.substring(0, 30)}. Total: ${percentage}%`,
                      sound: true,
                      color: '#ef4444',
                      channelId: 'pathwise-streak-v2',
                    } as any,
                    trigger: {
                      channelId: 'pathwise-streak-v2',
                      seconds: 1,
                    } as any,
                  });
                  notificationsSent++;
                  hasAttChanges = true;
                }
                
                updatedSubjects[subjIndex] = {
                  ...oldSubj,
                  totalClasses: total,
                  attendedClasses: attended,
                  attendancePercentage: percentage
                };
              }
            }
          }
        }
        
        if (hasAttChanges) {
          oldData.subjects = updatedSubjects;
        }
      }
    } catch(e) { console.error('BG Sync Att Err:', e); }

    // 2. Fetch Marks
    try {
      const marksRes = await fetch('https://student.culko.in/frmStudentMarksView.aspx', {
        headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0' }
      });
      const marksHtml = await marksRes.text();
      
      if (marksHtml && !marksHtml.includes('login')) {
         const oldMarks = oldData.marks || [];
         const newMarks: any[] = [];

         // Parse accordion sections
         const sectionRegex = /<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/gi;
         let match;

         while ((match = sectionRegex.exec(marksHtml)) !== null) {
           const rawHeading = match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
           const tableHtml = match[2];

           const codeMatch = rawHeading.match(/\(([0-9A-Z]{2,8}[-_]?[0-9]{3})\)/i);
           const code = codeMatch ? codeMatch[1] : '';
           const subjectName = rawHeading.replace(/\s*\([0-9A-Z]{2,8}[-_]?[0-9]{3}\)/i, '').trim() || rawHeading;

           const exams: any[] = [];
           let mstMarks = 'N/A';
           let practicalMarks = 'N/A';
           let totalObtained = 0;
           let totalMax = 0;

           const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
           let rowMatch;

           while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
             const rowContent = rowMatch[1];
             if (/<th/i.test(rowContent)) continue;

             const cellMatches = [...rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
             if (cellMatches.length >= 3) {
               const desc = cellMatches[0][1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
               const maxStr = cellMatches[1][1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
               const obtStr = cellMatches[2][1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

               if (desc && maxStr && obtStr) {
                 exams.push({ name: desc, max: maxStr, obtained: obtStr });
                 const maxNum = parseFloat(maxStr);
                 const obtNum = parseFloat(obtStr);

                 if (!isNaN(maxNum) && !isNaN(obtNum)) {
                   totalObtained += obtNum;
                   totalMax += maxNum;

                   const descLow = desc.toLowerCase();
                   if (descLow.includes('mid') || descLow.includes('mst')) {
                     mstMarks = `${obtStr}/${maxStr}`;
                   } else if (descLow.includes('prac') || descLow.includes('lab')) {
                     practicalMarks = `${obtStr}/${maxStr}`;
                   }
                 }
               }
             }
           }

           if (exams.length > 0) {
             if (mstMarks === 'N/A') mstMarks = `${exams[0].obtained}/${exams[0].max}`;
             newMarks.push({
               code,
               subjectName,
               fullName: rawHeading,
               exams,
               mstMarks,
               practicalMarks,
               totalObtained,
               totalMax
             });
           }
         }

         if (newMarks.length > 0) {
           for (const nm of newMarks) {
             const oldM = oldMarks.find((om: any) => 
               (om.code && nm.code && om.code === nm.code) || 
               (om.subjectName && nm.subjectName && om.subjectName.toLowerCase() === nm.subjectName.toLowerCase())
             );

             for (const ex of nm.exams) {
               const hadExam = oldM?.exams?.some((oe: any) => oe.name === ex.name && oe.obtained === ex.obtained);
               if (!hadExam && (!oldM || oldM.subjectName === '20' || oldM.mstMarks !== `${ex.obtained}/${ex.max}`)) {
                 await Notifications.scheduleNotificationAsync({
                   content: {
                      title: '📊 New Marks Released!',
                      body: `New marks for ${nm.subjectName.substring(0, 25)}: ${ex.name} - ${ex.obtained}/${ex.max}`,
                      sound: true,
                      color: '#f59e0b',
                      channelId: 'pathwise-coin-v2',
                    } as any,
                    trigger: {
                      channelId: 'pathwise-coin-v2',
                      seconds: 1,
                    } as any,
                 });
                 notificationsSent++;
               }
             }
           }

           oldData.marks = newMarks;
         }
      }
    } catch(e) { console.error('BG Sync Marks Err:', e); }

    // 3. Check for new Assignments & CR Announcements from Backend
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL;
      const userSection = oldData.profile?.section;
      if (API_URL && userSection) {
        // Fetch CR Notifications
        try {
          const notifRes = await fetch(`${API_URL}/notifications?section=${encodeURIComponent(userSection)}`);
          if (notifRes.ok) {
            const notifications: any[] = await notifRes.json();
            const lastSeenNotifId = await AsyncStorage.getItem('last_seen_cr_notif_id');
            if (notifications && notifications.length > 0) {
              const newest = notifications[0];
              if (lastSeenNotifId && newest._id !== lastSeenNotifId) {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: `📢 CR Announcement: ${newest.title}`,
                    body: newest.message?.length > 100 ? `${newest.message.substring(0, 97)}...` : newest.message,
                    sound: true,
                    color: '#3b82f6',
                    channelId: 'pathwise-default-v2',
                  } as any,
                  trigger: {
                    channelId: 'pathwise-default-v2',
                    seconds: 1,
                  } as any,
                });
                notificationsSent++;
              }
              await AsyncStorage.setItem('last_seen_cr_notif_id', newest._id);
            }
          }
        } catch (ne) { console.error('BG Sync CR Notif Err:', ne); }

        // Fetch Assignments
        try {
          const asgnRes = await fetch(`${API_URL}/assignments?section=${encodeURIComponent(userSection)}`);
          if (asgnRes.ok) {
            const assignments: any[] = await asgnRes.json();
            const lastSeenAsgnId = await AsyncStorage.getItem('last_seen_assignment_id');
            if (assignments && assignments.length > 0) {
              const newestAsgn = assignments[assignments.length - 1];
              if (lastSeenAsgnId && newestAsgn._id !== lastSeenAsgnId) {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: `📝 New Assignment: ${newestAsgn.title}`,
                    body: `${newestAsgn.subject} — Due: ${new Date(newestAsgn.dueDate).toLocaleDateString()}`,
                    sound: true,
                    color: '#3b82f6',
                    channelId: 'pathwise-default-v2',
                  } as any,
                  trigger: {
                    channelId: 'pathwise-default-v2',
                    seconds: 1,
                  } as any,
                });
                notificationsSent++;
              }
              await AsyncStorage.setItem('last_seen_assignment_id', newestAsgn._id);
            }
          }
        } catch (ae) { console.error('BG Sync Assignments Err:', ae); }
      }
    } catch(e) { console.error('BG Sync Backend Err:', e); }

    if (notificationsSent > 0) {
       await AsyncStorage.setItem('studyos_scraped_data', JSON.stringify(oldData));
       return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error('BG Sync Error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync() {
  try {
    await setupAndroidChannels().catch(() => {});
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false, // android only: keep active when app is killed/closed
        startOnBoot: true, // android only: restart after phone reboot
      });
      console.log('[BackgroundSync] Registered successfully');
    }
  } catch (err) {
    console.warn('[BackgroundSync] Registration error:', err);
  }
}

export async function unregisterBackgroundSync() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
      console.log('[BackgroundSync] Unregistered successfully');
    }
  } catch (err) {
    console.warn('[BackgroundSync] Unregistration error:', err);
  }
}
