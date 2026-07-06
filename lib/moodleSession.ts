import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const LMS_HOME_URL = 'https://lms.culko.in/my/';

export interface MoodleUserDetails {
  sesskey: string;
  userId: number;
}

/**
 * Step 8: GET lms.culko.in homepage and extract sesskey and userId
 */
export async function extractMoodleUserDetails(moodleSessionCookie: string): Promise<MoodleUserDetails> {
  const response = await axios.get(LMS_HOME_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Cookie': `MoodleSession=${moodleSessionCookie}`,
    },
  });

  const html = response.data;
  
  // Extract using Regex as per plan
  const sesskeyMatch = html.match(/"sesskey":"([^"]+)"/);
  const userIdMatch = html.match(/"userId":(\d+)/);

  if (!sesskeyMatch) {
    throw new Error('Failed to extract sesskey from Moodle homepage.');
  }

  if (!userIdMatch) {
    throw new Error('Failed to extract userId from Moodle homepage.');
  }

  const sesskey = sesskeyMatch[1];
  const userId = parseInt(userIdMatch[1], 10);

  // Save to secure store
  await SecureStore.setItemAsync('lms_sesskey', sesskey);
  await SecureStore.setItemAsync('lms_userid', userId.toString());

  return { sesskey, userId };
}
