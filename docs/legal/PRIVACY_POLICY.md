# Privacy Policy for PathWise & StudyOS

**Effective Date:** September 26, 2026  
**Last Updated:** September 26, 2026  

PathWise ("we", "our", or "us"), encompassing the **PathWise** learning ecosystem and the **StudyOS** college operating system, is committed to safeguarding your personal data and upholding your right to privacy.

This Privacy Policy outlines how we collect, process, store, disclose, and protect your personal information when you use our mobile applications, web platforms, and associated services (collectively, the "Service"). This policy has been prepared in full compliance with applicable laws, including the **Digital Personal Data Protection Act (DPDP Act), 2023** of India, and other relevant data protection regulations.

---

## 1. Information We Collect

We adhere strictly to the principle of **data minimization**—collecting only personal data that is directly necessary to deliver, enhance, and personalize your educational experience.

### A. Account & Identity Information
- **Registration Data:** When you create an account via Clerk Authentication or Google OAuth, we collect your full name, email address, profile avatar image, and unique user identifier.
- **Role Information:** Student status, or designation as a verified Class Representative (CR) or Administrator.

### B. College ERP Integration Data (StudyOS)
- **Voluntary ERP Credentials:** To automatically synchronize your academic schedules, attendance, and exam records, you may choose to provide your university/college portal (e.g., CUIMS) username and password.
- **Academic Records:** Upon your explicit authorization, StudyOS fetches and stores:
  - Daily attendance percentages, subject-wise attendance logs, and duty leave records.
  - Internal assessment marks, mid-term test scores, and semester-end transcript results.
  - Timetable, class schedules, enrolled course codes, and teacher assignments.
- **Credential Security:** Your ERP login passwords are encrypted and stored in secure, hardware-isolated on-device storage (**Android Keystore** / **iOS Keychain**) using `expo-secure-store`. We do not sell or inspect your ERP passwords on our servers.

### C. AI Tutor Interactions & Doubt Solving
- **Chat Histories & Academic Queries:** Prompts, study questions, syllabus clarifications, and conversation logs with the AI tutor.
- **Uploaded Photos & Media:** Photographs of textbook pages, handwritten problems, diagrams, and assignment notes captured via your device camera or selected from your photo gallery for AI vision-based doubt solving.

### D. Subscription & Payment Information
- All premium subscription transactions are processed directly by **Razorpay Software Private Limited** ("Razorpay"), a PCI-DSS Level 1 compliant payment processor.
- **We do NOT collect, process, or store** your credit/debit card numbers, CVVs, expiration dates, UPI PINs, or net banking passwords. We receive only non-sensitive transaction confirmation metadata (e.g., Razorpay Order ID, Payment ID, subscription tier, and validity dates).

### E. Technical & Diagnostic Information
- Push notification tokens (Expo Push Token) to send timetable alerts, class reminders, and CR announcements.
- Crash reports, application performance metrics, and anonymous device diagnostics.

---

## 2. Third-Party Service Providers & Data Sharing

We do not sell, rent, or trade your personal data to advertisers or commercial data brokers. We share data only with trusted infrastructure partners strictly necessary to provide the Service:

1. **Google Gemini API (Google LLC):** Processes your academic prompts, uploaded question photographs, and syllabus queries to generate interactive explanations, summaries, and doubt-solving assistance.
2. **Groq Inc. & Mistral AI:** Utilized for high-speed language model inference and response streaming for the AI study assistant.
3. **Razorpay Software Private Limited:** Processes subscription payments, manages billing tokens, and facilitates lawful refund workflows.
4. **Pinecone Systems Inc.:** Hosts encrypted vector embeddings of college course syllabi, unit topics, and reference materials to provide accurate, syllabus-aligned AI responses.
5. **Clerk (Clerk, Inc.):** Secure authentication, user session tokens, and identity management.
6. **Backblaze B2 (S3-compatible):** Secure cloud storage for assignment PDFs and study documents uploaded by verified Class Representatives (CRs).
7. **Expo Application Services (650 Industries):** Dispatches timely push notifications to your device.

All third-party processors are bound by strict confidentiality and data protection obligations consistent with the DPDP Act 2023.

---

## 3. Compliance with India's DPDP Act, 2023

PathWise respects and enforces all principles established under the **Digital Personal Data Protection Act, 2023**:

- **Lawful & Consent-Based Processing:** We process your personal data only on the lawful basis of your verifiable, informed consent, provided at the time of account creation and credential entry.
- **Purpose Limitation:** Your academic data and doubt queries are processed solely to deliver educational, timetable, attendance, and study assistant services.
- **Data Minimization:** We do not collect background location, contact lists, SMS logs, or unnecessary device telemetry.
- **Rights of the Data Principal:** As an Indian Data Principal, you possess the following statutory rights:
  - **Right to Access Information:** You can view your synchronized ERP data, chat history, and account profile directly in the app at any time.
  - **Right to Correction & Erasure:** You may correct your profile information or request complete erasure of your data via the in-app "Delete My Account" flow.
  - **Right of Grievance Redressal:** You have the right to register concerns or complaints with our designated Grievance Officer.
  - **Right to Nominate:** You have the right to nominate an individual to exercise your rights in the event of incapacity or death.

---

## 4. Data Storage & Retention Policy

- **AI Chat Histories:** Chat conversations and doubt queries are stored locally on your device in secure app storage (`AsyncStorage`). You can clear your chat history for any subject at any time within the subject chat screen.
- **ERP Data & Tokens:** Stored locally on your device and cached during active sessions. Clearing your app cache or logging out wipes local credentials.
- **Server Records:** Account records (email, subscription status, token balances) are retained in our cloud database only while your account remains active.
- **Account Deletion:** When you delete your account, all associated database records (User, Assignments, Notifications, Subscriptions) and local storage keys are permanently and irreversibly purged immediately.

---

## 5. Children's Privacy (18+ Requirement)

PathWise and StudyOS are designed and intended exclusively for higher education students enrolled in colleges, institutes, and universities who are **at least 18 years of age**. 

In strict adherence to Section 9 of the DPDP Act 2023:
- The Service is not directed toward individuals under 18 years of age.
- We do not knowingly collect, solicit, or track personal data from children.
- If we become aware that an individual under 18 has registered an account without verified parental or legal guardian consent, we will promptly delete all associated data from our servers.

---

## 6. How to Request Data Deletion

You retain full autonomy over your data. You can delete all your personal data at any time through either of the following methods:

1. **In-App Immediate Deletion (Recommended):**
   - Navigate to **StudyOS > Profile > Settings** (or **PathWise > Profile > Settings**).
   - Scroll down to the **Danger Zone** and tap **"Delete My Account"**.
   - Review the listed data items, type **DELETE** to confirm, and tap **"Delete Forever"**.
   - All server records in MongoDB, active sessions in Clerk, and local storage caches will be purged immediately.
2. **Email Request:**
   - Email our Data Protection team at **privacy@pathwise.in** from your registered account email address with the subject *"Account Deletion Request"*.
   - We will verify your identity and finalize complete erasure within **7 business days**.

---

## 7. Changes to This Privacy Policy

We may update this Privacy Policy periodically to reflect enhancements in our Service, emerging technologies, or evolving legal frameworks. Whenever material updates are made, we will notify you through an in-app banner or alert. Your continued use of the Service following the posting of modifications indicates your acknowledgement and consent.

---

## 8. Grievance Officer & Contact Information

In accordance with the DPDP Act 2023 and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, if you have any questions, concerns, or grievances regarding our privacy practices, please contact our designated Grievance Officer:

- **Grievance Officer:** Privacy & Data Protection Lead  
- **Entity:** PathWise Learning Technologies  
- **Email:** `privacy@pathwise.in`  
- **Support Inquiries:** `support@pathwise.in`  
- **Jurisdiction:** New Delhi, India  
- **Response Commitment:** All genuine grievances will be acknowledged within 48 hours and resolved within 30 days.
