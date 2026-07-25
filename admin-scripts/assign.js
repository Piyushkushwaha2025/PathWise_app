import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:5000'; // Change to production URL if needed
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'studyos-admin-123';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
  console.log("📝 StudyOS Assignment Publisher\n");
  
  const title = await askQuestion("Assignment Title: ");
  const subject = await askQuestion("Subject Name (e.g. Data Structures): ");
  const description = await askQuestion("Description/Instructions: ");
  const daysStr = await askQuestion("Due in how many days? (e.g. 7): ");
  
  const days = parseInt(daysStr) || 7;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + days);

  console.log(`\n⏳ Publishing to all users...`);
  
  try {
    const res = await fetch(`${API_URL}/api/admin/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        subject,
        description,
        dueDate: dueDate.toISOString(),
        adminSecret: ADMIN_SECRET
      })
    });
    
    const data = await res.json();
    if (res.ok) {
      console.log(`✅ Success! Assignment created.`);
      console.log(`📱 Push notifications sent to ${data.notificationsSent} users!`);
    } else {
      console.error(`❌ Failed:`, data.error);
    }
  } catch (e) {
    console.error(`❌ Network Error:`, e.message);
  }
  
  rl.close();
}

main();
