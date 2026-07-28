require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://studyos_app:3AeHveQqESMM9bzG@pathwise.3pl8vjy.mongodb.net/studyos?appName=PathWise';

const UserSchema = new mongoose.Schema({
  clerkUserId: String,
  email: String,
  role: String,
  section_code: String,
}, { strict: false });

const User = mongoose.model('User', UserSchema);

async function makeCR() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const result = await User.findOneAndUpdate(
    { clerkUserId: 'user_3FNqGLqA7jDhrgfR9CjdaMkgrdV' },
    { role: 'cr', section_code: 'CSE-B' },
    { new: true }
  );

  if (result) {
    console.log('✅ User updated successfully!');
    console.log('Role:', result.role);
    console.log('Section Code:', result.section_code);
  } else {
    console.log('❌ User not found!');
  }

  await mongoose.disconnect();
  process.exit(0);
}

makeCR().catch(console.error);
