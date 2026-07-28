import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import * as Linking from 'expo-linking';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { fetchAssignments, toggleAssignment, deleteAssignment, useDBProfile, AssignmentData } from '../../../../lib/db';

export default function AssignmentsScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { userId } = useAuth();
  const { dbUser } = useDBProfile();

  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'submitted'>('pending');

  const isCR = dbUser?.role === 'cr' || dbUser?.role === 'admin';

  const loadAssignments = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchAssignments(userId);
      setAssignments(data);
    } catch (e) {
      console.error('Failed to load assignments', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  const handleToggle = async (assignment: AssignmentData) => {
    if (!userId) return;
    const newStatus = await toggleAssignment(userId, assignment._id);
    setAssignments(prev =>
      prev.map(a => a._id === assignment._id ? { ...a, status: newStatus } : a)
    );
  };

  const handleDelete = (assignment: AssignmentData) => {
    Alert.alert('Delete Assignment', `Delete "${assignment.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          if (!userId) return;
          await deleteAssignment(userId, assignment._id);
          setAssignments(prev => prev.filter(a => a._id !== assignment._id));
        }
      }
    ]);
  };

  const filteredAssignments = assignments.filter(a => a.status === activeTab);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Assignments',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      {/* No section_code — show prompt */}
      {!loading && !dbUser?.section_code && (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyText}>Your class section hasn't been set up yet.</Text>
          <Text style={[styles.emptyText, { fontSize: 13, marginTop: 4 }]}>
            Ask your CR or admin to add you.
          </Text>
        </View>
      )}

      {dbUser?.section_code && (
        <>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
              onPress={() => setActiveTab('pending')}
            >
              <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>Pending</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'submitted' && styles.activeTab]}
              onPress={() => setActiveTab('submitted')}
            >
              <Text style={[styles.tabText, activeTab === 'submitted' && styles.activeTabText]}>Submitted</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
          ) : (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAssignments(); }} />
              }
            >
              {filteredAssignments.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="checkmark-circle-outline" size={64} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No {activeTab} assignments!</Text>
                </View>
              ) : (
                filteredAssignments.map((item) => {
                  const dueDate = new Date(item.dueDate);
                  const isOverdue = activeTab === 'pending' && dueDate < new Date();
                  return (
                    <View key={item._id} style={styles.card}>
                      <View style={styles.cardHeader}>
                        <Text style={styles.subjectBadge}>{item.subject}</Text>
                        <Text style={[styles.dateText, isOverdue && { color: '#ef4444' }]}>
                          {isOverdue ? 'Overdue: ' : 'Due: '}{dueDate.toLocaleDateString()}
                        </Text>
                      </View>

                      <Text style={styles.title}>{item.title}</Text>
                      {!!item.description && (
                        <Text style={styles.description}>{item.description}</Text>
                      )}

                      {/* PDF Attachment */}
                      {item.pdf_download_url && (
                        <TouchableOpacity
                          style={styles.pdfBtn}
                          onPress={() => Linking.openURL(item.pdf_download_url!)}
                        >
                          <Ionicons name="document-text-outline" size={18} color="#3b82f6" />
                          <Text style={styles.pdfBtnText} numberOfLines={1}>
                            {item.pdf_filename || 'View Attachment'}
                          </Text>
                          <Ionicons name="download-outline" size={16} color="#3b82f6" />
                        </TouchableOpacity>
                      )}

                      <View style={styles.actionsRow}>
                        {/* Mark done/pending */}
                        <TouchableOpacity
                          style={[styles.submitBtn, activeTab === 'submitted' && styles.submitBtnDone]}
                          onPress={() => handleToggle(item)}
                        >
                          <Ionicons
                            name={activeTab === 'submitted' ? 'checkmark-circle' : 'ellipse-outline'}
                            size={20}
                            color={activeTab === 'submitted' ? '#fff' : colors.primary}
                          />
                          <Text style={[styles.submitBtnText, activeTab === 'submitted' && { color: '#fff' }]}>
                            {activeTab === 'submitted' ? 'Mark as Pending' : 'Mark as Done'}
                          </Text>
                        </TouchableOpacity>

                        {/* CR delete button */}
                        {isCR && item.created_by === userId && (
                          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                            <Ionicons name="trash-outline" size={18} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
              
              {/* Bottom Add Assignment Button for CR */}
              {isCR && activeTab === 'pending' && (
                <TouchableOpacity
                  style={[styles.submitBtn, { marginTop: 16, backgroundColor: colors.primary }]}
                  onPress={() => router.push('/studyos/assignments/create' as any)}
                >
                  <Ionicons name="add-circle-outline" size={22} color="#fff" />
                  <Text style={[styles.submitBtnText, { color: '#fff' }]}>Add New Assignment</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

function useStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    tabContainer: {
      flexDirection: 'row', paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    tab: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.sm },
    activeTab: { backgroundColor: colors.surface },
    tabText: { fontFamily: Typography.label.fontFamily, color: colors.textMuted },
    activeTabText: { color: colors.primary, fontFamily: Typography.h3.fontFamily },
    scrollContent: { padding: Spacing.md },
    card: {
      backgroundColor: colors.surface, padding: Spacing.md,
      borderRadius: Radius.md, marginBottom: Spacing.md,
      borderWidth: 1, borderColor: colors.border,
    },
    cardHeader: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: Spacing.xs,
    },
    subjectBadge: {
      fontFamily: Typography.h3.fontFamily, fontSize: 12, color: colors.primary,
      backgroundColor: colors.primary + '20', paddingHorizontal: 8,
      paddingVertical: 2, borderRadius: 12,
    },
    dateText: { fontFamily: Typography.body.fontFamily, fontSize: 12, color: colors.textMuted },
    title: { fontFamily: Typography.h3.fontFamily, fontSize: 16, color: colors.text, marginBottom: 4 },
    description: {
      fontFamily: Typography.body.fontFamily, fontSize: 14,
      color: colors.textMuted, marginBottom: Spacing.sm,
    },
    pdfBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: '#3b82f615', borderWidth: 1, borderColor: '#3b82f640',
      borderRadius: Radius.sm, padding: 10, marginBottom: Spacing.sm,
    },
    pdfBtnText: {
      flex: 1, color: '#3b82f6',
      fontFamily: Typography.label.fontFamily, fontSize: 13,
    },
    actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    submitBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 10, borderRadius: Radius.sm,
      backgroundColor: colors.primary + '15', gap: 8,
    },
    submitBtnDone: { backgroundColor: '#10b981' },
    submitBtnText: { fontFamily: Typography.label.fontFamily, color: colors.primary },
    deleteBtn: {
      padding: 10, borderRadius: Radius.sm,
      backgroundColor: '#ef444415', borderWidth: 1, borderColor: '#ef444430',
    },
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 80 },
    emptyText: {
      fontFamily: Typography.label.fontFamily, color: colors.textMuted,
      fontSize: 16, marginTop: 16, textAlign: 'center',
    },
  });
}
