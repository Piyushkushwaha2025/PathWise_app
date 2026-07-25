export interface UniversityConfig {
  id: string;
  name: string;
  shortName: string;
  loginUrl: string;
  lmsAjaxUrl: string;
  uimsApiBase?: string;
  // Specific domains to watch for in the webview
  lmsDomain: string;
  studentHomeMatch: string;
}

export const UNIVERSITIES: Record<string, UniversityConfig> = {
  'cu': {
    id: 'cu',
    name: 'Chandigarh University',
    shortName: 'CU',
    loginUrl: 'https://student.culko.in/Login.aspx',
    lmsAjaxUrl: 'https://lms.culko.in/lib/ajax/service.php',
    uimsApiBase: 'https://uimsapi.cuchd.in/api/homepage',
    lmsDomain: 'student.culko.in',
    studentHomeMatch: 'studenthome'
  },
  'lpu': {
    id: 'lpu',
    name: 'Lovely Professional University',
    shortName: 'LPU',
    loginUrl: 'https://ums.lpu.in/lpuums/',
    lmsAjaxUrl: 'https://lms.lpu.in/lib/ajax/service.php',
    uimsApiBase: 'https://ums.lpu.in/api',
    lmsDomain: 'lms.lpu.in',
    studentHomeMatch: 'ums.aspx'
  },
  'amity': {
    id: 'amity',
    name: 'Amity University',
    shortName: 'Amizone',
    loginUrl: 'https://s.amizone.net/',
    lmsAjaxUrl: 'https://lms.amizone.net/lib/ajax/service.php',
    uimsApiBase: 'https://api.amizone.net',
    lmsDomain: 'lms.amizone.net',
    studentHomeMatch: 'home.aspx'
  }
};
