export interface LegalSection {
  heading: string;
  body: string;
}

export interface LegalDocument {
  id: 'privacy' | 'terms' | 'refund';
  title: string;
  lastUpdated: string;
  summary: string;
  sections: LegalSection[];
}

export const LEGAL_DOCS: Record<'privacy' | 'terms' | 'refund', LegalDocument> = {
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    lastUpdated: 'September 26, 2026',
    summary: 'How PathWise & StudyOS collect, protect, and handle your student data in compliance with India’s DPDP Act, 2023.',
    sections: [
      {
        heading: '1. Information We Collect',
        body: 'We collect student profile information (name, email) via Clerk/Google Auth. For StudyOS features, you voluntarily provide college ERP credentials (e.g. CUIMS) to fetch attendance, marks, and timetables. ERP passwords are encrypted on-device via Android Keystore / iOS Keychain. AI tutor chat messages and doubt photos (taken via camera or gallery) are processed to deliver educational explanations. Payment details are handled by Razorpay; we never store your card numbers or UPI PINs.',
      },
      {
        heading: '2. Third-Party Service Providers',
        body: 'We share necessary data with trusted infrastructure providers solely to operate the app:\n• Google Gemini API, Groq & Mistral AI: Multimodal doubt solving and AI tutoring responses.\n• Razorpay Software Pvt. Ltd.: Secure PCI-DSS Level 1 payment processing.\n• Pinecone Systems Inc.: Encrypted vector storage of university syllabus outlines.\n• Clerk: Authentication and session management.\n• Backblaze B2: Secure storage for class assignment PDFs uploaded by CRs.\nWe never sell or rent your personal data to commercial advertisers or data brokers.',
      },
      {
        heading: '3. Compliance with India’s DPDP Act, 2023',
        body: 'In accordance with India’s Digital Personal Data Protection (DPDP) Act, 2023:\n• Consent & Minimization: Processing is based on your explicit consent, collecting only data required for academic services.\n• Data Principal Rights: You have the right to access your data, request corrections, demand complete erasure, and raise grievances with our Grievance Officer.\n• Data Security: We maintain strict encryption and cryptographic measures to protect student records.',
      },
      {
        heading: '4. Data Storage & Local Retention',
        body: 'AI tutor conversations and academic queries are stored locally on your device in secure app storage (AsyncStorage) and can be cleared at any time. College ERP session tokens are cached locally during active use. Server-side account records are retained only while your account is active and are completely purged upon account deletion.',
      },
      {
        heading: '5. Children’s Privacy (18+ Requirement)',
        body: 'PathWise and StudyOS are designed exclusively for higher education students enrolled in colleges and universities who are at least 18 years of age. In compliance with Section 9 of the DPDP Act 2023, the app is not directed at children under 18, and we do not knowingly collect personal data from minors.',
      },
      {
        heading: '6. How to Request Data Deletion',
        body: 'You have full control over your data:\n• In-App Deletion: Go to Settings > Danger Zone > "Delete My Account". Confirming with "DELETE" will permanently purge your MongoDB account records, all local storage, ERP caches, and Clerk session.\n• Email Request: Contact privacy@pathwise.in from your registered email for manual erasure within 7 business days.',
      },
      {
        heading: '7. Grievance Officer & Contact',
        body: 'For privacy concerns or statutory inquiries under DPDP Act 2023, reach out to our Grievance Officer at privacy@pathwise.in. General support is available at support@pathwise.in.',
      },
    ],
  },

  terms: {
    id: 'terms',
    title: 'Terms of Service',
    lastUpdated: 'September 26, 2026',
    summary: 'Terms governing your use of PathWise and the StudyOS college platform.',
    sections: [
      {
        heading: '1. Acceptance of Terms & Eligibility',
        body: 'By creating an account, signing in, or using the app, you enter into a legally binding agreement under the laws of India. You must be at least 18 years of age and an enrolled college/university student to use PathWise and StudyOS.',
      },
      {
        heading: '2. Educational Aid & Academic Disclaimer',
        body: '• The AI tutor, doubt solver, and syllabus roadmaps are educational supplements and study aids only. They are NOT official replacements for accredited university lectures, faculty advice, or textbooks.\n• Generative AI outputs may occasionally contain errors or hallucinations. You are responsible for independently verifying all AI responses against your official university textbooks and faculty instructions.\n• PathWise is not liable for academic grades, exam performance, or official evaluations.',
      },
      {
        heading: '3. User Responsibilities & Acceptable Use',
        body: '• Only enter your own valid university credentials; accessing other students’ accounts is strictly prohibited.\n• Do not share or sell your account.\n• Class Representative (CR) Portal: CRs have elevated privileges to post assignments and notices. Misusing this portal to post false, defamatory, or harmful material will result in immediate termination of CR privileges and account suspension.\n• Reverse engineering, automated API scraping, and malicious prompt injections are strictly forbidden.',
      },
      {
        heading: '4. Subscriptions & Downgrades',
        body: '• Pro subscriptions are billed via Razorpay and renew automatically unless cancelled.\n• You can cancel anytime via Profile > Manage Subscription > Cancel Subscription.\n• On cancellation or downgrade, your account reverts to the Free Tier. All your personal notes, roadmaps, and attendance data remain safely intact.',
      },
      {
        heading: '5. Limitation of Liability',
        body: 'The Service is provided "AS IS" and "AS AVAILABLE". PathWise is not liable for university ERP downtime, captcha changes, network failures, or academic consequences. In all cases, our maximum cumulative liability is limited to the amount paid by you in the preceding 3 months, or INR 1,000, whichever is less.',
      },
      {
        heading: '6. Account Termination & Governing Law',
        body: 'We reserve the right to suspend or terminate accounts that violate these terms or abuse AI resources. These Terms are governed by the laws of the Republic of India, and any legal disputes shall be subject to the exclusive jurisdiction of the competent courts in New Delhi, India.',
      },
    ],
  },

  refund: {
    id: 'refund',
    title: 'Refund & Cancellation Policy',
    lastUpdated: 'September 26, 2026',
    summary: 'Guidelines for subscription cancellations and Razorpay refund requests.',
    sections: [
      {
        heading: '1. How to Cancel Your Subscription',
        body: 'You can cancel your subscription at any time within the app:\n1. Open PathWise or StudyOS and go to your Profile screen.\n2. Tap "Manage Subscription" and select "Cancel Subscription".\n3. Your Pro benefits remain active until the end of your currently paid billing period, with no future renewals or charges.',
      },
      {
        heading: '2. Refund Eligibility Window',
        body: '• 7-Day Satisfaction Guarantee: First-time subscription buyers can request a full refund within seven (7) calendar days of initial purchase.\n• Technical Deductions: If a payment was deducted by Razorpay but Pro status was not activated due to network error, a 100% refund will be issued promptly.\n• Fair Usage: Accounts that have consumed excessive AI tokens (>80% of quota) within the 7-day period may be ineligible for a full refund.',
      },
      {
        heading: '3. Ineligible Cases',
        body: 'Refunds are not granted for recurring renewals where cancellation was not requested prior to the billing date, partial-month usage after the 7-day window, or accounts suspended for terms violations.',
      },
      {
        heading: '4. How to Request a Refund',
        body: 'To request a refund, email support@pathwise.in or billing@pathwise.in with your registered account email, Razorpay Payment ID / Order ID, and reason for refund. Requests are reviewed within 24–48 hours.',
      },
      {
        heading: '5. Processing Time',
        body: 'Approved refunds are processed via the Razorpay API directly back to your original payment method:\n• UPI (GPay, PhonePe, Paytm): 24 to 48 hours.\n• Debit/Credit Cards & Net Banking: 5 to 7 business days as per standard banking cycles.',
      },
    ],
  },
};
