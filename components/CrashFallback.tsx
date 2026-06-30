import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from "react-native";
import * as Updates from "expo-updates";
import { AlertCircle, RefreshCw } from "lucide-react-native";

interface CrashFallbackProps {
  error: Error;
  resetError: () => void;
}

export default function CrashFallback({ error, resetError }: CrashFallbackProps) {
  const isOtaUpdate = !!Updates.updateId;

  const handleRestart = async () => {
    try {
      if (isOtaUpdate) {
        await Updates.reloadAsync();
      } else {
        resetError();
      }
    } catch (e) {
      resetError();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <AlertCircle size={64} color="#ef4444" style={styles.icon} />
        <Text style={styles.title}>Oops! Something went wrong.</Text>
        <Text style={styles.subtitle}>
          The app encountered a critical error and needs to restart.
        </Text>

        {isOtaUpdate && (
          <View style={styles.otaWarningBox}>
            <Text style={styles.otaWarningText}>
              We detected this crash on a downloaded update. Restarting will attempt to recover the app.
            </Text>
          </View>
        )}

        <View style={styles.errorBox}>
          <Text style={styles.errorText} numberOfLines={4}>
            {error.message}
          </Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleRestart}>
          <RefreshCw size={20} color="#fff" />
          <Text style={styles.buttonText}>Restart App</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050505",
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#a1a1aa",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
  },
  otaWarningBox: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    width: "100%",
  },
  otaWarningText: {
    color: "#fca5a5",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: "#18181b",
    padding: 16,
    borderRadius: 12,
    width: "100%",
    marginBottom: 32,
  },
  errorText: {
    color: "#ef4444",
    fontFamily: "monospace",
    fontSize: 12,
  },
  button: {
    flexDirection: "row",
    backgroundColor: "#7c3aed",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
