const fs = require('fs');
const path = 'd:\\AI\\PathWise_Versions\\v1.0.3\\app\\(app)\\_pathwise_profile.tsx';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `      if (total > 0 && done >= total) {
      Alert.alert("Error", firstNameValidation.message);`;
      
// Instead of literal replace, use lines
let lines = content.split(/\r?\n/);

let startIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('if (total > 0 && done >= total) {') && 
        lines[i+1].includes('Alert.alert("Error", firstNameValidation.message);')) {
        startIndex = i;
        break;
    }
}

if (startIndex !== -1) {
    const replacement = `      if (total > 0 && done >= total) {
        count++;
      }
    });
    return count;
  }, [enrolledIds, allRoadmaps, progress]);

  const handleSignOut = async () => {
    try {
      await AsyncStorage.clear();
      await SecureStore.deleteItemAsync('culko_cookies');
      await SecureStore.deleteItemAsync('culko_u');
      await SecureStore.deleteItemAsync('culko_p');
      await SecureStore.deleteItemAsync('gemini_api_key');
      await useStudySessionStore.getState().clearSession();
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch (e) {
      Alert.alert("Error", "Failed to sign out");
    }
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (user) {
                await user.delete();
                await AsyncStorage.clear();
                await SecureStore.deleteItemAsync('culko_cookies');
                await SecureStore.deleteItemAsync('culko_u');
                await SecureStore.deleteItemAsync('culko_p');
                await SecureStore.deleteItemAsync('gemini_api_key');
                await useStudySessionStore.getState().clearSession();
                router.replace("/(auth)/sign-in");
              }
            } catch (error) {
              Alert.alert("Error", "Failed to delete account");
            }
          }
        }
      ]
    );
  };

  const handleEditPicture = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setIsUpdatingImage(true);
        const base64 = \`data:image/jpeg;base64,\${result.assets[0].base64}\`;
        await user?.setProfileImage({ file: base64 });
      }
    } catch (e) {
      Alert.alert("Error", "Failed to update profile picture.");
    } finally {
      setIsUpdatingImage(false);
    }
  };

  const handleSaveSettings = async () => {
    const firstNameValidation = validateNameInput(firstName);
    if (!firstNameValidation.valid) {
      Alert.alert("Error", firstNameValidation.message);`;
    
    // Replace the 2 lines with the entire replacement
    lines.splice(startIndex, 2, replacement);
    
    fs.writeFileSync(path, lines.join('\n'), 'utf8');
    console.log("Fixed corrupted profile file.");
} else {
    console.log("Target not found in lines.");
}
