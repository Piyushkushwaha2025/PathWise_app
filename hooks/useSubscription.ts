import { useUser } from '@clerk/clerk-expo';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRewardStatus } from '../lib/db';

const TRIAL_DAYS = 30; // 30-day free trial for new users
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function useSubscription() {
  const { user } = useUser();

  const { data: rewardStatus } = useQuery({
    queryKey: ['rewardStatus', user?.id],
    queryFn: () => getRewardStatus(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 mins
  });

  const subscriptionStatus = useMemo(() => {
    if (!user) {
      return {
        isPro: false,
        trialDaysLeft: 0,
        isTrialActive: false,
        isSubscriptionRequired: true,
        plan: null,
        subscriptionDaysLeft: 0,
      };
    }

    let isSubscribed = !!user.unsafeMetadata?.isSubscribed;
    
    // Use server-provided trial_started_at if available (prevents reset on reinstall)
    // Fall back to Clerk account createdAt
    const trialStartedAt = rewardStatus?.trial_started_at
      ? new Date(rewardStatus.trial_started_at)
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
      isSubscriptionRequired: !isPro, // if neither subscribed nor in trial nor reward premium
      plan,
      subscriptionDaysLeft,
    };
  }, [user, user?.unsafeMetadata, rewardStatus]);

  return subscriptionStatus;
}
