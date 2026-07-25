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

// Hook to get the user's DB profile
export function useDBProfile() {
  const { userId } = useAuth();
  const [dbUser, setDbUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      syncUserWithDB(userId)
        .then(setDbUser)
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setDbUser(null);
      setLoading(false);
    }
  }, [userId]);

  return { dbUser, loading, setDbUser };
}
