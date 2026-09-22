import { useUser } from '@clerk/clerk-expo';
import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRewardStatus } from '../lib/db';

const TRIAL_DAYS = 30; // 30-day free trial for new users
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// In-memory cache by user ID so trial start date is immediately available across renders
const memoryTrialStartCache: Record<string, string> = {};

export function useSubscription() {
  const { user } = useUser();

  const [cachedTrialDate, setCachedTrialDate] = useState<string | null>(
    user?.id ? (memoryTrialStartCache[user.id] || null) : null
  );

  useEffect(() => {
    if (!user?.id) return;
    if (memoryTrialStartCache[user.id]) {
      setCachedTrialDate(memoryTrialStartCache[user.id]);
      return;
    }
    AsyncStorage.getItem(`@pathwise_trial_start_${user.id}`).then((val) => {
      if (val) {
        memoryTrialStartCache[user.id] = val;
        setCachedTrialDate(val);
      }
    }).catch(() => {});
  }, [user?.id]);

  const { data: rewardStatus } = useQuery({
    queryKey: ['rewardStatus', user?.id],
    queryFn: () => getRewardStatus(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 mins
  });

  useEffect(() => {
    if (user?.id && rewardStatus?.trial_started_at) {
      memoryTrialStartCache[user.id] = rewardStatus.trial_started_at;
      AsyncStorage.setItem(`@pathwise_trial_start_${user.id}`, rewardStatus.trial_started_at).catch(() => {});
      
      // Sync to Clerk metadata so it is available synchronously on app boot
      if (user.unsafeMetadata?.trial_started_at !== rewardStatus.trial_started_at) {
        user.update({
          unsafeMetadata: {
            ...user.unsafeMetadata,
            trial_started_at: rewardStatus.trial_started_at,
          }
        }).catch(() => {});
      }
    }
  }, [user, rewardStatus?.trial_started_at]);

  const subscriptionStatus = useMemo(() => {
    if (!user) {
      return {
        isPro: false,
        trialDaysLeft: 0,
        isTrialActive: false,
        isRewardPro: false,
        isSubscriptionRequired: true,
        plan: null,
        subscriptionDaysLeft: 0,
      };
    }

    let isSubscribed = !!user.unsafeMetadata?.isSubscribed;
    
    // Priority: Server response -> Clerk metadata (cached in session) -> Local AsyncStorage/Memory -> Fallback
    const effectiveTrialStartStr =
      rewardStatus?.trial_started_at ||
      (user.unsafeMetadata?.trial_started_at as string) ||
      cachedTrialDate ||
      (user.id ? memoryTrialStartCache[user.id] : null);

    const trialStartedAt = effectiveTrialStartStr
      ? new Date(effectiveTrialStartStr)
      : new Date(user.createdAt || Date.now());

    const now = new Date();
    const diffMs = now.getTime() - trialStartedAt.getTime();
    const daysSinceTrialStart = Math.floor(diffMs / MS_PER_DAY);
    const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSinceTrialStart);
    const isTrialActive = trialDaysLeft > 0;

    let subscriptionDaysLeft = 0;
    const rawPlan = (user.unsafeMetadata?.plan as string) || (isSubscribed ? 'pro' : null);

    if (isSubscribed) {
      const expiry = user.unsafeMetadata?.subscriptionExpiry as number;
      if (expiry && !isNaN(expiry)) {
        const diffSubMs = expiry - now.getTime();
        subscriptionDaysLeft = Math.max(0, Math.ceil(diffSubMs / MS_PER_DAY));
        if (diffSubMs <= 0) {
          isSubscribed = false;
        }
      } else {
        // Fallback for active subscriptions without explicit expiry saved yet
        const planDays = rawPlan === 'yearly' ? 365 : rawPlan === 'semester' ? 180 : 30;
        subscriptionDaysLeft = planDays;
      }
    }

    const isRewardPro = !!rewardStatus?.is_reward_premium_active;
    const isPro = isSubscribed || isTrialActive || isRewardPro;
    const plan = isSubscribed ? rawPlan : (isRewardPro ? 'reward' : null);

    return {
      isPro,
      trialDaysLeft,
      isTrialActive,
      isSubscribed,
      isRewardPro,
      isSubscriptionRequired: !isPro, // if neither subscribed nor in trial nor reward premium
      plan,
      subscriptionDaysLeft,
    };
  }, [user, user?.unsafeMetadata, rewardStatus]);

  return subscriptionStatus;
}
