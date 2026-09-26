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

    const now = new Date();

    // Server-verified authoritative check for paid subscriptions
    const serverPaidActive = Boolean(rewardStatus?.is_paid_active);
    const serverExpiry = rewardStatus?.premium_expires_at;

    let isSubscribed = false;
    let subscriptionDaysLeft = 0;

    if (serverPaidActive && serverExpiry && serverExpiry > now.getTime()) {
      isSubscribed = true;
      subscriptionDaysLeft = Math.max(0, Math.ceil((serverExpiry - now.getTime()) / MS_PER_DAY));
    } else if (rewardStatus === undefined && user.unsafeMetadata?.isSubscribed) {
      // Offline fallback: only while rewardStatus is loading on cold start
      const expiry = user.unsafeMetadata?.subscriptionExpiry as number;
      if (expiry && !isNaN(expiry) && expiry > now.getTime()) {
        isSubscribed = true;
        subscriptionDaysLeft = Math.max(0, Math.ceil((expiry - now.getTime()) / MS_PER_DAY));
      }
    }
    
    // Priority: Server response -> Clerk metadata (cached in session) -> Local AsyncStorage/Memory -> Fallback
    const effectiveTrialStartStr =
      rewardStatus?.trial_started_at ||
      (user.unsafeMetadata?.trial_started_at as string) ||
      cachedTrialDate ||
      (user.id ? memoryTrialStartCache[user.id] : null);

    const trialStartedAt = effectiveTrialStartStr
      ? new Date(effectiveTrialStartStr)
      : new Date(user.createdAt || Date.now());

    const diffMs = now.getTime() - trialStartedAt.getTime();
    const daysSinceTrialStart = Math.floor(diffMs / MS_PER_DAY);
    const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSinceTrialStart);

    const rawPlan = (rewardStatus?.subscription_plan as string) || (user.unsafeMetadata?.plan as string) || (isSubscribed ? 'pro' : null);

    const rewardExpiry = rewardStatus?.premium_expires_at;
    const rewardDaysLeft = (!isSubscribed && rewardExpiry && rewardExpiry > now.getTime())
      ? Math.max(0, Math.ceil((rewardExpiry - now.getTime()) / MS_PER_DAY))
      : 0;
    const isRewardPro = !isSubscribed && ((!!rewardStatus?.is_reward_premium_active && rewardDaysLeft > 0) || rewardDaysLeft > 0);

    // Strict Status Hierarchy:
    // 1. Paid Subscription (highest tier)
    // 2. Reward Pro (unlocked with tokens)
    // 3. Free Trial (30-day initial trial for new users)
    // 4. Expired (trial ended, neither paid nor reward active)
    type SubscriptionStatusType = 'paid' | 'reward' | 'trial' | 'expired';
    let statusType: SubscriptionStatusType = 'expired';

    if (isSubscribed && subscriptionDaysLeft > 0) {
      statusType = 'paid';
    } else if (isRewardPro && rewardDaysLeft > 0) {
      statusType = 'reward';
    } else if (trialDaysLeft > 0) {
      statusType = 'trial';
    } else {
      statusType = 'expired';
    }

    const isTrialActive = statusType === 'trial';
    const isPro = statusType !== 'expired';
    const isExpired = statusType === 'expired';
    const isSubscriptionRequired = isExpired;

    const plan = isSubscribed
      ? rawPlan
      : (isRewardPro ? 'reward' : (isTrialActive ? 'trial' : null));

    const planName = isSubscribed
      ? (rawPlan === 'yearly' ? '1 Year (Yearly)' : rawPlan === 'semester' ? '6 Months' : rawPlan === 'monthly' ? '1 Month' : 'Pro Plan')
      : isRewardPro
        ? 'Reward Pro'
        : isTrialActive
          ? 'Free Trial'
          : 'Free Plan';

    const effectiveDaysLeft = statusType === 'paid'
      ? subscriptionDaysLeft
      : statusType === 'reward'
        ? rewardDaysLeft
        : statusType === 'trial'
          ? trialDaysLeft
          : 0;

    const badgeText = statusType === 'paid'
      ? 'Pro'
      : statusType === 'reward'
        ? 'Pro'
        : statusType === 'trial'
          ? `${trialDaysLeft}d`
          : 'Upgrade';

    const badgeIcon = statusType === 'paid'
      ? 'star'
      : statusType === 'reward'
        ? 'star'
        : statusType === 'trial'
          ? 'time-outline'
          : 'flash';

    return {
      isPro,
      statusType,
      trialDaysLeft,
      rewardDaysLeft,
      subscriptionDaysLeft,
      effectiveDaysLeft,
      isTrialActive,
      isSubscribed: statusType === 'paid',
      isRewardPro: statusType === 'reward',
      isExpired,
      isSubscriptionRequired,
      plan,
      planName,
      badgeText,
      badgeIcon,
    };
  }, [user, user?.unsafeMetadata, rewardStatus, cachedTrialDate]);

  return subscriptionStatus;
}

