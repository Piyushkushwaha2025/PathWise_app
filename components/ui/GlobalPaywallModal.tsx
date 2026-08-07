import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/useThemeStore';
import { Spacing, Radius } from '../../constants/theme';
import { useRouter } from 'expo-router';
import { usePaywallStore } from '../../store/usePaywallStore';
import { BlurView } from 'expo-blur';

export function GlobalPaywallModal() {
  const { isVisible, message, hidePaywall } = usePaywallStore();
  const colors = useThemeStore((state) => state.colors);
  const router = useRouter();

  if (!isVisible) return null;

  const handleUpgrade = () => {
    hidePaywall();
    router.push('/(app)/_pathwise_subscription');
  };

  return (
    <Modal
      transparent
      visible={isVisible}
      animationType="fade"
      onRequestClose={hidePaywall}
    >
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill}>
        <View style={styles.overlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
            {/* Close Button */}
            <TouchableOpacity 
              style={[styles.closeBtn, { backgroundColor: colors.surface }]}
              onPress={hidePaywall}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>

            <View style={styles.iconContainer}>
              <Ionicons name="sparkles" size={48} color="#eab308" />
            </View>

            <Text style={[styles.title, { color: colors.text }]}>Premium Feature</Text>
            
            <Text style={[styles.message, { color: colors.textMuted }]}>
              {message || "You are currently on a Free plan. Upgrade to StudyOS Pro to unlock this feature and supercharge your learning."}
            </Text>

            <TouchableOpacity 
              style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
              onPress={handleUpgrade}
            >
              <Text style={styles.upgradeBtnText}>View Plans</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.maybeLaterBtn} onPress={hidePaywall}>
              <Text style={[styles.maybeLaterText, { color: colors.textMuted }]}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
  },
  title: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_700Bold',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: Radius.full,
    marginBottom: Spacing.md,
  },
  upgradeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
    marginRight: 8,
  },
  maybeLaterBtn: {
    paddingVertical: 8,
  },
  maybeLaterText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  }
});
