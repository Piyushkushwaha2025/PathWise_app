import axios from 'axios';
import { useStudySessionStore } from '../store/studySessionStore';
import { UNIVERSITIES } from '../constants/universities';
import * as SecureStore from 'expo-secure-store';
import { SessionExpiredError, NetworkError, CacheService } from './apiHelpers';



const getUimsAuthData = async () => {
  const { lmsUserId } = useStudySessionStore.getState();
  const portalSession = await SecureStore.getItemAsync('portal_session');
  
  if (!lmsUserId || !portalSession) {
    throw new SessionExpiredError('Not authenticated for UIMS');
  }
  
  const { universityId } = useStudySessionStore.getState();
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
    const response = await axios.get(`${uni.uimsApiBase}/StudentMentorDetailView?StudentId=${lmsUserId}`, {
      headers: {
        'Cookie': portalSession,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    if (!response.data || !Array.isArray(response.data)) {
      if (typeof response.data === 'string' && response.data.includes('login')) {
         throw new SessionExpiredError('UIMS Session expired');
      }
      throw new Error('Invalid response from Attendance API');
    }

    const attendance = response.data.map((item: any) => ({
      subjectName: item.Subject || 'Unknown Subject',
      totalClasses: item.TotalDelivered || 0,
      attendedClasses: item.TotalAttended || 0,
      percentage: parseFloat(item.Percentage || '0'),
    }));
    
    await CacheService.set('attendance', attendance);
    return attendance;
  } catch (error: any) {
    if (error instanceof SessionExpiredError) throw error;
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
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
    const response = await axios.get(`${uni.uimsApiBase}/GetStudentTimeTable?StudentId=${lmsUserId}`, {
      headers: {
        'Cookie': portalSession,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
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
