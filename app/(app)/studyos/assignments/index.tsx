import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Animated
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import * as Linking from 'expo-linking';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { fetchAssignments, toggleAssignment, deleteAssignment, useDBProfile, AssignmentData } from '../../../../lib/db';
import { Modal } from 'react-native';
import { useStudyOSStore } from '../../../../store/studyosStore';

export default function AssignmentsScreen() {
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const router = useRouter();
  const { userId } = useAuth();
  const { dbUser } = useDBProfile();
  const profile = useStudyOSStore((s) => s.profile);

  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'submitted'>('pending');

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<AssignmentData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isCR = dbUser?.role === 'cr' || dbUser?.role === 'admin';
  const isCSE = profile?.course?.toLowerCase().includes('cse') || profile?.course?.toLowerCase().includes('computer science');
  
  // Use CR's assigned section, or student's scraped section
  const activeSection = dbUser?.section_code || profile?.section || null;

  const loadAssignments = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchAssignments(userId, activeSection || undefined);
      setAssignments(data);
    } catch (e) {
      console.error('Failed to load assignments', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, activeSection]);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  const handleToggle = async (assignment: AssignmentData) => {
    if (!userId) return;
    const newStatus = await toggleAssignment(userId, assignment._id);
    setAssignments(prev =>
      prev.map(a => a._id === assignment._id ? { ...a, status: newStatus } : a)
    );
  };

  const handleDelete = (assignment: AssignmentData) => {
    setAssignmentToDelete(assignment);
    setDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!userId || !assignmentToDelete) return;
    try {
      setDeleting(true);
      await deleteAssignment(userId, assignmentToDelete._id);
      setAssignments(prev => prev.filter(a => a._id !== assignmentToDelete._id));
      setDeleteModalVisible(false);
      setAssignmentToDelete(null);
    } catch (e) {
      Alert.alert('Error', 'Failed to delete assignment');
    } finally {
      setDeleting(false);
    }
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
          headerRight: () => {
            if (!activeSection) return null;
            return (
              <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.primary + '30' }}>
                <Text style={{ color: colors.primary, fontFamily: Typography.h3.fontFamily, fontSize: 13 }}>
                  Section {activeSection}
                </Text>
              </View>
            )
          }
        }}
      />

      {/* Show error if not CSE and not CR */}
      {!loading && !isCSE && !isCR && !activeSection && (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyText}>Your class section hasn't been set up yet.</Text>
          <Text style={[styles.emptyText, { fontSize: 13, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 }]}>
            Assignments are currently only available for CSE students.
          </Text>
        </View>
      )}

      {/* No section scraped prompt for CSE students */}
      {!loading && isCSE && !isCR && !activeSection && (
        <View style={styles.emptyState}>
          <Ionicons name="sync-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyText}>Section Not Found</Text>
          <Text style={[styles.emptyText, { fontSize: 13, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 }]}>
            We couldn't detect your section. Please logout and login again in StudyOS to fetch your section.
          </Text>
        </View>
      )}

      {activeSection && (isCSE || isCR) && (
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
                  style={[styles.submitBtn, { flex: 0, marginTop: 16, marginBottom: 24, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: Radius.full, alignSelf: 'center', paddingHorizontal: 32 }]}
                  onPress={() => router.push('/studyos/assignments/create' as any)}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={[styles.submitBtnText, { color: '#fff' }]}>Add New Assignment</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </>
      )}

      {/* Custom Delete Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { alignItems: 'center' }]}>
            <View style={styles.warningIconBg}>
              <Ionicons name="trash" size={40} color="#ef4444" />
            </View>
            <Text style={styles.modalTitle}>Delete Assignment?</Text>
            <Text style={styles.modalSubText}>
              Are you sure you want to delete "{assignmentToDelete?.title}"? This action cannot be undone.
            </Text>
            
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity 
                style={[styles.modalBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setAssignmentToDelete(null);
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
    tabContainer: {
      flexDirection: 'row', paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    tab: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.sm },
    activeTab: { backgroundColor: colors.surface },
    tabText: { fontFamily: Typography.label.fontFamily, color: colors.textMuted },
    activeTabText: { color: colors.primary, fontFamily: Typography.h3.fontFamily },
    scrollContent: { padding: Spacing.md, flexGrow: 1 },
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
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center', alignItems: 'center', padding: Spacing.xl,
    },
    modalContainer: {
      backgroundColor: colors.surface, width: '100%',
      borderRadius: Radius.lg, padding: Spacing.xl,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15, shadowRadius: 12, elevation: 5,
    },
    warningIconBg: {
      backgroundColor: '#ef444415', borderRadius: 50, padding: 12,
      marginBottom: Spacing.md,
    },
    modalTitle: {
      fontFamily: Typography.h3.fontFamily, fontSize: 18, color: colors.text,
      marginBottom: Spacing.xs, textAlign: 'center',
    },
    modalSubText: {
      fontFamily: Typography.body.fontFamily, fontSize: 14, color: colors.textMuted,
      textAlign: 'center', marginBottom: Spacing.xl,
    },
    modalBtn: {
      flex: 1, paddingVertical: 12, borderRadius: Radius.full,
      alignItems: 'center', justifyContent: 'center',
    },
    modalBtnText: {
      fontFamily: Typography.label.fontFamily, fontSize: 14,
    },
  });
}
