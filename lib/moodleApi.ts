import axios from 'axios';
import { useCuSessionStore } from '../store/cuSessionStore';
import * as SecureStore from 'expo-secure-store';

const LMS_AJAX_URL = 'https://lms.culko.in/lib/ajax/service.php';

// Helper to get cookies and session info
const getAuthData = async () => {
  const { lmsSesskey, lmsUserId } = useCuSessionStore.getState();
  const moodleCookie = await SecureStore.getItemAsync('lms_cookie');
  
  if (!lmsSesskey || !lmsUserId || !moodleCookie) {
    throw new Error('Not authenticated with LMS');
  }
  
  return { lmsSesskey, lmsUserId, moodleCookie };
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
  const { lmsSesskey, lmsUserId, moodleCookie } = await getAuthData();

  const payload = [{
    methodname: 'core_enrol_get_users_courses',
    args: { userid: lmsUserId }
  }];

  const response = await axios.post(
    `${LMS_AJAX_URL}?sesskey=${lmsSesskey}&info=core_enrol_get_users_courses`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `MoodleSession=${moodleCookie}`,
      }
    }
  );

  if (response.data[0].error) {
    throw new Error(response.data[0].exception || 'Failed to fetch courses');
  }

  return response.data[0].data as MoodleCourse[];
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
  const { lmsSesskey, lmsUserId, moodleCookie } = await getAuthData();

  const payload = [{
    methodname: 'gradereport_user_get_grades_table',
    args: { courseid: courseId, userid: lmsUserId }
  }];

  const response = await axios.post(
    `${LMS_AJAX_URL}?sesskey=${lmsSesskey}&info=gradereport_user_get_grades_table`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `MoodleSession=${moodleCookie}`,
      }
    }
  );

  if (response.data[0].error) {
    throw new Error(response.data[0].exception || 'Failed to fetch grades');
  }

  // The Moodle grades table response is often complex HTML inside JSON or structured data.
  // Assuming structured data as per the plan.
  const tables = response.data[0].data?.tables || [];
  if (tables.length === 0) return [];

  const gradeItems = tables[0].tabledata || [];
  
  return gradeItems
    .filter((item: any) => item.itemname && item.grade)
    .map((item: any) => ({
      itemname: item.itemname.content || item.itemname,
      grade: item.grade.content || item.grade,
      grademax: parseFloat(item.grademax?.content || item.grademax || '100'),
    }));
}
