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
  }
};
