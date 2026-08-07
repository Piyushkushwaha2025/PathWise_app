import axios from 'axios';
import { useStudySessionStore } from '../store/studySessionStore';
import { UNIVERSITIES } from '../constants/universities';
import * as SecureStore from 'expo-secure-store';
import { SessionExpiredError, NetworkError, CacheService } from './apiHelpers';



const getUimsAuthData = async () => {
  let { lmsUserId, universityId } = useStudySessionStore.getState();
  const portalSession = await SecureStore.getItemAsync('portal_session');
  
  if (!lmsUserId) {
    const storedUserId = await SecureStore.getItemAsync('lms_userid');
    if (storedUserId) lmsUserId = parseInt(storedUserId, 10);
  }

  if (!universityId) {
    universityId = await SecureStore.getItemAsync('study_university_id');
  }
  
  if (!lmsUserId || !portalSession) {
    throw new SessionExpiredError('Not authenticated for UIMS');
  }
  
  const uni = UNIVERSITIES[universityId || 'cu'];
  return { lmsUserId, portalSession, uni };
};

export interface AttendanceData {
  subjectName: string;
  totalClasses: number;
  attendedClasses: number;
  percentage: number;
}

export async function fetchAttendance(): Promise<AttendanceData[]> {
  const { lmsUserId, portalSession, uni } = await getUimsAuthData();

  try {
    const response = await axios.get(`${uni.uimsApiBase}/StudentMentorDetailView?StudentId=${lmsUserId}&t=${Date.now()}`, {
      headers: {
        'Cookie': portalSession,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });

    if (!response.data || (!Array.isArray(response.data) && typeof response.data !== 'object')) {
      if (typeof response.data === 'string' && (response.data.toLowerCase().includes('login') || response.data.toLowerCase().includes('html'))) {
         throw new SessionExpiredError('UIMS Session expired');
      }
      throw new Error('Invalid response from Attendance API');
    }

    const rawList = Array.isArray(response.data) ? response.data : (response.data.data || response.data.list || response.data.result || []);
    console.log('[UIMS RAW ATTENDANCE]:', JSON.stringify(rawList));

    const getFieldValue = (obj: any, candidates: string[]): any => {
      if (!obj || typeof obj !== 'object') return undefined;
      const keys = Object.keys(obj);
      for (const cand of candidates) {
        for (const k of keys) {
          const cleanK = k.toLowerCase().replace(/[\s_-]/g, '');
          const cleanCand = cand.toLowerCase().replace(/[\s_-]/g, '');
          if (cleanK === cleanCand) {
            if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
              return obj[k];
            }
          }
        }
      }
      return undefined;
    };

    const attendance: AttendanceData[] = rawList.map((item: any) => {
      const sub = getFieldValue(item, ['Subject', 'SubjectName', 'CourseName', 'Course', 'SubName', 'Name']) || 'Unknown Subject';
      const rawTotal = getFieldValue(item, ['TotalDelivered', 'Delivered', 'TotalClasses', 'LecturesDelivered', 'TotalLecturesDelivered', 'Total']);
      const rawAttended = getFieldValue(item, ['TotalAttended', 'Attended', 'AttendedClasses', 'LecturesAttended', 'TotalLecturesAttended', 'Present', 'TotalPresent']);
      const rawPerc = getFieldValue(item, ['Percentage', 'Perc', 'AttendancePercentage', 'TotalPercentage', 'Percent']);

      const totalClasses = rawTotal !== undefined && !isNaN(Number(rawTotal)) ? Math.round(Number(rawTotal)) : 0;
      const attendedClasses = rawAttended !== undefined && !isNaN(Number(rawAttended)) ? Math.round(Number(rawAttended)) : 0;
      let percentage = rawPerc !== undefined && !isNaN(parseFloat(String(rawPerc))) ? parseFloat(String(rawPerc)) : 0;

      if (percentage === 0 && totalClasses > 0 && attendedClasses > 0) {
        percentage = parseFloat(((attendedClasses / totalClasses) * 100).toFixed(2));
      }

      return {
        subjectName: String(sub).trim(),
        totalClasses,
        attendedClasses,
        percentage,
      };
    });
    
    // Check for changes and notify
    try {
      const oldData = await CacheService.get<AttendanceData[]>('attendance');
      if (oldData) {
         for (const newSubj of attendance) {
            const oldSubj = oldData.find(o => o.subjectName === newSubj.subjectName);
            if (oldSubj) {
               if (newSubj.attendedClasses > oldSubj.attendedClasses) {
                   const Notifications = require('expo-notifications');
                   await Notifications.scheduleNotificationAsync({
                     content: {
                        title: 'Attendance Updated ✅',
                        body: `Marked Present for ${newSubj.subjectName.substring(0,25)}. Total: ${newSubj.percentage}%`,
                        sound: true,
                     },
                     trigger: null,
                   });
               } else if (newSubj.totalClasses > oldSubj.totalClasses && newSubj.attendedClasses === oldSubj.attendedClasses) {
                   const Notifications = require('expo-notifications');
                   await Notifications.scheduleNotificationAsync({
                     content: {
                        title: 'Attendance Updated ❌',
                        body: `Marked Absent for ${newSubj.subjectName.substring(0,25)}. Total: ${newSubj.percentage}%`,
                        sound: true,
                     },
                     trigger: null,
                   });
               }
            }
         }
      }
    } catch (e) {
      console.log('Error checking attendance changes', e);
    }
    
    await CacheService.set('attendance', attendance);
    return attendance;
  } catch (error: any) {
    if (error instanceof SessionExpiredError) throw error;
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      throw new SessionExpiredError('UIMS Session expired');
    }
    if (error?.message?.toLowerCase()?.includes('expired') || error?.message?.toLowerCase()?.includes('login')) {
      throw new SessionExpiredError('UIMS Session expired');
    }
    
    const cached = await CacheService.get<AttendanceData[]>('attendance');
    if (cached) return cached;
    
    throw new NetworkError(error.message);
  }
}

export interface TimetableSlot {
  day: string;
  subject: string;
  teacher: string;
  room: string;
  timeStart: string;
  timeEnd: string;
  type: string;
  group: string;
}

export async function fetchTimetable(): Promise<TimetableSlot[]> {
  const { lmsUserId, portalSession, uni } = await getUimsAuthData();

  try {
    const response = await axios.get(`${uni.uimsApiBase}/GetStudentTimeTable?StudentId=${lmsUserId}&t=${Date.now()}`, {
      headers: {
        'Cookie': portalSession,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });

    if (!response.data || !Array.isArray(response.data)) {
      if (typeof response.data === 'string' && response.data.includes('login')) {
         throw new SessionExpiredError('UIMS Session expired');
      }
      throw new Error('Invalid response from Timetable API');
    }

    const timetable = response.data.map((item: any) => ({
      day: item.DayName || '',
      subject: item.SubjectName || '',
      teacher: item.FacultyName || '',
      room: item.RoomNo || '',
      timeStart: item.StartTime || '',
      timeEnd: item.EndTime || '',
      type: item.SlotType || '',
      group: item.GroupName || '',
    }));
    
    await CacheService.set('timetable', timetable);
    return timetable;
  } catch (error: any) {
    if (error instanceof SessionExpiredError) throw error;
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      throw new SessionExpiredError('UIMS Session expired');
    }
    
    const cached = await CacheService.get<TimetableSlot[]>('timetable');
    if (cached) return cached;
    
    throw new NetworkError(error.message);
  }
}
