import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, RefreshControl, Animated, Modal, TouchableWithoutFeedback
} from 'react-native';
import { useThemeStore } from '../../store/useThemeStore';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '@clerk/clerk-expo';
import { RewardedAd, RewardedAdEventType, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { useRouter } from 'expo-router';
import { MotiView, AnimatePresence } from 'moti';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRewardStatus, claimAdReward, claimDailyBonus, redeemTokensForPremium, RewardStatus } from '../../lib/db';

const PLANS = [
  { key: 'one_day' as const,   label: '1 Day',   tokens: 50,  days: 1  },
  { key: 'one_week' as const,  label: '7 Days',  tokens: 200, days: 7  },
  { key: 'two_weeks' as const, label: '14 Days', tokens: 350, days: 14 },
  { key: 'one_month' as const, label: '30 Days', tokens: 500, days: 30 },
];

const AD_OPTIONS = [
  { id: '10sec', label: '10 sec Ad', tokens: 5,  icon: 'play-outline' as const  },
  { id: '30sec', label: '30 sec Ad', tokens: 10, icon: 'play-circle-outline' as const },
  { id: '60sec', label: '60 sec Ad', tokens: 20, icon: 'tv-outline' as const },
];

export default function RewardsScreen() {
  const colors = useThemeStore((s) => s.colors);
  const { user } = useUser();
  const router = useRouter();

  const [status, setStatus] = useState<RewardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [watchingAd, setWatchingAd] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  
  // Custom Modal States
  const [tokenErrorModalVisible, setTokenErrorModalVisible] = useState(false);
  const [tokenErrorPlan, setTokenErrorPlan] = useState<typeof PLANS[0] | null>(null);
  const [confirmRedeemModalVisible, setConfirmRedeemModalVisible] = useState(false);
  const [confirmRedeemPlan, setConfirmRedeemPlan] = useState<typeof PLANS[0] | null>(null);
  
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [toastMsg, setToastMsg] = useState<{title: string, msg: string, isError?: boolean} | null>(null);
  const tokenAnim = React.useRef(new Animated.Value(1)).current;

  // -- Preload Rewarded Ad Logic --
  const rewardedAdRefs = React.useRef<Record<string, RewardedAd | null>>({});
  const resolveAdRef = React.useRef<(() => void) | null>(null);
  const rejectAdRef = React.useRef<((err: Error) => void) | null>(null);
  const isEarnedRef = React.useRef(false);
  const currentWatchingAdIdRef = React.useRef<string | null>(null);

  const loadRewardedAd = useCallback((adId: string) => {
    let adUnitId = TestIds.REWARDED;
    if (!__DEV__) {
      if (adId === '10sec') adUnitId = 'ca-app-pub-4632911659428084/1529185537';
      if (adId === '30sec') adUnitId = 'ca-app-pub-4632911659428084/6793954657';
      if (adId === '60sec') adUnitId = 'ca-app-pub-4632911659428084/3940455403';
    }
      
    const ad = RewardedAd.createForAdRequest(adUnitId, { requestNonPersonalizedAdsOnly: true });

    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      // Ad is ready
    });

    ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      if (currentWatchingAdIdRef.current === adId) {
        isEarnedRef.current = true;
      }
    });

    ad.addAdEventListener(AdEventType.CLOSED, () => {
      if (currentWatchingAdIdRef.current === adId) {
        setTimeout(() => { (global as any).isAdShowing = false; }, 2000); // Unblock AppOpenAd
        if (isEarnedRef.current) resolveAdRef.current?.();
        else rejectAdRef.current?.(new Error('AD_CLOSED_EARLY'));
        currentWatchingAdIdRef.current = null;
      }
      loadRewardedAd(adId); // Instantly start loading the NEXT ad of this type in background
    });

    ad.addAdEventListener(AdEventType.ERROR, (error) => {
      if (currentWatchingAdIdRef.current === adId) {
        (global as any).isAdShowing = false;
        rejectAdRef.current?.(error);
        currentWatchingAdIdRef.current = null;
      }
      setTimeout(() => loadRewardedAd(adId), 5000); // Retry after 5s if failed
    });

    ad.load();
    rewardedAdRefs.current[adId] = ad;
  }, []);

  useEffect(() => {
    loadRewardedAd('10sec');
    loadRewardedAd('30sec');
    loadRewardedAd('60sec');
  }, [loadRewardedAd]);
  // --------------------------------

  const showToast = (title: string, msg: string, isError = false) => {
    setToastMsg({ title, msg, isError });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const fetchStatus = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await getRewardStatus(user.id);
      setStatus(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  const checkDaily = async () => {
    try {
      const lastClaim = await AsyncStorage.getItem('last_daily_claim');
      if (lastClaim === new Date().toDateString()) {
        setDailyClaimed(true);
      }
    } catch (e) {}
  };

  useEffect(() => { 
    checkDaily();
    fetchStatus(); 
  }, [fetchStatus]);
  const onRefresh = () => { setRefreshing(true); fetchStatus(); };

  const animateToken = () => {
    Animated.sequence([
      Animated.timing(tokenAnim, { toValue: 1.25, duration: 150, useNativeDriver: true }),
      Animated.spring(tokenAnim, { toValue: 1, useNativeDriver: true }),
    ]).start();
  };

  const handleDailyCollect = async () => {
    if (!user?.id || dailyClaimed) return;
    setDailyClaimed(true); // Optimistically lock it to prevent double-click spam
    try {
      // Daily bonus logic separated from ads
      const result = await claimDailyBonus(user.id);
      animateToken();
      await AsyncStorage.setItem('last_daily_claim', new Date().toDateString());
      setStatus(prev => prev ? { ...prev, token_balance: result.token_balance } : prev);
      showToast('Daily Bonus! 🎁', `You collected your daily bonus! Balance: ${result.token_balance}`);
    } catch (e: any) {
      setDailyClaimed(false); // Revert if failed
      showToast('Error', 'Could not collect daily bonus. Try again.', true);
    }
  };

  const handleWatchAd = async (adOption: typeof AD_OPTIONS[0]) => {
    if (!user?.id || !status) return;
    if (status.ads_remaining_today <= 0) {
      showToast('Daily Limit Reached', `You have watched all ${status.max_ads_per_day} ads for today. Come back tomorrow!`, true);
      return;
    }
    if (!rewardedAdRefs.current[adOption.id]) {
      showToast('Loading...', 'Please wait a moment while the video loads.', true);
      return;
    }
    
    setWatchingAd(adOption.id);
    
    try {
      (global as any).isAdShowing = true;
      isEarnedRef.current = false;
      currentWatchingAdIdRef.current = adOption.id;

      await new Promise<void>((resolve, reject) => {
        resolveAdRef.current = resolve;
        rejectAdRef.current = reject;
        rewardedAdRefs.current[adOption.id]?.show();
      });

      // --- OPTIMISTIC UPDATE ---
      // Update UI instantly without waiting for backend
      const expectedTokens = adOption.tokens;
      animateToken();
      
      setStatus(prev => prev ? {
        ...prev,
        token_balance: prev.token_balance + expectedTokens,
        ads_watched_today: prev.ads_watched_today + 1,
        ads_remaining_today: Math.max(0, prev.ads_remaining_today - 1),
      } : prev);
      
      showToast(`+${expectedTokens} Tokens! 💎`, `Great job! Balance updated.`);

      // Send to backend in background
      claimAdReward(user.id, adOption.id)
        .then(result => {
          // Sync with exact server truth
          setStatus(prev => prev ? {
            ...prev,
            token_balance: result.token_balance,
            ads_watched_today: result.ads_watched_today,
            ads_remaining_today: result.ads_remaining_today,
          } : prev);
        })
        .catch(err => console.log('Ad sync error:', err));
        
    } catch (e: any) {
      if (e.message === 'AD_CLOSED_EARLY') {
        showToast('Ad Cancelled ❌', 'You must watch the full ad to earn tokens.', true);
      } else if (e.code === 'DAILY_LIMIT_REACHED') {
        showToast('Daily Limit Reached ⛔', e.message, true);
      } else {
        showToast('Ad Failed', 'Could not show the ad. Please check your internet and try again.', true);
      }
    } finally {
      setWatchingAd(null);
    }
  };

  const executeRedeem = async () => {
    if (!user?.id || !confirmRedeemPlan) return;
    setConfirmRedeemModalVisible(false);
    setRedeeming(confirmRedeemPlan.key);
    try {
      const result = await redeemTokensForPremium(user.id, confirmRedeemPlan.key);
      setStatus(prev => prev ? {
        ...prev,
        token_balance: result.token_balance,
        premium_expires_at: result.premium_expires_at,
        is_reward_premium_active: true,
      } : prev);
      showToast('Premium Unlocked! ⭐', `${confirmRedeemPlan.days} Days of Pro added!`);
    } catch (e: any) {
      showToast('Error', 'Could not redeem tokens.', true);
    } finally {
      setRedeeming(null);
      setConfirmRedeemPlan(null);
    }
  };

  const handleRedeem = async (plan: typeof PLANS[0]) => {
    if (!user?.id || !status) return;
    if (status.token_balance < plan.tokens) {
      setTokenErrorPlan(plan);
      setTokenErrorModalVisible(true);
      return;
    }
    setConfirmRedeemPlan(plan);
    setConfirmRedeemModalVisible(true);
  };

  const premiumDaysLeft = status?.premium_expires_at
    ? Math.max(0, Math.ceil((status.premium_expires_at - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const s = styles(colors);

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={s.container}>
        {/* Confirm Redeem Modal */}
        <Modal visible={confirmRedeemModalVisible} transparent animationType="fade" onRequestClose={() => setConfirmRedeemModalVisible(false)}>
          <View style={s.modalOverlay}>
            <TouchableOpacity 
              style={StyleSheet.absoluteFill} 
              activeOpacity={1} 
              onPress={() => setConfirmRedeemModalVisible(false)} 
            />
            <MotiView from={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }} style={s.modalContent}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FBBF2420', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 16 }}>
                <Ionicons name="star" size={32} color="#FBBF24" />
              </View>
              <Text style={s.modalTitle}>Redeem {confirmRedeemPlan?.label}</Text>
              <Text style={s.modalDesc}>
                Spend {confirmRedeemPlan?.tokens} tokens to unlock {confirmRedeemPlan?.days} days of Premium?
              </Text>
              
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                <TouchableOpacity style={[s.modalCancelBtn, { flex: 1 }]} onPress={() => setConfirmRedeemModalVisible(false)}>
                  <Text style={s.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.modalBuyBtn, { flex: 1, backgroundColor: '#FBBF24' }]} onPress={executeRedeem}>
                  <Text style={[s.modalBuyBtnText, { color: '#000' }]}>Redeem</Text>
                </TouchableOpacity>
              </View>
            </MotiView>
          </View>
        </Modal>

        {/* Token Error Modal */}
        <Modal visible={tokenErrorModalVisible} transparent animationType="fade" onRequestClose={() => setTokenErrorModalVisible(false)}>
        <View style={s.modalOverlay}>
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            activeOpacity={1} 
            onPress={() => setTokenErrorModalVisible(false)} 
          />
          <MotiView from={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }} style={s.modalContent}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={s.modalTitle}>Not Enough Tokens</Text>
            <Text style={s.modalDesc}>
              You need {tokenErrorPlan?.tokens} tokens for {tokenErrorPlan?.label}. You only have {status?.token_balance ?? 0}.
            </Text>
            
            <View style={{ gap: 12, marginTop: 20 }}>
              <TouchableOpacity style={s.modalBuyBtn} onPress={() => {
                setTokenErrorModalVisible(false);
                router.push('/(app)/_pathwise_subscription' as any);
              }}>
                <Ionicons name="card" size={20} color="#fff" />
                <Text style={s.modalBuyBtnText}>Buy Subscription Instead</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setTokenErrorModalVisible(false)}>
                <Text style={s.modalCancelBtnText}>Watch More Ads</Text>
              </TouchableOpacity>
            </View>
          </MotiView>
        </View>
      </Modal>

      {/* Dynamic Toast Pop-up */}
      <AnimatePresence>
        {toastMsg && (
          <MotiView
            from={{ translateY: -100, opacity: 0, scale: 0.9 }}
            animate={{ translateY: 50, opacity: 1, scale: 1 }}
            exit={{ translateY: -100, opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 15 }}
            style={{
              position: 'absolute',
              top: 10,
              left: 20,
              right: 20,
              zIndex: 999,
              backgroundColor: toastMsg.isError ? '#ef4444' : '#10b981',
              padding: 16,
              borderRadius: 16,
              flexDirection: 'row',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 5,
            }}
          >
            <Ionicons name={toastMsg.isError ? "alert-circle" : "checkmark-circle"} size={28} color="#fff" />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' }}>{toastMsg.title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 }}>{toastMsg.msg}</Text>
            </View>
          </MotiView>
        )}
      </AnimatePresence>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Rewards</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Token Balance Card */}
        <MotiView from={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', delay: 50 }}>
          <LinearGradient colors={['#7c3aed', '#4f46e5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.balanceCard}>
            <Text style={s.balanceLabel}>Your Tokens</Text>
            <Animated.Text style={[s.balanceAmount, { transform: [{ scale: tokenAnim }] }]}>
              🪙 {status?.token_balance ?? 0}
            </Animated.Text>
            {status?.is_reward_premium_active && premiumDaysLeft > 0 && (
              <View style={s.premiumBadge}>
                <Ionicons name="diamond" size={13} color="#fbbf24" />
                <Text style={s.premiumBadgeText}>Premium: {premiumDaysLeft} days left</Text>
              </View>
            )}
            <View style={s.adProgress}>
              <Text style={s.adProgressLabel}>Ads today: {status?.ads_watched_today ?? 0} / {status?.max_ads_per_day ?? 5}</Text>
              <View style={s.progressBar}>
                <View style={[s.progressFill, {
                  width: (((status?.ads_watched_today ?? 0) / (status?.max_ads_per_day ?? 5)) * 100) + '%' as any
                }]} />
              </View>
            </View>
          </LinearGradient>
        </MotiView>

        {/* Daily Collectable */}
        <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', delay: 120 }}>
          <TouchableOpacity
            style={[s.dailyCard, dailyClaimed && s.dailyCardClaimed]}
            onPress={handleDailyCollect}
            activeOpacity={0.8}
            disabled={dailyClaimed}
          >
            <View style={s.dailyLeft}>
              <Text style={s.dailyIcon}>🎁</Text>
              <View>
                <Text style={s.dailyTitle}>Daily Bonus</Text>
                <Text style={s.dailySub}>{dailyClaimed ? 'Come back tomorrow!' : 'Tap to collect your daily tokens'}</Text>
              </View>
            </View>
            <View style={s.dailyRight}>
              <Text style={s.dailyTokens}>+10</Text>
              <Text style={s.dailyTokenLabel}>tokens</Text>
            </View>
          </TouchableOpacity>
        </MotiView>

        {/* Premium Plans — Single Row */}
        <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', delay: 200 }}>
          <Text style={s.sectionTitle}>Unlock Premium</Text>
          <View style={s.plansGrid}>
            {PLANS.map((plan, i) => {
              const canAfford = (status?.token_balance ?? 0) >= plan.tokens;
              const isRedeeming = redeeming === plan.key;
              // First row: 3 buttons equally wide; second row: last button full width
              const isLast = i === PLANS.length - 1;
              return (
                <TouchableOpacity
                  key={plan.key}
                  style={[s.planCard, isLast && s.planCardFull, canAfford && s.planCardAffordable]}
                  onPress={() => handleRedeem(plan)}
                  activeOpacity={0.8}
                  disabled={!!redeeming}
                >
                  {isRedeeming ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Text style={s.planLabel}>{plan.label}</Text>
                      <Text style={s.planTokens}>🪙 {plan.tokens}</Text>
                      <Text style={[s.planStatus, canAfford ? { color: '#16a34a' } : { color: colors.textDim }]}>
                        {canAfford ? 'Redeem →' : `Need ${plan.tokens - (status?.token_balance ?? 0)} more`}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </MotiView>

        {/* Ad Options */}
        <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', delay: 300 }}>
          <Text style={s.sectionTitle}>Watch Ads, Earn Tokens</Text>
          <Text style={s.sectionSub}>{status?.ads_remaining_today ?? 0} ads remaining today</Text>
          <View style={s.adOptionsGrid}>
            {AD_OPTIONS.map((ad, i) => {
              const isLoading = watchingAd === ad.id;
              const disabled = (status?.ads_remaining_today ?? 0) <= 0 || !!watchingAd;
              return (
                <MotiView key={ad.id} from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', delay: 340 + i * 60 }}>
                  <TouchableOpacity
                    style={[s.adCard, disabled && !isLoading && s.adCardDisabled]}
                    onPress={() => handleWatchAd(ad)}
                    activeOpacity={0.8}
                    disabled={disabled}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name={ad.icon} size={26} color={disabled ? colors.textDim : colors.primary} />
                    )}
                    <Text style={[s.adLabel, disabled && { color: colors.textDim }]}>{ad.label}</Text>
                    <Text style={[s.adTokens, disabled && { color: colors.textDim }]}>+{ad.tokens} tokens</Text>
                  </TouchableOpacity>
                </MotiView>
              );
            })}
          </View>
        </MotiView>

        {/* How it works */}
        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', delay: 500 }}>
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>How does it work?</Text>
            {[
              ['🎁', 'Collect your daily bonus — 10 free tokens every day'],
              ['▶️', 'Watch short ads to earn tokens (up to 5 ads/day)'],
              ['💎', 'Spend tokens to unlock Premium days'],
              ['⏰', 'Premium days stack — keep redeeming to extend'],
            ].map(([icon, text], i) => (
              <View key={i} style={s.infoRow}>
                <Text style={s.infoIcon}>{icon}</Text>
                <Text style={s.infoText}>{text}</Text>
              </View>
            ))}
          </View>
        </MotiView>

        <View style={{ height: 50 }} />
      </ScrollView>
    </View>
  );
}

const styles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text },
  content: { paddingHorizontal: 20, paddingTop: 8 },

  // Balance Card
  balanceCard: { borderRadius: 20, padding: 20, marginBottom: 14 },
  balanceLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontFamily: 'Inter_500Medium', marginBottom: 2 },
  balanceAmount: { fontSize: 42, fontFamily: 'SpaceGrotesk_700Bold', color: '#fff', marginBottom: 10 },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(251,191,36,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, alignSelf: 'flex-start', marginBottom: 10 },
  premiumBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fbbf24' },
  adProgress: { marginTop: 2 },
  adProgressLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter_400Regular', marginBottom: 6 },
  progressBar: { height: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3 },
  progressFill: { height: 5, backgroundColor: '#fff', borderRadius: 3 },

  // Daily Bonus
  dailyCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#16a34a', borderRadius: 18, padding: 18, marginBottom: 24 },
  dailyCardClaimed: { backgroundColor: colors.surface },
  dailyLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  dailyIcon: { fontSize: 30 },
  dailyTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  dailySub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  dailyRight: { alignItems: 'center' },
  dailyTokens: { fontSize: 22, fontFamily: 'SpaceGrotesk_700Bold', color: '#fff' },
  dailyTokenLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.8)' },

  // Plans Row
  sectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 6 },
  sectionSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textDim, marginBottom: 12 },
  plansGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 26 },
  planCard: { width: '31%', backgroundColor: colors.surface, borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, gap: 6 },
  planCardFull: { width: '100%' },
  planCardAffordable: { borderColor: '#7c3aed', backgroundColor: '#7c3aed0d' },
  planLabel: { fontSize: 15, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text, textAlign: 'center' },
  planTokens: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textDim },
  planStatus: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },

  // Ad Options
  adOptionsGrid: { flexDirection: 'column', gap: 12, marginBottom: 24 },
  adCard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border },
  adCardDisabled: { opacity: 0.5 },
  adLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.text, flex: 1, marginLeft: 12 },
  adTokens: { fontSize: 14, fontFamily: 'SpaceGrotesk_700Bold', color: colors.primary },

  // Info
  infoCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border },
  infoTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', color: colors.text, marginBottom: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  infoIcon: { fontSize: 16, width: 24 },
  infoText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textDim, flex: 1, lineHeight: 20 },

  // Custom Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { backgroundColor: colors.surfaceHigh, borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontSize: 20, fontFamily: 'SpaceGrotesk_700Bold', color: colors.text, textAlign: 'center', marginBottom: 8 },
  modalDesc: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  modalBuyBtn: { backgroundColor: '#7c3aed', paddingVertical: 14, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  modalBuyBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_700Bold' },
  modalCancelBtn: { paddingVertical: 12, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  modalCancelBtnText: { color: colors.textDim, fontSize: 14, fontFamily: 'Inter_600SemiBold' }
});
