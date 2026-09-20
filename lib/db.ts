import { useAuth, useUser } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Use localhost for emulator, or your local IP for physical device testing
// In production, this would be your hosted backend URL (e.g., Render, Heroku)
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.100:5000/api';

export interface UserData {
  clerkUserId: string;
  uid?: string;
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
  pdf_key: string | null;
  pdf_download_url: string | null;
  pdf_filename: string | null;
  status: 'pending' | 'submitted';
  createdAt: string;
}

export async function syncUserWithDB(
  clerkId: string,
  section_code?: string,
  uid?: string
): Promise<UserData> {
  const res = await fetch(`${API_URL}/user/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clerk-user-id': clerkId
    },
    body: JSON.stringify({ section_code, uid })
  });
  
  if (res.status === 409) {
    const data = await res.json();
    const err = new Error(data.message || 'This UIMS account is already linked to another PathWise account.') as any;
    err.code = 'UID_ALREADY_LINKED';
    throw err;
  }
  
  if (!res.ok) throw new Error('Failed to sync user');
  return res.json();
}

export async function deleteUserFromDB(clerkId: string): Promise<void> {
  const res = await fetch(`${API_URL}/user`, {
    method: 'DELETE',
    headers: { 'x-clerk-user-id': clerkId }
  });
  if (!res.ok) throw new Error('Failed to delete user from DB');
}

export async function updateUserSubscription(clerkId: string, is_premium: boolean, plan?: string): Promise<UserData> {
  const res = await fetch(`${API_URL}/user/subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clerk-user-id': clerkId
    },
    body: JSON.stringify({ is_premium, plan })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update subscription in DB');
  return data.user;
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

export async function createRazorpayOrder(clerkId: string, planId: string, token?: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  else headers['x-clerk-user-id'] = clerkId;

  const res = await fetch(`${API_URL}/payment/create-order`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan_id: planId })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create order');
  return data;
}

export interface NotificationData {
  _id: string;
  title: string;
  message: string;
  section_code: string;
  created_by: string;
  expiresAt: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification API
// ─────────────────────────────────────────────────────────────────────────────

export interface SaturdayOverrideData {
  _id: string;
  date: string;
  mapped_day: string;
  section_code: string;
  created_by: string;
}

export async function fetchSaturdayOverrides(clerkId: string, section_code?: string): Promise<SaturdayOverrideData[]> {
  if (!section_code) return [];
  try {
    const res = await fetch(`${API_URL}/saturday-override?section_code=${encodeURIComponent(section_code)}`, {
      headers: { 'x-clerk-user-id': clerkId }
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function setSaturdayOverride(clerkId: string, date: string, mapped_day: string, section_code: string): Promise<SaturdayOverrideData> {
  const res = await fetch(`${API_URL}/saturday-override`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clerk-user-id': clerkId
    },
    body: JSON.stringify({ date, mapped_day, section_code })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to set override');
  return data;
}

export async function deleteSaturdayOverride(clerkId: string, overrideId: string): Promise<void> {
  const res = await fetch(`${API_URL}/saturday-override/${overrideId}`, {
    method: 'DELETE',
    headers: { 'x-clerk-user-id': clerkId }
  });
  if (!res.ok) throw new Error('Failed to delete override');
}

export async function fetchNotifications(clerkId: string, section?: string): Promise<NotificationData[]> {
  try {
    const url = section ? `${API_URL}/notifications?section=${encodeURIComponent(section)}` : `${API_URL}/notifications`;
    const res = await fetch(url, {
      headers: { 'x-clerk-user-id': clerkId }
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function createNotification(clerkId: string, title: string, message: string, expiresAt: string, section_code: string): Promise<NotificationData> {
  const res = await fetch(`${API_URL}/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clerk-user-id': clerkId
    },
    body: JSON.stringify({ title, message, expiresAt, section_code })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create notification');
  return data;
}

export async function deleteNotification(clerkId: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/notifications/${id}`, {
    method: 'DELETE',
    headers: { 'x-clerk-user-id': clerkId }
  });
  if (!res.ok) throw new Error('Failed to delete notification');
}

// ─── Assignment API ──────────────────────────────────────────────────────────

export async function fetchAssignments(clerkId: string, section?: string): Promise<AssignmentData[]> {
  try {
    const url = section ? `${API_URL}/assignments?section=${encodeURIComponent(section)}` : `${API_URL}/assignments`;
    const res = await fetch(url, {
      headers: { 'x-clerk-user-id': clerkId }
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchSections(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/sections`);
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

export function uploadPdf(clerkId: string, file: { uri: string; name: string; type: string }): Promise<{ pdf_key: string; pdf_filename: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/assignments/upload-pdf`);
    xhr.setRequestHeader('x-clerk-user-id', clerkId);
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          reject(new Error('Invalid JSON response from server'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || 'Upload failed'));
        } catch (e) {
          reject(new Error('Upload failed with status ' + xhr.status));
        }
      }
    };
    
    xhr.onerror = () => {
      reject(new Error('Network request failed for file upload'));
    };

    const formData = new FormData();
    // React Native FormData requires exactly these properties
    formData.append('file', {
      uri: Platform.OS === 'android' ? file.uri : file.uri.replace('file://', ''),
      name: file.name,
      type: file.type || 'application/pdf'
    } as any);

    xhr.send(formData);
  });
}

export async function createAssignment(clerkId: string, payload: {
  title: string; subject: string; description: string;
  dueDate: string; pdf_key?: string; pdf_filename?: string;
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

// Hook to get the user's DB profile and automatically keep DB subscription in sync with Clerk
export function useDBProfile() {
  const { userId } = useAuth();
  const { user } = useUser();
  const [dbUser, setDbUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId && user) {
      syncUserWithDB(
        userId,
        undefined,
        user.unsafeMetadata?.studyOsId as string
      )
        .then(setDbUser)
        .catch((e) => console.log('DB Sync failed, backend might be offline:', e.message))
        .finally(() => setLoading(false));
    } else if (!userId) {
      setDbUser(null);
      setLoading(false);
    }
  }, [userId, user?.unsafeMetadata?.studyOsId]);

  return { dbUser, loading, setDbUser };
}

// ==========================================
// 🪙 REWARD SYSTEM API FUNCTIONS
// ==========================================

export interface RewardStatus {
  token_balance: number;
  ads_watched_today: number;
  ads_remaining_today: number;
  max_ads_per_day: number;
  tokens_per_ad: number;
  premium_expires_at: number | null;
  is_reward_premium_active: boolean;
  trial_started_at: string | null; // ISO date from server
  plans: {
    one_day:   { tokens: number; days: number };
    one_week:  { tokens: number; days: number };
    two_weeks: { tokens: number; days: number };
    one_month: { tokens: number; days: number };
  };
}

export async function getRewardStatus(clerkId: string, token?: string | null): Promise<RewardStatus> {
  const headers: Record<string, string> = { 'x-clerk-user-id': clerkId };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/rewards/status`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) throw new Error('Failed to fetch reward status');
  return res.json();
}

export async function claimDailyBonus(clerkId: string, token?: string | null): Promise<{
  success: boolean;
  tokens_earned: number;
  token_balance: number;
  ads_watched_today: number;
  ads_remaining_today: number;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-clerk-user-id': clerkId,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/rewards/daily-bonus`, {
    method: 'POST',
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message || 'Failed'), { code: data.error });
  return data;
}

export async function claimAdReward(clerkId: string, adType: string, token?: string | null): Promise<{
  success: boolean;
  tokens_earned: number;
  token_balance: number;
  ads_watched_today: number;
  ads_remaining_today: number;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-clerk-user-id': clerkId,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/rewards/watch-ad`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ad_type: adType }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message || 'Failed'), { code: data.error });
  return data;
}

export async function redeemTokensForPremium(clerkId: string, plan: 'one_day' | 'one_week' | 'two_weeks' | 'one_month', token?: string | null): Promise<{
  success: boolean;
  tokens_spent: number;
  days_added: number;
  token_balance: number;
  premium_expires_at: number;
  message: string;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-clerk-user-id': clerkId,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/rewards/redeem`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan_key: plan }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message || 'Failed'), { code: data.error });
  return data;
}
