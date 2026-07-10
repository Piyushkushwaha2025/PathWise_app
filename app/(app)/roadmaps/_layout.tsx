import { Stack } from 'expo-router';
import { useThemeStore } from "../../../store/useThemeStore";

export default function RoadmapsLayout() {
  const colors = useThemeStore((s) => s.colors);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="create" />
    </Stack>
  );
}
