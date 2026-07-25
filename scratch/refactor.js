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

  // Fix imports
  if (!content.includes('useThemeStore')) {
    const depth = (file.match(/\//g) || []).length;
    const up = '../'.repeat(depth) + 'store/useThemeStore';
    content = content.replace(/(import React.*?;\n)/, `$1import { useThemeStore } from '${up}';\n`);
  }
  
  content = content.replace(/Colors\s*,\s*/g, '').replace(/,\s*Colors/g, '');

  // Inject colors into main functional components if not already
  const componentRegex = /export default function (\w+)\([^)]*\)\s*\{/;
  if (componentRegex.test(content) && !content.includes('useThemeStore((s)')) {
    content = content.replace(componentRegex, (match, p1) => {
      return `${match}\n  const colors = useThemeStore((s) => s.colors);\n  const styles = useStyles(colors);`;
    });
  }

  // Find other functional components and inject if they use styles but don't have it
  const otherComponentRegex = /function (\w+)\(([^)]*)\)\s*\{/g;
  content = content.replace(otherComponentRegex, (match, p1, p2) => {
    if (p1 === 'SubjectMarksCard') {
      return `${match}\n  const colors = useThemeStore((s) => s.colors);\n  const styles = useStyles(colors);`;
    }
    return match;
  });

  // Change Colors. to colors. globally
  content = content.replace(/Colors\./g, 'colors.');

  // Change StyleSheet.create to useStyles
  content = content.replace(/const styles = StyleSheet\.create/g, 'const useStyles = (colors: any) => StyleSheet.create');

  fs.writeFileSync(fullPath, content);
  console.log('Processed: ' + file);
});
