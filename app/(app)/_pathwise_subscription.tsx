import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Typography, Spacing } from "../../constants/theme";
import { useThemeStore } from "../../store/useThemeStore";
import { useSubscription } from "../../hooks/useSubscription";
import RazorpayCheckout from 'react-native-razorpay';
import { useUser } from '@clerk/clerk-expo';
import { updateUserSubscription } from '../../lib/db';

const RAZORPAY_KEY = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TJhrbM44rdPthR';
const RAZORPAY_SECRET = 'cLZR8EyT6Pdt5cd5UqwUQ3Ku';

const PLANS = [
  { id: 'monthly', name: '1 Month', price: 59, desc: 'Billed monthly' },
  { id: 'semester', name: '6 Months', price: 299, desc: 'Save 15% (₹50/mo)' },
  { id: 'yearly', name: '1 Year', price: 499, desc: 'Save 30% (₹41/mo)', popular: true },
];

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const encodeBase64 = (input: string = '') => {
  let str = input;
  let output = '';
  for (let block = 0, charCode, i = 0, map = chars;
  str.charAt(i | 0) || (map = '=', i % 1);
  output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
    charCode = str.charCodeAt(i += 3/4);
    block = block << 8 | charCode;
  }
  return output;
};

export default function SubscriptionScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const { isPro, trialDaysLeft, isTrialActive, isSubscribed, plan, subscriptionDaysLeft } = useSubscription();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(() => PLANS.find(p => p.id === plan) || PLANS[0]);

  React.useEffect(() => {
    if (plan) {
      const p = PLANS.find(item => item.id === plan);
      if (p) setSelectedPlan(p);
    }
  }, [plan]);

  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const toastOpacity = React.useRef(new Animated.Value(0)).current;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const handleSubscribe = async () => {
    if (!user) return;
    if (isSubscribed) {
      showToast("You already have an active subscription! Cannot buy another plan until it expires.");
      return;
    }
    setLoading(true);
    try {
      // 1. Generate Order (Client-side mock for testing, must be moved to backend for production)
      const auth = encodeBase64(`${RAZORPAY_KEY}:${RAZORPAY_SECRET}`);
      const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: selectedPlan.price * 100, // paise
          currency: 'INR',
          receipt: `rcpt_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString().slice(-6)}`
        })
      });
      const order = await orderRes.json();
      
      if (!order.id) throw new Error(order.error?.description || 'Could not create order');

      // 2. Open Razorpay Checkout
      const phoneStr = user.primaryPhoneNumber?.phoneNumber || '';
      const digits = phoneStr.replace(/\D/g, '');
      // Razorpay needs exactly 10 digits (no country code) for Indian numbers
      const last10 = digits.slice(-10);
      const validContact = last10.length === 10 ? last10 : '9000000000';

      var options = {
        description: 'Upgrade to Pro',
        image: 'https://i.imgur.com/3g7nmJC.png',
        currency: 'INR',
        key: RAZORPAY_KEY,
        amount: selectedPlan.price * 100,
        name: 'PathWise',
        order_id: order.id,
        prefill: {
          email: user.primaryEmailAddress?.emailAddress || 'test@pathwise.com',
          contact: validContact,
          name: user.fullName || 'Student'
        },
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
          upi_intent: true, // enables GPay, PhonePe, Paytm app-to-app flow (Live mode only)
        },
        config: {
          display: {
            blocks: {
              utib: { name: 'Pay via UPI Apps', instruments: [{ method: 'upi', flows: ['intent'] }] },
              other: { name: 'Other Payment Methods', instruments: [{ method: 'card' }, { method: 'netbanking' }] }
            },
            sequence: ['block.utib', 'block.other'],
            preferences: { show_default_blocks: true }
          }
        },
        theme: { color: colors.primary }
      };

      RazorpayCheckout.open(options).then(async (data: any) => {
        // Success: Save in Clerk metadata with expiry timestamp & sync to MongoDB instantly
        const durationDays = selectedPlan.id === 'yearly' ? 365 : selectedPlan.id === 'semester' ? 180 : 30;
        const expiryTime = Date.now() + (durationDays * 24 * 60 * 60 * 1000);
        await user.update({
          unsafeMetadata: { ...user.unsafeMetadata, isSubscribed: true, plan: selectedPlan.id, subscriptionExpiry: expiryTime }
        });
        try {
          await updateUserSubscription(user.id, true, selectedPlan.id);
        } catch (dbErr) {
          console.log("DB subscription save error:", dbErr);
        }
        showToast("Welcome to Pro! Superpowers unlocked & synced with Database ✨");
      }).catch((error: any) => {
        showToast("Payment Cancelled");
      });
    } catch (e: any) {
      showToast(e.message || "Failed to initiate payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Simple, transparent{" "}
          <Text style={{ color: colors.primary }}>pricing</Text>
        </Text>
        <Text style={styles.subtitle}>
          Start learning for free, upgrade when you need superpowers.
        </Text>
      </View>

      {/* Status Card */}
      <View style={[styles.statusCard, { borderColor: isPro ? (isSubscribed ? '#22c55e' : colors.primary) : colors.border, backgroundColor: isSubscribed ? '#22c55e10' : colors.surface }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <Ionicons name={isSubscribed ? "shield-checkmark" : isTrialActive ? "time" : "lock-closed"} size={24} color={isSubscribed ? '#22c55e' : isPro ? colors.primary : colors.textMuted} />
            <Text style={{ ...Typography.h3, color: isSubscribed ? '#22c55e' : colors.text, flexShrink: 1 }} numberOfLines={1}>
              {isSubscribed 
                ? (plan === 'yearly' ? "Active: Yearly ⭐" : plan === 'semester' ? "Active: 6 Months ⚡" : plan === 'monthly' ? "Active: 1 Month ⚡" : "Active Pro ⭐")
                : isTrialActive ? "Free Trial Active" : "Trial Expired"}
            </Text>
          </View>
          {isSubscribed && (
            <View style={{ backgroundColor: '#22c55e25', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, marginLeft: 8 }}>
              <Text style={{ color: '#22c55e', fontWeight: 'bold', fontSize: 12 }}>
                {subscriptionDaysLeft} {subscriptionDaysLeft === 1 ? 'Day' : 'Days'} Left
              </Text>
            </View>
          )}
        </View>
        <Text style={{ ...Typography.body, color: colors.textDim }}>
          {isSubscribed 
            ? `You are currently on the ${plan === 'yearly' ? '1 Year (Yearly)' : plan === 'semester' ? '6 Months' : plan === 'monthly' ? '1 Month' : 'Pro'} Plan with ${subscriptionDaysLeft} days remaining. Enjoy unlimited AI roadmaps & doubt solvers!` 
            : isTrialActive 
              ? `You have ${trialDaysLeft} days left in your free trial of AI Superpowers.` 
              : "Your 30-day trial has ended. Upgrade to continue using AI roadmaps and solvers."}
        </Text>
      </View>

      {/* Features Included */}
      <View style={{ marginBottom: Spacing.xl }}>
        <Text style={{ ...Typography.h3, color: colors.text, marginBottom: 16 }}>Pro Features Include</Text>
        <View style={styles.featuresList}>
          {[
            "Full AI Superpowers",
            "No need to download/upload PDFs",
            "Unlimited Custom AI Roadmaps",
            "Unlimited AI Doubt Solver",
            "Advanced StudyOS Analytics",
            "Premium Notes & PYQs",
          ].map((feat, i) => (
            <View key={i} style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text style={styles.featureText}>{feat}</Text>
            </View>
          ))}
          <View style={styles.featureItem}>
            <Ionicons name="gift-outline" size={20} color="#22c55e" />
            <Text style={styles.featureText}>Prediction & Bunk Planner are always free!</Text>
          </View>
        </View>
      </View>

      {/* Plans */}
      <Text style={{ ...Typography.h3, color: colors.text, marginBottom: 16 }}>Select a Plan</Text>
      <View style={{ gap: 12, marginBottom: Spacing.xl }}>
        {PLANS.map((planItem) => {
          const isSelected = selectedPlan.id === planItem.id;
          const isCurrentPlan = isSubscribed && plan === planItem.id;
          return (
            <TouchableOpacity 
              key={planItem.id}
              onPress={() => setSelectedPlan(planItem)}
              style={[
                styles.planCard, 
                { 
                  borderColor: isCurrentPlan ? '#22c55e' : isSelected ? colors.primary : colors.border,
                  backgroundColor: isCurrentPlan ? '#22c55e15' : isSelected ? `${colors.primary}10` : colors.surface,
                  borderWidth: isCurrentPlan ? 2 : isSelected ? 2 : 1,
                }
              ]}
            >
              {isCurrentPlan ? (
                <View style={[styles.badge, { backgroundColor: '#22c55e' }]}>
                  <Text style={[styles.badgeText, { color: '#ffffff', fontWeight: 'bold' }]}>YOUR PLAN ✓</Text>
                </View>
              ) : planItem.popular ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>BEST VALUE</Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ ...Typography.h3, color: isCurrentPlan ? '#22c55e' : colors.text }}>{planItem.name}</Text>
                  {isCurrentPlan && <Ionicons name="checkmark-circle" size={18} color="#22c55e" />}
                </View>
                <Text style={{ ...Typography.body, color: colors.textDim, fontSize: 13 }}>{planItem.desc}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.text, fontFamily: 'SpaceGrotesk_700Bold' }}>
                  ₹{planItem.price}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity 
        style={[
          styles.buttonSolid, 
          (loading || isSubscribed) && { opacity: 0.7 },
          isSubscribed && (selectedPlan.id === plan ? { backgroundColor: '#22c55e' } : { backgroundColor: colors.textMuted })
        ]}
        onPress={handleSubscribe}
        disabled={loading || isSubscribed}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonSolidText}>
            {isSubscribed && selectedPlan.id === plan 
              ? "Current Active Plan ✓" 
              : isSubscribed 
                ? "Locked until current plan expires 🔒" 
                : `Pay ₹${selectedPlan.price}`}
          </Text>
        )}
      </TouchableOpacity>
      
      <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 12 }}>
        Secure payments by Razorpay. Cancel anytime.
      </Text>

      {toastVisible && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Spacing.lg, paddingTop: 20, paddingBottom: 40 },
  header: { marginBottom: Spacing.lg, alignItems: "center" },
  title: {
    ...Typography.h1,
    color: colors.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: { ...Typography.body, color: colors.textDim, textAlign: "center" },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  featuresList: { gap: 12 },
  featureItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: { ...Typography.body, color: colors.text, fontSize: 15 },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    position: 'relative'
  },
  badge: {
    position: "absolute",
    top: -1,
    right: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  badgeText: { fontSize: 10, fontWeight: "bold", color: "white" },
  buttonSolid: {
    padding: 18,
    borderRadius: 100,
    backgroundColor: colors.primary,
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  buttonSolidText: { ...Typography.body, fontWeight: "bold", color: "white" },
  toast: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
});
