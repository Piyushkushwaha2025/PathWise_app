const fs = require('fs');
const path = 'd:\\AI\\PathWise_Versions\\v1.0.3\\app\\(app)\\_pathwise_profile.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add imports
const importsTarget = `import { useDBProfile } from "../../lib/db";`;
const importsReplacement = `import { useDBProfile, deleteUserFromDB } from "../../lib/db";
import { DeleteAccountModal } from "../../components/modals/DeleteAccountModal";`;

content = content.replace(importsTarget, importsReplacement);

// 2. Add state
const stateTarget = `const [isChangePasswordVisible, setChangePasswordVisible] = useState(false);`;
const stateReplacement = `const [isChangePasswordVisible, setChangePasswordVisible] = useState(false);
  const [isDeleteAccountVisible, setDeleteAccountVisible] = useState(false);`;

content = content.replace(stateTarget, stateReplacement);

// 3. Update handleDeleteAccount
const oldHandleDeleteStr = `  const handleDeleteAccount = async () => {
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
  };`;

const newHandleDeleteStr = `  const handleConfirmDelete = async () => {
    try {
      if (user) {
        // Delete from MongoDB
        await deleteUserFromDB(user.id).catch(e => console.error("DB Delete Error", e));
        
        // Delete from Clerk
        await user.delete();
        
        // Clear Local Storage
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
  };

  const handleDeleteAccount = () => {
    setDeleteAccountVisible(true);
  };`;

content = content.replace(oldHandleDeleteStr, newHandleDeleteStr);

// 4. Inject Modal Component
const modalTarget = `      <ChangePasswordModal
        isVisible={isChangePasswordVisible}
        onClose={() => setChangePasswordVisible(false)}
      />`;
const modalReplacement = `      <ChangePasswordModal
        isVisible={isChangePasswordVisible}
        onClose={() => setChangePasswordVisible(false)}
      />

      <DeleteAccountModal
        isVisible={isDeleteAccountVisible}
        onClose={() => setDeleteAccountVisible(false)}
        onConfirm={handleConfirmDelete}
      />`;

content = content.replace(modalTarget, modalReplacement);

fs.writeFileSync(path, content, 'utf8');
console.log("Updated _pathwise_profile.tsx for DeleteAccountModal");
