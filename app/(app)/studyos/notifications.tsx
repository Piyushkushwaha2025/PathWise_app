import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { useThemeStore } from '../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../constants/theme';
import { fetchNotifications, createNotification, deleteNotification, useDBProfile, NotificationData } from '../../../lib/db';
import { useStudyOSStore } from '../../../store/studyosStore';

export default function NotificationsScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { userId } = useAuth();
  const { dbUser } = useDBProfile();
  const profile = useStudyOSStore((s) => s.profile);

  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal states for creating notification
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [expiryDaysStr, setExpiryDaysStr] = useState('3'); // Default 3 days
  const [creating, setCreating] = useState(false);
  const [titleError, setTitleError] = useState('');
  const [messageError, setMessageError] = useState('');

  // Modal states for deleting
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [notifToDelete, setNotifToDelete] = useState<NotificationData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isCR = dbUser?.role === 'cr' || dbUser?.role === 'admin';
  const activeSection = dbUser?.section_code || profile?.section || null;

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchNotifications(userId, activeSection || undefined);
      setNotifications(data);
    } catch (e) {
      console.error('Failed to load notifications', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, activeSection]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const handleCreate = async () => {
    let hasError = false;
    if (!newTitle.trim()) {
      setTitleError('Title is required');
      hasError = true;
    }
    if (!newMessage.trim()) {
      setMessageError('Message is required');
      hasError = true;
    }
    if (hasError || !userId) return;
    
    if (!activeSection) {
      Alert.alert('Error', 'Section code is missing. Please sync your profile first.');
      return;
    }

    try {
      setCreating(true);
      const days = parseInt(expiryDaysStr, 10);
      const finalDays = isNaN(days) || days < 1 ? 3 : days; // Fallback to 3 if invalid
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + finalDays);

      const newNotif = await createNotification(userId, newTitle.trim(), newMessage.trim(), expiresAt.toISOString(), activeSection);
      
      setNotifications(prev => [newNotif, ...prev]);
      setCreateModalVisible(false);
      setNewTitle('');
      setNewMessage('');
      setExpiryDaysStr('3');
      setTitleError('');
      setMessageError('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create notification');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (notif: NotificationData) => {
    setNotifToDelete(notif);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!userId || !notifToDelete) return;
    try {
      setDeleting(true);
      await deleteNotification(userId, notifToDelete._id);
      setNotifications(prev => prev.filter(n => n._id !== notifToDelete._id));
      setDeleteModalVisible(false);
      setNotifToDelete(null);
    } catch (e) {
      Alert.alert('Error', 'Failed to delete notification');
    } finally {
      setDeleting(false);
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Notifications',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 14 }}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ),
          headerRight: () => {
            if (!activeSection) return null;
            return (
              <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.primary + '30' }}>
                <Text style={{ color: colors.primary, fontFamily: Typography.h3.fontFamily, fontSize: 13 }}>
                  Sec {activeSection}
                </Text>
              </View>
            )
          }
        }}
      />

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNotifications(); }} />
          }
        >
          {notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyText}>No recent notifications</Text>
            </View>
          ) : (
            notifications.map((item) => {
              const date = new Date(item.createdAt);
              const expiry = new Date(item.expiresAt);
              return (
                <View key={item._id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.announcementBadge}>
                      <Ionicons name="megaphone" size={12} color="#f59e0b" style={{ marginRight: 4 }} />
                      <Text style={styles.badgeText}>Announcement</Text>
                    </View>
                    <Text style={styles.dateText}>{date.toLocaleDateString()}</Text>
                  </View>

                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.description}>{item.message}</Text>

                  <View style={styles.cardFooter}>
                    <Text style={styles.expiryText}>Expires: {expiry.toLocaleDateString()}</Text>
                    {isCR && item.created_by === userId && (
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* FAB for CR */}
      {!loading && isCR && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 30 }]}
          onPress={() => setCreateModalVisible(true)}
        >
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Create Modal */}
      <Modal visible={createModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>New Notification</Text>
              <TouchableOpacity onPress={() => {
                setCreateModalVisible(false);
                setTitleError('');
                setMessageError('');
              }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={[styles.input, titleError ? { borderColor: '#ef4444' } : null]}
              placeholder="e.g. Lab Manual Submission"
              placeholderTextColor={colors.textMuted}
              value={newTitle}
              onChangeText={(t) => {
                setNewTitle(t);
                if (titleError) setTitleError('');
              }}
            />
            {!!titleError && <Text style={{ color: '#ef4444', fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 4 }}>{titleError}</Text>}

            <Text style={styles.inputLabel}>Message</Text>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: 'top' }, messageError ? { borderColor: '#ef4444' } : null]}
              placeholder="Provide details about the announcement..."
              placeholderTextColor={colors.textMuted}
              value={newMessage}
              onChangeText={(t) => {
                setNewMessage(t);
                if (messageError) setMessageError('');
              }}
              multiline
            />
            {!!messageError && <Text style={{ color: '#ef4444', fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 4 }}>{messageError}</Text>}

            <Text style={styles.inputLabel}>Auto Delete After (Days)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 7"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              value={expiryDaysStr}
              onChangeText={(t) => setExpiryDaysStr(t.replace(/[^0-9]/g, ''))}
            />

            <TouchableOpacity 
              style={[styles.postBtn, creating && { opacity: 0.7 }]} 
              onPress={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.postBtnText}>Post Notification</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Custom Delete Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.deleteModalOverlay}>
          <View style={[styles.deleteModalContainer, { alignItems: 'center' }]}>
            <View style={styles.warningIconBg}>
              <Ionicons name="trash" size={40} color="#ef4444" />
            </View>
            <Text style={styles.deleteModalTitle}>Delete Notification?</Text>
            <Text style={styles.deleteModalSubText}>
              Are you sure you want to delete "{notifToDelete?.title}"? This action cannot be undone.
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setNotifToDelete(null);
                }}
                disabled={deleting}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: '#ef4444' }, deleting && { opacity: 0.6 }]}
                onPress={confirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

function useStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingHorizontal: Spacing.md, paddingTop: 10, paddingBottom: 100, flexGrow: 1 },
    card: {
      backgroundColor: colors.surface, padding: Spacing.md,
      borderRadius: Radius.md, marginBottom: Spacing.md,
      borderWidth: 1, borderColor: colors.border,
    },
    cardHeader: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: Spacing.sm,
    },
    announcementBadge: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: '#f59e0b15', paddingHorizontal: 8,
      paddingVertical: 4, borderRadius: 12,
    },
    badgeText: {
      fontFamily: Typography.h3.fontFamily, fontSize: 11, color: '#f59e0b',
    },
    dateText: { fontFamily: Typography.body.fontFamily, fontSize: 12, color: colors.textMuted },
    title: { fontFamily: Typography.h3.fontFamily, fontSize: 16, color: colors.text, marginBottom: 6 },
    description: {
      fontFamily: Typography.body.fontFamily, fontSize: 14,
      color: colors.textMuted, marginBottom: Spacing.md, lineHeight: 20
    },
    cardFooter: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10
    },
    expiryText: { fontFamily: Typography.label.fontFamily, fontSize: 11, color: colors.textDim },
    deleteBtn: {
      padding: 6, borderRadius: Radius.sm,
      backgroundColor: '#ef444415',
    },
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 40 },
    emptyText: {
      fontFamily: Typography.label.fontFamily, color: colors.textMuted,
      fontSize: 16, marginTop: 16, textAlign: 'center',
    },
    fab: {
      position: 'absolute', bottom: 30, right: 20,
      width: 60, height: 60, borderRadius: 30,
      backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
    },
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    bottomSheet: {
      backgroundColor: colors.background, width: '100%',
      borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
      padding: Spacing.xl, paddingBottom: 40,
    },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    sheetTitle: { fontFamily: Typography.h2.fontFamily, fontSize: 20, color: colors.text },
    inputLabel: { fontFamily: Typography.label.fontFamily, fontSize: 13, color: colors.textMuted, marginBottom: 8, marginTop: 12 },
    input: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: Radius.md, padding: 14, color: colors.text,
      fontFamily: Typography.body.fontFamily, fontSize: 15,
    },
    chipRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 20 },
    chip: {
      paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border
    },
    chipActive: { backgroundColor: colors.primary + '15', borderColor: colors.primary },
    chipText: { fontFamily: Typography.label.fontFamily, color: colors.text, fontSize: 13 },
    chipTextActive: { color: colors.primary },
    postBtn: {
      backgroundColor: colors.primary, paddingVertical: 16, borderRadius: Radius.full,
      alignItems: 'center', marginTop: 10
    },
    postBtnText: { fontFamily: Typography.h3.fontFamily, color: '#fff', fontSize: 16 },

    // Delete Modal Styles
    deleteModalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center', alignItems: 'center', padding: Spacing.xl,
    },
    deleteModalContainer: {
      backgroundColor: colors.surface, width: '100%',
      borderRadius: Radius.lg, padding: Spacing.xl,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15, shadowRadius: 12, elevation: 5,
    },
    warningIconBg: {
      backgroundColor: '#ef444415', borderRadius: 50, padding: 12,
      marginBottom: Spacing.md,
    },
    deleteModalTitle: {
      fontFamily: Typography.h3.fontFamily, fontSize: 18, color: colors.text,
      marginBottom: Spacing.xs, textAlign: 'center',
    },
    deleteModalSubText: {
      fontFamily: Typography.body.fontFamily, fontSize: 14, color: colors.textMuted,
      textAlign: 'center', marginBottom: Spacing.xl,
    },
    modalBtn: {
      flex: 1, paddingVertical: 12, borderRadius: Radius.full,
      alignItems: 'center', justifyContent: 'center',
    },
    modalBtnText: {
      fontFamily: Typography.h3.fontFamily, fontSize: 14,
    }
  });
}
