const fs = require('fs');
const path = require('path');

const files = [
  'app/(app)/studyos/attendance/index.tsx',
  'app/(app)/studyos/marks/cgpa.tsx',
  'app/(app)/studyos/marks/index.tsx',
  'app/(app)/studyos/quiz/[topicId].tsx',
  'app/(app)/studyos/roadmap/topic/[topicId].tsx',
  'app/(app)/studyos/roadmap/[subjectId].tsx',
  'app/(app)/studyos/subjects/index.tsx',
  'app/(app)/studyos/timetable/index.tsx',
  'app/(app)/studyos/connect.tsx',
  'app/(app)/studyos/webview-login.tsx'
];

files.forEach(file => {
  const fullPath = path.join('D:/AI/PathWise_Versions/v1.0.3', file);
  if (!fs.existsSync(fullPath)) return;
  
  let content = fs.readFileSync(fullPath, 'utf8');

  // Fix missing imports
  if (!content.includes('import { useThemeStore }')) {
    const depth = (file.match(/\//g) || []).length;
    const up = '../'.repeat(depth) + 'store/useThemeStore';
    content = `import { useThemeStore } from '${up}';\n` + content;
  }

  // Fix double declarations
  content = content.replace(/const colors = useThemeStore\(\(s\) => s\.colors\);\s*const styles = useStyles\(colors\);\s*const colors = useThemeStore\(\(s\) => s\.colors\);\s*const styles = useStyles\(colors\);/g, 'const colors = useThemeStore((s) => s.colors);\n  const styles = useStyles(colors);');

  fs.writeFileSync(fullPath, content);
  console.log('Fixed: ' + file);
});
