import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';

// Use localhost for emulator, or your local IP for physical device testing
// In production, this would be your hosted backend URL (e.g., Render, Heroku)
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.100:5000/api';

export interface UserData {
  clerkUserId: string;
  email: string;
  app_first_opened_date: string;
  free_ai_subject_id: string | null;
  is_premium: boolean;
  role: 'student' | 'cr' | 'admin';
  section_code: string | null;
}

export interface AssignmentData {
  _id: string;
  title: string;
  subject: string;
  description: string;
  dueDate: string;
  section_code: string;
  created_by: string;
  pdf_url: string | null;
  pdf_filename: string | null;
  status: 'pending' | 'submitted';
  createdAt: string;
}

export async function syncUserWithDB(clerkId: string, email?: string): Promise<UserData> {
  const res = await fetch(`${API_URL}/user/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clerk-user-id': clerkId
    },
    body: JSON.stringify({ email })
  });
  
  if (!res.ok) throw new Error('Failed to sync user');
  return res.json();
}

export async function setFreeAISubject(clerkId: string, subjectId: string): Promise<UserData> {
  const res = await fetch(`${API_URL}/user/set-free-subject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clerk-user-id': clerkId
    },
    body: JSON.stringify({ subjectId })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to set free subject');
  return data.user;
}

export async function createRazorpayOrder(clerkId: string): Promise<any> {
  const res = await fetch(`${API_URL}/payment/create-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clerk-user-id': clerkId
    }
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create order');
  return data;
}

// ─── Assignment API ──────────────────────────────────────────────────────────

export async function fetchAssignments(clerkId: string): Promise<AssignmentData[]> {
  try {
    const res = await fetch(`${API_URL}/assignments`, {
      headers: { 'x-clerk-user-id': clerkId }
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function toggleAssignment(clerkId: string, assignmentId: string): Promise<'pending' | 'submitted'> {
  const res = await fetch(`${API_URL}/assignments/${assignmentId}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-clerk-user-id': clerkId }
  });
  const data = await res.json();
  return data.status;
}

export async function uploadPdf(clerkId: string, file: { uri: string; name: string; type: string }): Promise<{ pdf_url: string; pdf_filename: string }> {
  const formData = new FormData();
  formData.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
  const res = await fetch(`${API_URL}/assignments/upload-pdf`, {
    method: 'POST',
    headers: { 'x-clerk-user-id': clerkId },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export async function createAssignment(clerkId: string, payload: {
  title: string; subject: string; description: string;
  dueDate: string; pdf_url?: string; pdf_filename?: string;
}): Promise<AssignmentData> {
  const res = await fetch(`${API_URL}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-clerk-user-id': clerkId },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create assignment');
  return data.assignment;
}

export async function deleteAssignment(clerkId: string, assignmentId: string): Promise<void> {
  await fetch(`${API_URL}/assignments/${assignmentId}`, {
    method: 'DELETE',
    headers: { 'x-clerk-user-id': clerkId }
  });
}

// ─── Hook ────────────────────────────────────────────────────────────────────

// Hook to get the user's DB profile
export function useDBProfile() {
  const { userId } = useAuth();
  const [dbUser, setDbUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      syncUserWithDB(userId)
        .then(setDbUser)
        .catch((e) => console.log('DB Sync failed, backend might be offline:', e.message))
        .finally(() => setLoading(false));
    } else {
      setDbUser(null);
      setLoading(false);
    }
  }, [userId]);

  return { dbUser, loading, setDbUser };
}
