import { View, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Colors } from "../constants/theme";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return <View style={styles.container} />;

  if (isSignedIn) {
    return <Redirect href="/(app)/dashboard" />;
  } else {
    return <Redirect href="/(auth)/sign-in" />;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
