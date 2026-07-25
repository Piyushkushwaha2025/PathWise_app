import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const BACKGROUND_SYNC_TASK = 'BACKGROUND_SYNC_TASK';

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const cookies = await AsyncStorage.getItem('studyos_portal_cookies');
    if (!cookies) return BackgroundFetch.BackgroundFetchResult.NoData;

    const rawOldData = await AsyncStorage.getItem('studyos_scraped_data');
    if (!rawOldData) return BackgroundFetch.BackgroundFetchResult.NoData;

    const oldData = JSON.parse(rawOldData);
    let notificationsSent = 0;
    
    // 1. Fetch Attendance
    try {
      const attRes = await fetch('https://student.culko.in/frmStudentCourseWiseAttendanceSummary.aspx', {
        headers: { 'Cookie': cookies, 'User-Agent': 'Mozilla/5.0' }
      });
      const attHtml = await attRes.text();
      
      if (attHtml && !attHtml.includes('login') && oldData.subjects) {
        let updatedSubjects = [...oldData.subjects];
        let hasAttChanges = false;
        
        // Simple regex to parse table rows
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
        let rowMatch;
        while ((rowMatch = rowRegex.exec(attHtml)) !== null) {
           const rowHtml = rowMatch[1];
           const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
           let cells = [];
           let cellMatch;
           while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
              // Strip inner HTML tags to get pure text
              let text = cellMatch[1].replace(/<[^>]*>/g, '').trim();
              cells.push(text);
           }
           
           if (cells.length >= 8) {
              const code = cells[0];
              const total = parseInt(cells[2]) || 0;
              const attended = parseInt(cells[3]) || 0;
              const percentage = parseFloat(cells[10]) || 0;
              
              if (code) {
                 // Find matching subject
                 const subjIndex = updatedSubjects.findIndex(s => s.code.includes(code) || code.includes(s.code.replace(/^[A-Z]+_/, '')));
                 if (subjIndex !== -1) {
                    const oldSubj = updatedSubjects[subjIndex];
                    
                    if (attended > oldSubj.attendedClasses) {
                       // Marked Present
                       await Notifications.scheduleNotificationAsync({
                          content: {
                             title: 'Attendance Updated',
                             body: `Marked Present for ${oldSubj.name.substring(0, 30)}. Total: ${percentage}%`,
                             sound: true,
                          },
                          trigger: null,
                       });
                       notificationsSent++;
                       hasAttChanges = true;
                    } else if (total > oldSubj.totalClasses && attended === oldSubj.attendedClasses) {
                       // Marked Absent
                       await Notifications.scheduleNotificationAsync({
                          content: {
                             title: 'Attendance Updated',
                             body: `Marked Absent for ${oldSubj.name.substring(0, 30)}. Total: ${percentage}%`,
                             sound: true,
                          },
                          trigger: null,
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
      
      if (marksHtml && !marksHtml.includes('login') && oldData.marks) {
         let updatedMarks = [...oldData.marks];
         let hasMarksChanges = false;
         
         const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
         let rowMatch;
         let headerCells = [];
         
         while ((rowMatch = rowRegex.exec(marksHtml)) !== null) {
            const rowHtml = rowMatch[1];
            
            // If it's header, get indexes
            if (rowHtml.includes('<th')) {
               const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/g;
               let thMatch;
               while ((thMatch = thRegex.exec(rowHtml)) !== null) {
                  headerCells.push(thMatch[1].replace(/<[^>]*>/g, '').trim());
               }
               continue;
            }
            
            const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
            let cells = [];
            let cellMatch;
            while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
               cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
            }
            
            if (cells.length > 2 && headerCells.length > 0) {
               const subjectName = cells[1];
               const code = cells[0];
               
               const matchIndex = updatedMarks.findIndex(m => m.subjectName === subjectName);
               if (matchIndex !== -1) {
                  const oldM = updatedMarks[matchIndex];
                  
                  // For each column, check if marks changed (e.g., from N/A to a value)
                  for (let i = 2; i < cells.length; i++) {
                     const colName = headerCells[i] || 'Exam';
                     const val = cells[i];
                     if (val && val !== 'N/A' && val !== '0/0' && val !== '' && val !== '0' && val !== '-') {
                        // Check if this specific mark type is new
                        if ((colName.toUpperCase().includes('MST') && oldM.mstMarks !== val) || 
                            (colName.toUpperCase().includes('PRACTICAL') && oldM.practicalMarks !== val) ||
                            (colName.toUpperCase().includes('QUIZ') && !oldM.mstMarks.includes(val) && !oldM.practicalMarks.includes(val))) {
                           
                           await Notifications.scheduleNotificationAsync({
                              content: {
                                 title: 'Marks Uploaded',
                                 body: `New marks for ${subjectName.substring(0,25)}: ${colName} - ${val}`,
                                 sound: true,
                              },
                              trigger: null,
                           });
                           notificationsSent++;
                           hasMarksChanges = true;
                           
                           if (colName.toUpperCase().includes('MST')) oldM.mstMarks = val;
                           if (colName.toUpperCase().includes('PRACTICAL')) oldM.practicalMarks = val;
                        }
                     }
                  }
               }
            }
         }
         
         if (hasMarksChanges) {
            oldData.marks = updatedMarks;
         }
      }
    } catch(e) { console.error('BG Sync Marks Err:', e); }

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
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15 * 60, // 15 minutes
      stopOnTerminate: false, // android only,
      startOnBoot: true, // android only
    });
  }
}
