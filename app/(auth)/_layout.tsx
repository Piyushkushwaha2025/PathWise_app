import { Stack, Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { Colors } from "../../constants/theme";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (isLoaded && isSignedIn) {
    return <Redirect href="/(app)/dashboard" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: "fade",
      }}
    />
  );
}
