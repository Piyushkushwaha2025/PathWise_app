import axios from 'axios';
import { useStudySessionStore } from '../store/studySessionStore';
import { UNIVERSITIES } from '../constants/universities';
import * as SecureStore from 'expo-secure-store';
import { SessionExpiredError, NetworkError, CacheService } from './apiHelpers';

// Helper to get cookies and session info
const getAuthData = async () => {
  const { lmsSesskey, lmsUserId } = useStudySessionStore.getState();
  const moodleCookie = await SecureStore.getItemAsync('lms_cookie');
  
  if (!lmsSesskey || !lmsUserId || !moodleCookie) {
    throw new SessionExpiredError('Not authenticated with LMS');
  }
  
  const { universityId } = useStudySessionStore.getState();
  const uni = UNIVERSITIES[universityId || 'cu'];
  return { lmsSesskey, lmsUserId, moodleCookie, uni };
};

export interface MoodleCourse {
  id: number;
  fullname: string;
  shortname: string;
  idnumber: string;
  summary: string;
}

/**
 * Fetch user's enrolled subjects (courses)
 */
export async function fetchUserCourses(): Promise<MoodleCourse[]> {
  const { lmsSesskey, lmsUserId, moodleCookie, uni } = await getAuthData();

  const payload = [{
    methodname: 'core_enrol_get_users_courses',
    args: { userid: lmsUserId }
  }];

  try {
    const response = await axios.post(
      `${uni.lmsAjaxUrl}?sesskey=${lmsSesskey}&info=core_enrol_get_users_courses`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `MoodleSession=${moodleCookie}`,
        }
      }
    );

    if (response.data[0]?.error) {
      if (response.data[0].exception === 'moodle_exception' || response.data[0].error.includes('login')) {
        throw new SessionExpiredError('Session expired.');
      }
      throw new Error(response.data[0].exception || 'Failed to fetch courses');
    }

    const courses = response.data[0].data as MoodleCourse[];
    await CacheService.set('courses', courses);
    return courses;
  } catch (error: any) {
    if (error instanceof SessionExpiredError) throw error;
    
    // Fallback to cache on network error
    const cached = await CacheService.get<MoodleCourse[]>('courses');
    if (cached) return cached;
    
    throw new NetworkError(error.message);
  }
}

export interface MoodleGradeComponent {
  itemname: string;
  grade: string;
  grademax: number;
}

/**
 * Fetch grades (marks) for a specific course
 */
export async function fetchCourseGrades(courseId: number): Promise<MoodleGradeComponent[]> {
  const { lmsSesskey, lmsUserId, moodleCookie, uni } = await getAuthData();

  const payload = [{
    methodname: 'gradereport_user_get_grades_table',
    args: { courseid: courseId, userid: lmsUserId }
  }];

  try {
    const response = await axios.post(
      `${uni.lmsAjaxUrl}?sesskey=${lmsSesskey}&info=gradereport_user_get_grades_table`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `MoodleSession=${moodleCookie}`,
        }
      }
    );

    if (response.data[0]?.error) {
      if (response.data[0].exception === 'moodle_exception' || response.data[0].error.includes('login')) {
        throw new SessionExpiredError('Session expired.');
      }
      throw new Error(response.data[0].exception || 'Failed to fetch grades');
    }

    const tables = response.data[0].data?.tables || [];
    if (tables.length === 0) return [];

    const gradeItems = tables[0].tabledata || [];
    const grades = gradeItems
      .filter((item: any) => item.itemname && item.grade)
      .map((item: any) => ({
        itemname: item.itemname.content || item.itemname,
        grade: item.grade.content || item.grade,
        grademax: parseFloat(item.grademax?.content || item.grademax || '100'),
      }));
      
    await CacheService.set(`grades_${courseId}`, grades);
    return grades;
  } catch (error: any) {
    if (error instanceof SessionExpiredError) throw error;
    
    const cached = await CacheService.get<MoodleGradeComponent[]>(`grades_${courseId}`);
    if (cached) return cached;
    
    throw new NetworkError(error.message);
  }
}
