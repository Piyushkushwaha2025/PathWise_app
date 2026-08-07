import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../../store/useThemeStore';
import { Typography, Spacing, Radius } from '../../../../constants/theme';
import { useHardwareBack } from '../../../../hooks/useHardwareBack';

export default function CourseDetailsScreen() {
  const { id, name } = useLocalSearchParams();
  const router = useRouter();
  useHardwareBack('/studyos/subjects');
  const colors = useThemeStore((s) => s.colors);
  const styles = useStyles(colors);
  const webViewRef = useRef<WebView>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading && !isError) {
      timer = setTimeout(() => {
        setIsError(true);
        setIsLoading(false);
      }, 15000);
    }
    return () => clearTimeout(timer);
  }, [isLoading, isError]);

  // Magic script to hide Moodle's native headers, footers, and sidebars
  // so it looks like part of our app!
  const hideMoodleUIScript = `
    function hideUI() {
      try {
        if (!document.getElementById('moodle-hider-style')) {
          var style = document.createElement('style');
          style.id = 'moodle-hider-style';
          style.innerHTML = \\\`
            /* Top Navbar (Red bar) */
            nav.navbar, .navbar, .fixed-top, header.navbar { display: none !important; }
            
            /* Secondary Navigation (Course, Grades) */
            .secondary-navigation { display: none !important; }
            
            /* Course Header (Big Title) */
            header#page-header { display: none !important; }
            
            /* Sidebar and toggles */
            #nav-drawer, [data-region="drawer"], .drawer-toggles, .drawer-left-toggle, .btn-drawer { display: none !important; }
            
            /* Footer */
            #page-footer, footer { display: none !important; }
            
            /* Misc */
            .back-to-top { display: none !important; }
            
            /* Layout fixes */
            body, #page, #page-wrapper { 
              padding-top: 0 !important; 
              margin-top: 0 !important; 
              background-color: #f8f9fa !important; 
            }
          \\\`;
          document.head.appendChild(style);
        }
      } catch(e) {}
    }
    
    // Run immediately
    hideUI();
    // Run periodically to ensure it stays hidden even if Moodle does AJAX navigation
    setInterval(hideUI, 500);
    true;
  `;

  // Fallback URL if we only have the shortname and no ID
  // But ideally, the scraper now extracts the actual ID (e.g., 22826)
  const isNumericId = /^\d+$/.test(String(id));
  const targetUrl = isNumericId 
    ? `https://lms.culko.in/course/view.php?id=${id}` 
    : `https://lms.culko.in/my/courses.php`; // Fallback if ID is missing

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.push('/studyos/subjects' as any)}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>{name || 'Course Details'}</Text>
          <Text style={styles.headerSubtitle}>LMS Course Content</Text>
        </View>
      </View>

      <View style={styles.content}>
        {!isNumericId && (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={24} color={colors.warning} />
            <Text style={{ color: colors.warning, marginLeft: 8, flex: 1 }}>
              Course ID not found. Please reload the LMS Courses page so the app can extract the correct links.
            </Text>
          </View>
        )}

        <WebView
          ref={webViewRef}
          source={{ uri: targetUrl }}
          style={{ flex: 1, backgroundColor: '#f8f9fa' }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
          injectedJavaScript={hideMoodleUIScript}
          onLoadStart={() => setIsLoading(true)}
          onLoadEnd={() => setIsLoading(false)}
        />
        
        {isLoading && !isError && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading Course Content...</Text>
          </View>
        )}

        {isError && (
          <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
            <Ionicons name="cloud-offline-outline" size={48} color={colors.error} />
            <Text style={[styles.loadingText, { color: colors.error, fontSize: 18, marginTop: 12 }]}>LMS server is Down</Text>
            <Text style={{ color: colors.textMuted, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>
              The university LMS portal took too long to respond. Please try again later.
            </Text>
            <TouchableOpacity 
              style={{ marginTop: 24, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 }}
              onPress={() => router.push('/studyos/subjects' as any)}
            >
              <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold' }}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 50,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.h2,
    color: colors.text,
    fontSize: 18,
  },
  headerSubtitle: {
    ...Typography.small,
    color: colors.textMuted,
  },
  content: {
    flex: 1,
    backgroundColor: colors.text, // White background for WebView
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    color: '#666',
    fontFamily: 'Inter_500Medium',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(234, 179, 8, 0.3)',
  }
});
