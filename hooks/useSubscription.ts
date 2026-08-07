import { useUser } from '@clerk/clerk-expo';
import { useMemo } from 'react';

const TRIAL_DAYS = 0; // Set to 0 for testing paywall
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function useSubscription() {
  const { user } = useUser();

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
    
    // Calculate trial
    const createdAt = new Date(user.createdAt || Date.now());
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const daysSinceCreation = Math.floor(diffMs / MS_PER_DAY);
    const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSinceCreation);
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

    const isPro = isSubscribed || isTrialActive;
    const plan = isSubscribed ? rawPlan : null;

    return {
      isPro,
      trialDaysLeft,
      isTrialActive,
      isSubscribed,
      isSubscriptionRequired: !isPro, // if neither subscribed nor in trial
      plan,
      subscriptionDaysLeft,
    };
  }, [user, user?.unsafeMetadata]);

  return subscriptionStatus;
}
