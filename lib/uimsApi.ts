import axios from 'axios';
import { useCuSessionStore } from '../store/cuSessionStore';
import * as SecureStore from 'expo-secure-store';

const UIMS_API_BASE = 'https://uimsapi.cuchd.in/api/homepage';

const getUimsAuthData = async () => {
  const { lmsUserId } = useCuSessionStore.getState();
  const portalSession = await SecureStore.getItemAsync('portal_session');
  
  if (!lmsUserId || !portalSession) {
    throw new Error('Not authenticated for UIMS');
  }
  
  return { lmsUserId, portalSession };
};

export interface AttendanceData {
  subjectName: string;
  totalClasses: number;
  attendedClasses: number;
  percentage: number;
}

export async function fetchAttendance(): Promise<AttendanceData[]> {
  const { lmsUserId, portalSession } = await getUimsAuthData();

  const response = await axios.get(`${UIMS_API_BASE}/StudentMentorDetailView?StudentId=${lmsUserId}`, {
    headers: {
      'Cookie': portalSession,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  if (!response.data || !Array.isArray(response.data)) {
    throw new Error('Invalid response from Attendance API');
  }

  // Assuming response maps directly, or mapping it manually
  return response.data.map((item: any) => ({
    subjectName: item.Subject || 'Unknown Subject',
    totalClasses: item.TotalDelivered || 0,
    attendedClasses: item.TotalAttended || 0,
    percentage: parseFloat(item.Percentage || '0'),
  }));
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
  const { lmsUserId, portalSession } = await getUimsAuthData();

  const response = await axios.get(`${UIMS_API_BASE}/GetStudentTimeTable?StudentId=${lmsUserId}`, {
    headers: {
      'Cookie': portalSession,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  if (!response.data || !Array.isArray(response.data)) {
    throw new Error('Invalid response from Timetable API');
  }

  return response.data.map((item: any) => ({
    day: item.DayName || '',
    subject: item.SubjectName || '',
    teacher: item.FacultyName || '',
    room: item.RoomNo || '',
    timeStart: item.StartTime || '',
    timeEnd: item.EndTime || '',
    type: item.SlotType || '',
    group: item.GroupName || '',
  }));
}
