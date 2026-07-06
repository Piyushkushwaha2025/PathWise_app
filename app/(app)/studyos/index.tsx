import React, { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useCuSessionStore } from '../../../store/cuSessionStore';
import { Colors } from '../../../constants/theme';

export default function StudyOSIndex() {
  const { isConnected, checkConnection } = useCuSessionStore();
  const [isChecking, setIsChecking] = React.useState(true);

  useEffect(() => {
    const init = async () => {
      await checkConnection();
      setIsChecking(false);
    };
    init();
  }, []);

  if (isChecking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (isConnected) {
    return <Redirect href="/(app)/studyos/dashboard" />;
  }

  return <Redirect href="/(app)/studyos/connect" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
