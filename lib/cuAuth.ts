import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const CU_LOGIN_URL = 'https://student.culko.in/Login.aspx';
const CU_HOME_URL = 'https://student.culko.in/StudentHome.aspx';
const LMS_AUTH_URL = 'https://lms.culko.in/local/autologin/autologin.php';

export interface ViewStateData {
  viewState: string;
  viewStateGenerator: string;
  hfCurrentBackground?: string;
  eventValidation?: string;
}

/**
 * Step 1: GET Login.aspx and extract initial hidden fields
 */
export async function fetchInitialViewState(): Promise<ViewStateData> {
  const response = await axios.get(CU_LOGIN_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  const html = response.data;
  return extractViewStateVariables(html);
}

/**
 * Step 2 & 3: Submit Roll Number and get fresh ViewState for Password page
 */
export async function submitRollNumber(rollNumber: string, vsData: ViewStateData): Promise<ViewStateData> {
  const formData = new URLSearchParams();
  formData.append('__VIEWSTATE', vsData.viewState);
  formData.append('__VIEWSTATEGENERATOR', vsData.viewStateGenerator);
  if (vsData.hfCurrentBackground) formData.append('hfcurrentbackground', vsData.hfCurrentBackground);
  if (vsData.eventValidation) formData.append('__EVENTVALIDATION', vsData.eventValidation);
  
  formData.append('txtUserId', rollNumber);
  formData.append('btnNext', 'Next');

  const response = await axios.post(CU_LOGIN_URL, formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  const html = response.data;
  return extractViewStateVariables(html);
}

/**
 * Step 4 & 5: Submit Password, handle login, and extract ASP.NET_SessionId
 */
export async function submitPassword(password: string, vsData: ViewStateData): Promise<string> {
  const formData = new URLSearchParams();
  formData.append('__VIEWSTATE', vsData.viewState);
  formData.append('__VIEWSTATEGENERATOR', vsData.viewStateGenerator);
  if (vsData.eventValidation) formData.append('__EVENTVALIDATION', vsData.eventValidation);
  
  formData.append('txtLoginPassword', password);
  formData.append('btnLogin', 'Login');

  const response = await axios.post(CU_LOGIN_URL, formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
    maxRedirects: 0, // We want to catch the 302 redirect manually to grab cookies
    validateStatus: (status) => status >= 200 && status < 400,
  });

  // Extract ASP.NET_SessionId from Set-Cookie header
  const setCookieHeaders = response.headers['set-cookie'] || [];
  let sessionId = '';
  
  for (const cookie of setCookieHeaders) {
    if (cookie.includes('ASP.NET_SessionId=')) {
      sessionId = cookie.split(';')[0];
      break;
    }
  }
  
  if (!sessionId) {
    throw new Error('Failed to retrieve ASP.NET_SessionId after login.');
  }

  // Save to secure store
  await SecureStore.setItemAsync('portal_session', sessionId);
  
  return sessionId;
}

/**
 * Step 6: Trigger LMS SSO from StudentHome.aspx and get JWT
 */
export async function triggerLMSSSO(sessionId: string): Promise<string> {
  const formData = new URLSearchParams();
  formData.append('__EVENTTARGET', 'ctl00$lbtnLMSSSO');
  
  const response = await axios.post(CU_HOME_URL, formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Cookie': sessionId,
    },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const redirectUrl = response.headers.location;
  if (!redirectUrl || !redirectUrl.includes('token=')) {
    throw new Error('Failed to trigger LMS SSO or missing JWT token.');
  }

  // Extract JWT token from URL
  const urlObj = new URL(redirectUrl);
  return urlObj.searchParams.get('token') || '';
}

/**
 * Step 7: Use JWT to get MoodleSession cookie
 */
export async function fetchMoodleSessionCookie(jwtToken: string): Promise<string> {
  const response = await axios.get(`${LMS_AUTH_URL}?token=${jwtToken}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
    maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const setCookieHeaders = response.headers['set-cookie'] || [];
  let moodleSession = '';
  
  for (const cookie of setCookieHeaders) {
    if (cookie.includes('MoodleSession=')) {
      moodleSession = cookie.split(';')[0];
      break;
    }
  }

  if (!moodleSession) {
    throw new Error('Failed to retrieve MoodleSession cookie.');
  }

  // Save to secure store
  await SecureStore.setItemAsync('lms_cookie', moodleSession);

  return moodleSession;
}

/**
 * Helper to extract ViewState and related hidden fields from HTML using Regex
 */
function extractViewStateVariables(html: string): ViewStateData {
  const viewStateMatch = html.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
  const viewStateGenMatch = html.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);
  const hfBackgroundMatch = html.match(/id="hfcurrentbackground"\s+value="([^"]*)"/);
  const eventValidationMatch = html.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);

  if (!viewStateMatch || !viewStateGenMatch) {
    throw new Error('Could not extract __VIEWSTATE or __VIEWSTATEGENERATOR from page HTML.');
  }

  return {
    viewState: viewStateMatch[1],
    viewStateGenerator: viewStateGenMatch[1],
    hfCurrentBackground: hfBackgroundMatch ? hfBackgroundMatch[1] : undefined,
    eventValidation: eventValidationMatch ? eventValidationMatch[1] : undefined,
  };
}
