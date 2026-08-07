import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useStudySessionStore } from "../store/studySessionStore";
import { Colors } from "../constants/theme";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      // If StudyOS session exists, open straight into StudyOS (fast path).
      // Otherwise open the normal PathWise dashboard.
      const studyOSMode = useStudySessionStore.getState().isStudyOSMode;
      router.replace(studyOSMode ? "/(app)/studyos" : "/(app)/dashboard");
    } else {
      router.replace("/(auth)/sign-in");
    }
  }, [isSignedIn, isLoaded]);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
