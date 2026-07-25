const fs = require('fs');
const path = require('path');

const root = 'D:/AI/PathWise_Versions/v1.0.3';

const replacements = [
  {
    file: 'app/(app)/studyos/dashboard.tsx',
    replaces: [
      { from: /import { useCuSessionStore } from '..\/..\/..\/store\/cuSessionStore';/g, to: `import { useStudySessionStore } from '../../../store/studySessionStore';` },
      { from: /useCuSessionStore\(\)/g, to: `useStudySessionStore()` }
    ]
  },
  {
    file: 'app/(app)/studyos/index.tsx',
    replaces: [
      { from: /import { useCuSessionStore } from '..\/..\/..\/store\/cuSessionStore';/g, to: `import { useStudySessionStore } from '../../../store/studySessionStore';` },
      { from: /useCuSessionStore\(\)/g, to: `useStudySessionStore()` }
    ]
  },
  {
    file: 'app/(app)/studyos/webview-login.tsx',
    replaces: [
      { from: /import { useCuSessionStore } from '..\/..\/..\/store\/cuSessionStore';/g, to: `import { useStudySessionStore } from '../../../store/studySessionStore';\nimport { UNIVERSITIES } from '../../../constants/universities';\nimport { useLocalSearchParams } from 'expo-router';` },
      { from: /useCuSessionStore\(\)/g, to: `useStudySessionStore()` },
      { from: /const CU_LOGIN_URL = 'https:\/\/student\.culko\.in\/Login\.aspx';/g, to: `` },
      { from: /export default function WebViewLoginScreen\(\) \{/g, to: `export default function WebViewLoginScreen() {\n  const { uniId } = useLocalSearchParams<{ uniId: string }>();\n  const activeUni = UNIVERSITIES[uniId || 'cu'];` },
      { from: /source=\{\{ uri: CU_LOGIN_URL \}\}/g, to: `source={{ uri: activeUni.loginUrl }}` },
      { from: /url\.toLowerCase\(\)\.includes\('studenthome\.aspx'\)/g, to: `url.toLowerCase().includes(activeUni.studentHomeMatch.toLowerCase())` },
      { from: /url\.toLowerCase\(\)\.includes\('lms\.culko\.in'\)/g, to: `url.toLowerCase().includes(activeUni.lmsDomain.toLowerCase())` },
      { from: /await setSession\(data\.sesskey, parseInt\(data\.userId, 10\)\);/g, to: `await setSession(activeUni.id, data.sesskey, parseInt(data.userId, 10));` },
      { from: /await setSession\(manualSession\.sesskey, parseInt\(manualSession\.userId, 10\) \|\| 0\);/g, to: `await setSession(activeUni.id, manualSession.sesskey, parseInt(manualSession.userId, 10) || 0);` }
    ]
  },
  {
    file: 'lib/moodleApi.ts',
    replaces: [
      { from: /import { useCuSessionStore } from '\.\.\/store\/cuSessionStore';/g, to: `import { useStudySessionStore } from '../store/studySessionStore';\nimport { UNIVERSITIES } from '../constants/universities';` },
      { from: /useCuSessionStore/g, to: `useStudySessionStore` },
      { from: /const LMS_AJAX_URL = 'https:\/\/lms\.culko\.in\/lib\/ajax\/service\.php';/g, to: `` },
      { from: /return \{ lmsSesskey, lmsUserId, moodleCookie \};/g, to: `const { universityId } = useStudySessionStore.getState();\n  const uni = UNIVERSITIES[universityId || 'cu'];\n  return { lmsSesskey, lmsUserId, moodleCookie, uni };` },
      { from: /const \{ lmsSesskey, lmsUserId, moodleCookie \} = await getAuthData\(\);/g, to: `const { lmsSesskey, lmsUserId, moodleCookie, uni } = await getAuthData();` },
      { from: /\`\$\{LMS_AJAX_URL\}\?sesskey/g, to: `\`\${uni.lmsAjaxUrl}?sesskey` }
    ]
  },
  {
    file: 'lib/uimsApi.ts',
    replaces: [
      { from: /import { useCuSessionStore } from '\.\.\/store\/cuSessionStore';/g, to: `import { useStudySessionStore } from '../store/studySessionStore';\nimport { UNIVERSITIES } from '../constants/universities';` },
      { from: /useCuSessionStore/g, to: `useStudySessionStore` },
      { from: /const UIMS_API_BASE = 'https:\/\/uimsapi\.cuchd\.in\/api\/homepage';/g, to: `` },
      { from: /return \{ lmsUserId, portalSession \};/g, to: `const { universityId } = useStudySessionStore.getState();\n  const uni = UNIVERSITIES[universityId || 'cu'];\n  return { lmsUserId, portalSession, uni };` },
      { from: /const \{ lmsUserId, portalSession \} = await getUimsAuthData\(\);/g, to: `const { lmsUserId, portalSession, uni } = await getUimsAuthData();` },
      { from: /\`\$\{UIMS_API_BASE\}/g, to: `\`\${uni.uimsApiBase}` }
    ]
  }
];

replacements.forEach(r => {
  const p = path.join(root, r.file);
  if (!fs.existsSync(p)) return;
  
  let content = fs.readFileSync(p, 'utf8');
  r.replaces.forEach(rep => {
    content = content.replace(rep.from, rep.to);
  });
  
  fs.writeFileSync(p, content);
  console.log('Processed ' + r.file);
});
