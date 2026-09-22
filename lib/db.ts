import { useAuth, useUser } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  uid?: string,
  expoPushToken?: string
): Promise<UserData> {
  const res = await fetch(`${API_URL}/user/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clerk-user-id': clerkId
    },
    body: JSON.stringify({ section_code, uid, expoPushToken })
  });
  
  if (res.status === 409) {
    const data = await res.json();
    const err = new Error(data.message || 'This college ID is already linked to another PathWise account.') as any;
    err.code = data.error || 'UID_ALREADY_LINKED';
    err.boundUid = data.boundUid;
    throw err;
  }
  
  if (!res.ok) throw new Error('Failed to sync user');
  const data = await res.json();
  if (data?.user?.trial_started_at) {
    AsyncStorage.setItem(`@pathwise_trial_start_${clerkId}`, data.user.trial_started_at).catch(() => {});
  }
  return data;
}

export async function verifyUidWithDB(
  clerkId: string,
  uid: string
): Promise<{ allowed: boolean; boundUid: string | null }> {
  const res = await fetch(`${API_URL}/user/verify-uid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clerk-user-id': clerkId
    },
    body: JSON.stringify({ uid })
  });

  const data = await res.json();
  if (res.status === 409 || !res.ok) {
    const err = new Error(data.message || data.error || 'UID verification failed') as any;
    err.code = data.error || 'UID_NOT_ALLOWED';
    err.boundUid = data.boundUid;
    throw err;
  }
  return data;
}

export async function savePushToken(clerkId: string, expoPushToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/user/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-clerk-user-id': clerkId
      },
      body: JSON.stringify({ expoPushToken })
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to save push token:', e);
    return false;
  }
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
  pdf_key?: string | null;
  pdf_filename?: string | null;
  pdf_download_url?: string | null;
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

export async function createNotification(
  clerkId: string, 
  title: string, 
  message: string, 
  expiresAt: string, 
  section_code: string,
  pdf_key?: string,
  pdf_filename?: string
): Promise<NotificationData> {
  const res = await fetch(`${API_URL}/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clerk-user-id': clerkId
    },
    body: JSON.stringify({ title, message, expiresAt, section_code, pdf_key, pdf_filename })
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

function inferClientMimeType(name: string, fallbackType?: string): string {
  const ext = (name || '').toLowerCase().split('.').pop() || '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  return map[ext] || (fallbackType && fallbackType !== 'application/octet-stream' ? fallbackType : 'application/pdf');
}

function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      resolve(xhr.response);
    };
    xhr.onerror = function () {
      reject(new Error('Failed to read file from storage'));
    };
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

function uploadBlobDirectToStorage(uploadUrl: string, blob: Blob, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Storage direct upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => {
      reject(new Error('Network error uploading file directly to storage'));
    };
    xhr.send(blob);
  });
}

function fallbackServerUpload(clerkId: string, file: { uri: string; name: string; type?: string }, resolvedMime: string): Promise<{ pdf_key: string; pdf_filename: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/assignments/upload-pdf`);
    xhr.setRequestHeader('x-clerk-user-id', clerkId);

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid JSON response from server'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed with status ' + xhr.status));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network request failed for file upload'));
    };

    const formData = new FormData();
    formData.append('file', {
      uri: Platform.OS === 'android' ? file.uri : file.uri.replace('file://', ''),
      name: file.name || 'document.pdf',
      type: resolvedMime
    } as any);

    xhr.send(formData);
  });
}

export async function uploadPdf(clerkId: string, file: { uri: string; name: string; type?: string }): Promise<{ pdf_key: string; pdf_filename: string }> {
  const resolvedMime = inferClientMimeType(file.name, file.type);

  // Strategy 1: Direct Presigned S3/B2 Upload (Completely bypasses Vercel 4.5MB serverless limit)
  try {
    const presignedRes = await fetch(`${API_URL}/assignments/get-upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-clerk-user-id': clerkId,
      },
      body: JSON.stringify({
        filename: file.name || 'document.pdf',
        contentType: resolvedMime,
      }),
    });

    if (presignedRes.ok) {
      const data = await presignedRes.json();
      if (data.uploadUrl && data.key) {
        const blob = await uriToBlob(file.uri);
        await uploadBlobDirectToStorage(data.uploadUrl, blob, data.contentType || resolvedMime);
        return { pdf_key: data.key, pdf_filename: data.filename || file.name };
      }
    }
  } catch (directErr) {
    console.warn('Direct presigned upload failed, attempting fallback server upload:', directErr);
  }

  // Strategy 2: Fallback server proxy upload (if presigned upload fails)
  return fallbackServerUpload(clerkId, file, resolvedMime);
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

export const DEFAULT_REWARD_STATUS: RewardStatus = {
  token_balance: 0,
  ads_watched_today: 0,
  ads_remaining_today: 5,
  max_ads_per_day: 5,
  tokens_per_ad: 10,
  premium_expires_at: null,
  is_reward_premium_active: false,
  trial_started_at: null,
  plans: {
    one_day:   { tokens: 50,  days: 1 },
    one_week:  { tokens: 200, days: 7 },
    two_weeks: { tokens: 350, days: 14 },
    one_month: { tokens: 500, days: 30 },
  },
};

export async function getRewardStatus(clerkId: string, token?: string | null): Promise<RewardStatus> {
  const headers: Record<string, string> = { 'x-clerk-user-id': clerkId };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    let res = await fetch(`${API_URL}/rewards/status`, {
      method: 'GET',
      headers,
    });

    // If 401 (e.g. backend CLERK_SECRET_KEY missing/mismatched), retry using x-clerk-user-id
    if (res.status === 401 && headers['Authorization']) {
      delete headers['Authorization'];
      res = await fetch(`${API_URL}/rewards/status`, {
        method: 'GET',
        headers,
      });
    }

    // If user profile not initialized yet in DB, auto-sync and retry once
    if (res.status === 404) {
      try {
        await syncUserWithDB(clerkId);
        res = await fetch(`${API_URL}/rewards/status`, {
          method: 'GET',
          headers,
        });
      } catch (syncErr) {
        console.warn('Auto-sync on rewards status 404 failed:', syncErr);
      }
    }

    if (!res.ok) {
      console.warn(`[getRewardStatus] Server returned status ${res.status}, returning default status.`);
      return DEFAULT_REWARD_STATUS;
    }

    const data = await res.json();
    if (data?.trial_started_at) {
      AsyncStorage.setItem(`@pathwise_trial_start_${clerkId}`, data.trial_started_at).catch(() => {});
    }
    return data;
  } catch (err) {
    console.warn('[getRewardStatus] Network or server error, returning default fallback status:', err);
    return DEFAULT_REWARD_STATUS;
  }
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

  let res = await fetch(`${API_URL}/rewards/daily-bonus`, {
    method: 'POST',
    headers,
  });

  if (res.status === 401 && headers['Authorization']) {
    delete headers['Authorization'];
    res = await fetch(`${API_URL}/rewards/daily-bonus`, {
      method: 'POST',
      headers,
    });
  }

  if (res.status === 404) {
    try {
      await syncUserWithDB(clerkId);
      res = await fetch(`${API_URL}/rewards/daily-bonus`, {
        method: 'POST',
        headers,
      });
    } catch {}
  }

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

  let res = await fetch(`${API_URL}/rewards/watch-ad`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ad_type: adType }),
  });

  if (res.status === 401 && headers['Authorization']) {
    delete headers['Authorization'];
    res = await fetch(`${API_URL}/rewards/watch-ad`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ad_type: adType }),
    });
  }

  if (res.status === 404) {
    try {
      await syncUserWithDB(clerkId);
      res = await fetch(`${API_URL}/rewards/watch-ad`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ad_type: adType }),
      });
    } catch {}
  }

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

  let res = await fetch(`${API_URL}/rewards/redeem`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan_key: plan }),
  });

  if (res.status === 401 && headers['Authorization']) {
    delete headers['Authorization'];
    res = await fetch(`${API_URL}/rewards/redeem`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ plan_key: plan }),
    });
  }

  if (res.status === 404) {
    try {
      await syncUserWithDB(clerkId);
      res = await fetch(`${API_URL}/rewards/redeem`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ plan_key: plan }),
      });
    } catch {}
  }

  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message || 'Failed'), { code: data.error });
  return data;
}
