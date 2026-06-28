import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Typography, Spacing } from "../../../constants/theme";
import { useThemeStore } from "../../../store/useThemeStore";
import { useRoadmapsCatalog } from "../../../hooks/useRoadmaps";
import { useEnrollments } from "../../../hooks/useEnrollments";
import { useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { MotiView } from "moti";

export default function RoadmapsScreen() {
  const router = useRouter();
  const { data: roadmapsCatalog = [], isLoading: isLoadingCatalog } =
    useRoadmapsCatalog();
  const { data: enrolledIds = [], isLoading: isLoadingEnrollments } =
    useEnrollments();

  const [searchQuery, setSearchQuery] = useState("");
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const isLoading = isLoadingCatalog || isLoadingEnrollments;

  const filteredRoadmaps = roadmapsCatalog.filter((roadmap) =>
    roadmap.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.header}>
        <Ionicons name="map" size={32} color={colors.primary} />
        <Text style={styles.title}>All Roadmaps</Text>
      </View>

      <Text style={styles.subtitle}>
        Explore our comprehensive catalog of {roadmapsCatalog.length} curated
        roadmaps.
      </Text>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textDim} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search roadmaps..."
          placeholderTextColor={colors.textDim}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color={colors.textDim} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 40 }}
        />
      );
    }
    return (
      <View style={styles.emptyState}>
        <Ionicons name="search-outline" size={48} color={colors.textDim} />
        <Text style={styles.emptyText}>No roadmaps found.</Text>
      </View>
    );
  };

  const renderItem = useCallback(
    ({ item: roadmap }: any) => {
      const isEnrolled = enrolledIds.includes(roadmap.id);

      return (
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "timing", duration: 300 }}
        >
          <TouchableOpacity
            style={[styles.card, isEnrolled && styles.cardEnrolled]}
            onPress={() => router.push(`/(app)/roadmaps/${roadmap.id}`)}
          >
            <View style={styles.cardHeaderRow}>
            <View
              style={[
                styles.iconBox,
                { backgroundColor: `${colors.primary}20` },
              ]}
            >
              <Ionicons name="school" size={28} color={colors.primary} />
            </View>
            {isEnrolled && (
              <View style={styles.enrolledBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={colors.primary}
                />
                <Text style={styles.enrolledText}>Enrolled</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardTitle}>{roadmap.title}</Text>
          <Text style={styles.cardSubtitle}>
            {roadmap.modules?.length || 0} Modules • By{" "}
            {roadmap.title.toLowerCase().includes("data structure") || roadmap.title.toLowerCase().includes("dsa") 
              ? "Strivers" 
              : roadmap.author === "roadmap.sh" 
                ? "Pathwise" 
                : roadmap.author || "Pathwise"}
          </Text>
        </TouchableOpacity>
        </MotiView>
      );
    },
    [enrolledIds, router, colors, styles]
  );

  return (
    <View style={styles.container}>
      <FlashList
        data={filteredRoadmaps}
        renderItem={renderItem}
        extraData={colors}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 20,
    paddingBottom: 40,
  },
  headerContainer: {
    paddingBottom: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.h1,
    color: colors.text,
  },
  subtitle: {
    ...Typography.body,
    color: colors.textDim,
    marginBottom: Spacing.md,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    height: 48,
    marginBottom: Spacing.sm,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    ...Typography.body,
  },
  emptyState: {
    alignItems: "center",
    marginTop: 40,
    opacity: 0.5,
  },
  emptyText: {
    ...Typography.body,
    color: colors.textDim,
    marginTop: 12,
  },
  card: {
    backgroundColor: colors.surface,
    padding: Spacing.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardEnrolled: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  enrolledBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  enrolledText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "bold",
  },
  cardTitle: {
    ...Typography.h3,
    color: colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    ...Typography.small,
    color: colors.textDim,
  },
});
