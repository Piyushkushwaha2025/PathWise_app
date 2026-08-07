export const ACADEMIC_CALENDAR = [
  { section: "ODD SEMESTER • JULY - DECEMBER 2026", data: [
    { date: "01-Jul-2026", day: "Wednesday", activity: "Start of registration for 2nd Year students (01.07 to 13.07)" },
    { date: "15-Jul-2026", day: "Wednesday", activity: "Start of Odd Semester – Old Batches" },
    { date: "23-Jul-2026", day: "Thursday", activity: "Orientation & Induction 1st Year – Batch I" },
    { date: "24-Jul-2026", day: "Friday", activity: "Start of Odd Semester – 1st Year – Batch I" },
    { date: "15-Aug-2026", day: "Saturday", activity: "Independence Day Celebration", isHoliday: true },
    { date: "24-Aug-2026", day: "Monday", activity: "Orientation & Induction 1st Year – Batch II" },
    { date: "26-Aug-2026", day: "Wednesday", activity: "Start of Odd Semester – 1st Year – Batch II" },
    { date: "04-Sep-2026", day: "Friday", activity: "Krishna Janmastami", isHoliday: true },
    { date: "05-Sep-2026", day: "Saturday", activity: "Teachers' Day Celebration" },
    { date: "08-Sep-2026", day: "Tuesday", activity: "Mid-Semester Test [MST-1] (08.09 to 11.09)", isExam: true },
    { date: "18-Sep-2026", day: "Friday", activity: "Fresher's Party 2026" },
    { date: "26-Sep-2026", day: "Saturday", activity: "Orientation & Induction [International] 1st Year" },
    { date: "02-Oct-2026", day: "Friday", activity: "Mahatma Gandhi Jayanti", isHoliday: true },
    { date: "12-Oct-2026", day: "Monday", activity: "Mid-Semester Practical [MSP] (12.10 to 15.10)", isExam: true },
    { date: "20-Oct-2026", day: "Tuesday", activity: "Dussehra", isHoliday: true },
    { date: "26-Oct-2026", day: "Monday", activity: "Maharshi Valmiki Jayanti", isHoliday: true },
    { date: "27-Oct-2026", day: "Tuesday", activity: "Mid-Semester Test [MST-2] (27.10 to 30.10)", isExam: true },
    { date: "07-Nov-2026", day: "Saturday", activity: "Last Day of Closing all Internal Components" },
    { date: "09-Nov-2026", day: "Monday", activity: "Deepawali", isHoliday: true },
    { date: "16-Nov-2026", day: "Monday", activity: "Last Teaching Day – All Years" },
    { date: "23-Nov-2026", day: "Monday", activity: "End Semester Practical Exam (23.11 to 28.11)", isExam: true },
    { date: "24-Nov-2026", day: "Tuesday", activity: "Gurupurub", isHoliday: true },
    { date: "30-Nov-2026", day: "Monday", activity: "End Semester Theory Exams (30.11 to 22.12)", isExam: true },
    { date: "22-Dec-2026", day: "Tuesday", activity: "End of Odd Semester – All Years" },
    { date: "23-Dec-2026", day: "Wednesday", activity: "Start of Registration for Even Semester (23.12 to 03.01)" },
    { date: "25-Dec-2026", day: "Friday", activity: "Christmas", isHoliday: true },
    { date: "02-Jan-2027", day: "Saturday", activity: "Announcement of Results" },
  ]}
];

const months: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

export const agendaItems: Record<string, any[]> = {};
export const markedDates: Record<string, any> = {};

ACADEMIC_CALENDAR.forEach(section => {
  section.data.forEach(item => {
    const parts = item.date.split('-');
    const dateStr = `${parts[2]}-${months[parts[1]]}-${parts[0]}`;
    if (!agendaItems[dateStr]) agendaItems[dateStr] = [];
    agendaItems[dateStr].push(item);
    markedDates[dateStr] = { marked: true, dotColor: item.isHoliday ? '#22c55e' : item.isExam ? '#ef4444' : '#3b82f6' };
  });
});

export function isHolidayOrExam(date: Date): boolean {
  // Sunday is a non-teaching day
  if (date.getDay() === 0) return true;
  
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  const events = agendaItems[dateStr];
  if (events) {
    return events.some(e => e.isHoliday || e.isExam);
  }
  return false;
}
