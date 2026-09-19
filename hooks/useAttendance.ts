import { useQuery } from '@tanstack/react-query';
import { fetchAttendance, AttendanceData } from '../lib/uimsApi';
import { getCachedData, setCachedData } from '../lib/cache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useToastStore } from '../store/useToastStore';

const ATTENDANCE_CACHE_KEY = 'attendance_cache';
// Stores a snapshot of {subjectName -> attendedClasses} to detect changes
const ATTENDANCE_SNAPSHOT_KEY = 'attendance_snapshot_v1';

async function detectAndToastChanges(freshData: AttendanceData[]) {
  try {
    const raw = await AsyncStorage.getItem(ATTENDANCE_SNAPSHOT_KEY);
    const snapshot: Record<string, number> = raw ? JSON.parse(raw) : null;

    if (snapshot) {
      for (const subj of freshData) {
        const prevAttended = snapshot[subj.subjectName];
        if (prevAttended === undefined) continue; // new subject, skip

        if (subj.attendedClasses > prevAttended) {
          // Present marked
          useToastStore.getState().showToast({
            title: 'Attendance Marked ✅',
            message: `Present in ${subj.subjectName.length > 28 ? subj.subjectName.substring(0, 28) + '…' : subj.subjectName} · ${Math.round(subj.percentage)}%`,
            type: 'present',
          });
        } else if (subj.totalClasses > (snapshot[`${subj.subjectName}_total`] ?? subj.totalClasses) && subj.attendedClasses === prevAttended) {
          // Absent marked
          useToastStore.getState().showToast({
            title: 'Attendance Marked ❌',
            message: `Absent in ${subj.subjectName.length > 28 ? subj.subjectName.substring(0, 28) + '…' : subj.subjectName} · ${Math.round(subj.percentage)}%`,
            type: 'absent',
          });
        }
      }
    }

    // Update snapshot with fresh data
    const newSnapshot: Record<string, number> = {};
    for (const subj of freshData) {
      newSnapshot[subj.subjectName] = subj.attendedClasses;
      newSnapshot[`${subj.subjectName}_total`] = subj.totalClasses;
    }
    await AsyncStorage.setItem(ATTENDANCE_SNAPSHOT_KEY, JSON.stringify(newSnapshot));
  } catch (e) {
    // Non-critical - silently ignore
  }
}

export function useAttendance() {
  return useQuery<AttendanceData[]>({
    queryKey: ['attendance'],
    queryFn: async () => {
      try {
        const attendance = await fetchAttendance();
        await setCachedData(ATTENDANCE_CACHE_KEY, attendance);
        // Fire in-app toasts for any changes
        await detectAndToastChanges(attendance);
        return attendance;
      } catch (err: any) {
        // Do not suppress session expired errors so UI can prompt reconnection instead of serving dead cache
        if (err?.name === 'SessionExpiredError' || err?.message?.toLowerCase()?.includes('expired') || err?.message?.toLowerCase()?.includes('login')) {
          throw err;
        }
        // Fallback to cache only for ordinary network connectivity issues
        const cached = await getCachedData<AttendanceData[]>(ATTENDANCE_CACHE_KEY, 24 * 365);
        if (cached) return cached;
        throw err;
      }
    },
    // Keep data fresh for 1 minute, ensuring manual pull-to-refresh gets live numbers
    staleTime: 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}
