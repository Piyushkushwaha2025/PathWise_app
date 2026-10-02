import { useAuth, useUser } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStudyOSStore } from '../store/studyosStore';

// Use localhost for emulator, or your local IP for physical device testing
// In production, this would be your hosted backend URL (e.g., Render, Heroku)
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.100:5000/api';

export interface UserData {
  clerkUserId: string;
  uid?: string;
  name?: string;
  semester?: string;
  app_first_opened_date?: string;
  free_ai_subject_id: string | null;
  is_premium: boolean;
  role: 'student' | 'cr' | 'admin';
  section_code: string | null;
  trial_started_at?: string;
  token_balance?: number;
  subscription_plan?: string;
}

export interface UserSyncPayload {
  section_code?: string;
  uid?: string;
  expoPushToken?: string;
  name?: string;
  semester?: string;
  email?: string;
  trial_started_at?: string;
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

async function safeJsonParse(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text || text.trim().startsWith('<')) {
      return null;
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ─── Global Auth Token Bridge ────────────────────────────────────────────────
let _authTokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  _authTokenGetter = getter;
}

export async function getAuthToken(): Promise<string | null> {
  if (_authTokenGetter) {
    try {
      return await _authTokenGetter();
    } catch {
      return null;
    }
  }
  return null;
}

export async function getAuthHeaders(clerkId: string, explicitToken?: string | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-clerk-user-id': clerkId,
  };
  const token = explicitToken || await getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function syncUserWithDB(
  clerkId: string,
  sectionOrPayload?: string | UserSyncPayload,
  uid?: string,
  expoPushToken?: string
): Promise<UserData> {
  try {
    const payload: UserSyncPayload =
      typeof sectionOrPayload === 'object' && sectionOrPayload !== null
        ? sectionOrPayload
        : { section_code: sectionOrPayload, uid, expoPushToken };

    const headers = await getAuthHeaders(clerkId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`${API_URL}/user/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
    
    const data = await safeJsonParse(res);

    if (res.status === 409) {
      const err = new Error(data?.message || 'This college ID is already linked to another PathWise account.') as any;
      err.code = data?.error || 'UID_ALREADY_LINKED';
      err.boundUid = data?.boundUid;
      throw err;
    }
    
    if (!res.ok || !data) throw new Error('Failed to sync user');
    const trialAt = data?.trial_started_at || data?.user?.trial_started_at;
    if (trialAt) {
      AsyncStorage.setItem(`@pathwise_trial_start_${clerkId}`, trialAt).catch(() => {});
    }
    return data;
  } catch (err: any) {
    if (err?.code === 'UID_ALREADY_LINKED' || err?.code === 'ACCOUNT_ALREADY_BOUND') throw err;
    console.warn('syncUserWithDB non-fatal error:', err?.message);
    throw new Error(err?.code ? err.message : 'Unable to sync user data right now.');
  }
}

export async function deleteUserAccountWithDB(
  clerkId: string,
  email?: string,
  trialStartedAt?: string
): Promise<void> {
  try {
    const headers = await getAuthHeaders(clerkId);
    await fetch(`${API_URL}/user/delete-account`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, trial_started_at: trialStartedAt }),
    });
  } catch (e: any) {
    console.warn('deleteUserAccountWithDB non-fatal notice:', e?.message);
  }
}

export async function verifyUidWithDB(
  clerkId: string,
  uid: string
): Promise<{ allowed: boolean; boundUid: string | null }> {
  try {
    const headers = await getAuthHeaders(clerkId);
    const res = await fetch(`${API_URL}/user/verify-uid`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ uid })
    });

    const data = await safeJsonParse(res);

    if (res.status === 409 || (data && data.allowed === false)) {
      const err = new Error(data?.message || data?.error || 'This college ID is already linked to another PathWise account.') as any;
      err.code = data?.error || 'UID_NOT_ALLOWED';
      err.boundUid = data?.boundUid;
      throw err;
    }

    if (!res.ok) {
      console.warn('verify-uid non-ok response status:', res.status);
      return { allowed: true, boundUid: null };
    }

    return data || { allowed: true, boundUid: null };
  } catch (err: any) {
    if (err?.code === 'UID_NOT_ALLOWED' || err?.code === 'UID_ALREADY_LINKED' || err?.code === 'ACCOUNT_ALREADY_BOUND') {
      throw err;
    }
    console.warn('verifyUidWithDB bypassed due to network/server condition:', err?.message);
    return { allowed: true, boundUid: null };
  }
}

export async function savePushToken(clerkId: string, expoPushToken: string): Promise<boolean> {
  try {
    const headers = await getAuthHeaders(clerkId);
    const res = await fetch(`${API_URL}/user/push-token`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ expoPushToken })
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to save push token:', e);
    return false;
  }
}

export async function deleteUserFromDB(clerkId: string): Promise<void> {
  const headers = await getAuthHeaders(clerkId);
  const res = await fetch(`${API_URL}/user`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok) throw new Error('Failed to delete user from DB');
}

export async function updateUserSubscription(clerkId: string, is_premium: boolean, plan?: string): Promise<UserData> {
  const headers = await getAuthHeaders(clerkId);
  const res = await fetch(`${API_URL}/user/subscription`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ is_premium, plan })
  });
  
  const data = await safeJsonParse(res);
  if (!res.ok || !data) throw new Error(data?.error || 'Failed to update subscription in DB');
  return data.user;
}

export async function setFreeAISubject(clerkId: string, subjectId: string): Promise<UserData> {
  const headers = await getAuthHeaders(clerkId);
  const res = await fetch(`${API_URL}/user/set-free-subject`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ subjectId })
  });
  
  const data = await safeJsonParse(res);
  if (!res.ok || !data) throw new Error(data?.error || 'Failed to set free subject');
  return data.user;
}

export async function createRazorpayOrder(clerkId: string, planId: string, token?: string | null): Promise<any> {
  const headers = await getAuthHeaders(clerkId, token);

  const res = await fetch(`${API_URL}/payment/create-order`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan_id: planId })
  });
  
  const data = await safeJsonParse(res);
  if (!res.ok || !data) throw new Error(data?.error || 'Failed to create order');
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
    const headers = await getAuthHeaders(clerkId);
    const res = await fetch(`${API_URL}/saturday-override?section_code=${encodeURIComponent(section_code)}`, {
      headers,
    });
    if (!res.ok) return [];
    return (await safeJsonParse(res)) || [];
  } catch {
    return [];
  }
}

export async function setSaturdayOverride(clerkId: string, date: string, mapped_day: string, section_code: string): Promise<SaturdayOverrideData> {
  const headers = await getAuthHeaders(clerkId);
  const res = await fetch(`${API_URL}/saturday-override`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ date, mapped_day, section_code })
  });
  const data = await safeJsonParse(res);
  if (!res.ok || !data) throw new Error(data?.error || 'Failed to set override');
  return data;
}

export async function deleteSaturdayOverride(clerkId: string, overrideId: string): Promise<void> {
  const headers = await getAuthHeaders(clerkId);
  const res = await fetch(`${API_URL}/saturday-override/${overrideId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error('Failed to delete override');
}

export async function fetchNotifications(clerkId: string, section?: string): Promise<NotificationData[]> {
  try {
    const url = section ? `${API_URL}/notifications?section=${encodeURIComponent(section)}` : `${API_URL}/notifications`;
    const headers = await getAuthHeaders(clerkId);
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    return (await safeJsonParse(res)) || [];
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
  const headers = await getAuthHeaders(clerkId);
  const res = await fetch(`${API_URL}/notifications`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, message, expiresAt, section_code, pdf_key, pdf_filename })
  });
  const data = await safeJsonParse(res);
  if (!res.ok || !data) throw new Error(data?.error || 'Failed to create notification');
  return data;
}

export async function deleteNotification(clerkId: string, id: string): Promise<void> {
  const headers = await getAuthHeaders(clerkId);
  const res = await fetch(`${API_URL}/notifications/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error('Failed to delete notification');
}

// ─── Assignment API ──────────────────────────────────────────────────────────

export async function fetchAssignments(clerkId: string, section?: string): Promise<AssignmentData[]> {
  try {
    const url = section ? `${API_URL}/assignments?section=${encodeURIComponent(section)}` : `${API_URL}/assignments`;
    const headers = await getAuthHeaders(clerkId);
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    return (await safeJsonParse(res)) || [];
  } catch {
    return [];
  }
}

export async function fetchSections(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/sections`);
    if (!res.ok) return [];
    return (await safeJsonParse(res)) || [];
  } catch {
    return [];
  }
}

export async function toggleAssignment(clerkId: string, assignmentId: string): Promise<'pending' | 'submitted'> {
  const headers = await getAuthHeaders(clerkId);
  const res = await fetch(`${API_URL}/assignments/${assignmentId}/toggle`, {
    method: 'POST',
    headers,
  });
  const data = await safeJsonParse(res);
  return data?.status || 'pending';
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
    // Also inject JWT if available (required by sensitive path check)
    getAuthToken().then(token => {
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
    }).catch(() => {});

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
    const presignedHeaders = await getAuthHeaders(clerkId);
    const presignedRes = await fetch(`${API_URL}/assignments/get-upload-url`, {
      method: 'POST',
      headers: presignedHeaders,
      body: JSON.stringify({
        filename: file.name || 'document.pdf',
        contentType: resolvedMime,
      }),
    });

    if (presignedRes.ok) {
      const data = await safeJsonParse(presignedRes);
      if (data?.uploadUrl && data?.key) {
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
  section_code?: string;
}): Promise<AssignmentData> {
  const headers = await getAuthHeaders(clerkId);
  const res = await fetch(`${API_URL}/assignments`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const data = await safeJsonParse(res);
  if (!res.ok || !data) throw new Error(data?.error || 'Failed to create assignment');
  return data.assignment;
}

export async function deleteAssignment(clerkId: string, assignmentId: string): Promise<void> {
  const headers = await getAuthHeaders(clerkId);
  await fetch(`${API_URL}/assignments/${assignmentId}`, {
    method: 'DELETE',
    headers,
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
    if (userId) {
      const email = user?.primaryEmailAddress?.emailAddress;
      const name = user?.fullName || (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : undefined) || undefined;
      const stProfile = useStudyOSStore.getState().profile;

      syncUserWithDB(userId, {
        section_code: stProfile?.section || undefined,
        uid: (stProfile?.uid && stProfile.uid !== 'Unknown' && stProfile.uid !== 'Error') ? stProfile.uid : (user?.unsafeMetadata?.studyOsId as string || undefined),
        name: stProfile?.name || name || undefined,
        semester: stProfile?.semester || undefined,
      })
        .then(setDbUser)
        .catch((e) => console.log('DB Sync failed, backend might be offline:', e.message))
        .finally(() => setLoading(false));
    } else if (!userId) {
      setDbUser(null);
      setLoading(false);
    }
  }, [userId, user?.id, user?.primaryEmailAddress?.emailAddress]);

  return { dbUser, loading, setDbUser };
}

// ==========================================
// 🪙 REWARD SYSTEM API FUNCTIONS
// ==========================================

export interface RewardStatus {
  token_balance: number;
  daily_claimed_today?: boolean;
  last_daily_bonus_date?: string | null;
  ads_watched_today: number;
  ads_remaining_today: number;
  max_ads_per_day: number;
  tokens_per_ad: number;
  premium_expires_at: number | null;
  is_premium?: boolean;
  subscription_plan?: string;
  is_paid_active?: boolean;
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
  daily_claimed_today: false,
  last_daily_bonus_date: null,
  ads_watched_today: 0,
  ads_remaining_today: 5,
  max_ads_per_day: 5,
  tokens_per_ad: 10,
  premium_expires_at: null,
  is_premium: false,
  subscription_plan: 'free',
  is_paid_active: false,
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
  const headers = await getAuthHeaders(clerkId, token);

  try {
    let res = await fetch(`${API_URL}/rewards/status`, {
      method: 'GET',
      headers,
    });

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

    const data = await safeJsonParse(res);
    if (!data) return DEFAULT_REWARD_STATUS;
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
  const headers = await getAuthHeaders(clerkId, token);

  let res = await fetch(`${API_URL}/rewards/daily-bonus`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ clerkUserId: clerkId }),
  });

  if (res.status === 401 || res.status === 404) {
    try {
      await syncUserWithDB(clerkId);
      const freshToken = await getAuthToken();
      const freshHeaders = await getAuthHeaders(clerkId, freshToken);
      res = await fetch(`${API_URL}/rewards/daily-bonus`, {
        method: 'POST',
        headers: freshHeaders,
        body: JSON.stringify({ clerkUserId: clerkId }),
      });
    } catch {}
  }

  const data = await safeJsonParse(res);
  if (!res.ok || !data) throw Object.assign(new Error(data?.message || 'Daily bonus temporarily unavailable.'), { code: data?.error });
  return data;
}

export async function claimAdReward(clerkId: string, adType: string, token?: string | null): Promise<{
  success: boolean;
  tokens_earned: number;
  token_balance: number;
  ads_watched_today: number;
  ads_remaining_today: number;
}> {
  const headers = await getAuthHeaders(clerkId, token);

  let res = await fetch(`${API_URL}/rewards/watch-ad`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ad_type: adType }),
  });

  if (res.status === 401 || res.status === 404) {
    try {
      await syncUserWithDB(clerkId);
      const freshToken = await getAuthToken();
      const freshHeaders = await getAuthHeaders(clerkId, freshToken);
      res = await fetch(`${API_URL}/rewards/watch-ad`, {
        method: 'POST',
        headers: freshHeaders,
        body: JSON.stringify({ ad_type: adType }),
      });
    } catch {}
  }

  const data = await safeJsonParse(res);
  if (!res.ok || !data) throw Object.assign(new Error(data?.message || 'Reward temporarily unavailable.'), { code: data?.error });
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
  const headers = await getAuthHeaders(clerkId, token);

  let res = await fetch(`${API_URL}/rewards/redeem`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan_key: plan }),
  });

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

  const data = await safeJsonParse(res);
  if (!res.ok || !data) throw Object.assign(new Error(data?.message || 'Redemption failed.'), { code: data?.error });
  return data;
}
