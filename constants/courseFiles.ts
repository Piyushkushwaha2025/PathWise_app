import courseFilesData from './courseFiles.json';

const typedCourseFiles = courseFilesData as Record<string, Record<string, string[]>>;

/**
 * Returns pre-bundled syllabus files grouped by units for a given course code or subject name.
 * Provides instant 0ms offline availability for file selection in AI tutor.
 */
export function getBundledCourseFiles(courseCode: string, courseName?: string): Record<string, string[]> | null {
  if (!courseCode && !courseName) return null;

  const rawCode = (courseCode || '').toUpperCase().trim();
  const rawName = (courseName || '').toLowerCase().trim();

  // Direct code match
  if (typedCourseFiles[rawCode]) {
    return typedCourseFiles[rawCode];
  }

  // Code normalization (e.g. 25CSH-214 vs 25CSH214 vs CONT_25CSH-214)
  const codeMatch = rawCode.match(/([0-9]{2}[A-Z]{2,3}-[0-9]{3})/i);
  if (codeMatch && typedCourseFiles[codeMatch[1]]) {
    return typedCourseFiles[codeMatch[1]];
  }

  // Name / alias mappings
  if (rawName.includes('database') || rawName.includes('dbms') || rawCode.includes('25CSH-211') || rawCode.includes('25CSH211') || rawCode === 'DBMS') {
    return typedCourseFiles['DBMS'] || null;
  }
  if (rawName.includes('data structure') || rawName.includes('dsa') || rawName.includes('algorithm') || rawCode.includes('25CSH-209') || rawCode.includes('25CSH209')) {
    return typedCourseFiles['25CSH-209'] || null;
  }
  if (rawName.includes('architecture') || rawName.includes('organization') || rawName.includes('coa') || rawCode.includes('25CST-208') || rawCode.includes('25CST208')) {
    return typedCourseFiles['25CST-208'] || null;
  }
  if (rawName.includes('python') || rawName.includes('gui') || rawCode.includes('25CSH-214') || rawCode.includes('25CSH214')) {
    return typedCourseFiles['25CSH-214'] || null;
  }
  if (rawName.includes('discrete') || rawName.includes('mathematics') || rawCode.includes('25MTT-202') || rawCode.includes('25MTT202')) {
    return typedCourseFiles['25MTT-202'] || null;
  }
  if (rawName.includes('environmental') || rawName.includes('evs') || rawName.includes('ecology') || rawCode.includes('25UCT-201') || rawCode.includes('25UCT201')) {
    return typedCourseFiles['25UCT-201'] || null;
  }

  return null;
}
