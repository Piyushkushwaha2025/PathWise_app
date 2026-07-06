import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSubjects } from '../../../../hooks/useSubjects';
import { Colors, Typography, Spacing, Radius } from '../../../../constants/theme';
import { GlassCard } from '../../../../components/ui/GlassCard';
import { BookOpen } from 'lucide-react-native';

export default function SubjectsScreen() {
  const { data: subjects, isLoading, error } = useSubjects();
  const router = useRouter();

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Fetching your subjects...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load subjects.</Text>
        <Text style={styles.errorSub}>{(error as Error).message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subjects</Text>
        <View style={styles.placeholder} />
      </View>

      <FlatList
        data={subjects}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <GlassCard 
            style={styles.card} 
            onPress={() => router.push(`/(app)/studyos/subjects/${item.id}`)}
          >
            <View style={styles.cardHeader}>
              <BookOpen size={24} color={Colors.primary} />
              <Text style={styles.subjectCode}>{item.shortname}</Text>
            </View>
            <Text style={styles.subjectName}>{item.fullname}</Text>
          </GlassCard>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textDim,
    marginTop: Spacing.md,
  },
  errorText: {
    ...Typography.h3,
    color: Colors.error,
  },
  errorSub: {
    ...Typography.body,
    color: Colors.textDim,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    paddingTop: 40,
    backgroundColor: Colors.surface,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.text,
  },
  backBtn: {
    padding: Spacing.sm,
  },
  backText: {
    color: Colors.primary,
    fontSize: 16,
  },
  placeholder: {
    width: 50,
  },
  listContent: {
    padding: Spacing.md,
  },
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  subjectCode: {
    ...Typography.h3,
    color: Colors.primary,
    marginLeft: Spacing.sm,
  },
  subjectName: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 16,
  },
});
