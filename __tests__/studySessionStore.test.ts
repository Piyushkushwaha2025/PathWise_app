// @ts-nocheck
import { useStudySessionStore } from '../store/studySessionStore';
import * as SecureStore from 'expo-secure-store';

// Mock SecureStore
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('StudySessionStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useStudySessionStore.setState({
      universityId: null,
      lmsSesskey: null,
      lmsUserId: null,
      isSessionValid: false,
    });
    jest.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const state = useStudySessionStore.getState();
    expect(state.universityId).toBeNull();
    expect(state.lmsSesskey).toBeNull();
    expect(state.lmsUserId).toBeNull();
    expect(state.isSessionValid).toBeFalsy();
  });

  it('setSession updates state and saves to SecureStore', async () => {
    const store = useStudySessionStore.getState();
    await store.setSession('lpu', 'fake-sesskey', 12345);

    const newState = useStudySessionStore.getState();
    expect(newState.universityId).toBe('lpu');
    expect(newState.lmsSesskey).toBe('fake-sesskey');
    expect(newState.lmsUserId).toBe(12345);
    expect(newState.isSessionValid).toBeTruthy();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('uni_id', 'lpu');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('lms_sesskey', 'fake-sesskey');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('lms_userid', '12345');
  });

  it('clearSession clears state and removes from SecureStore', async () => {
    // Set initial active session
    useStudySessionStore.setState({
      universityId: 'cu',
      lmsSesskey: 'active-key',
      lmsUserId: 999,
      isSessionValid: true,
    });

    const store = useStudySessionStore.getState();
    await store.clearSession();

    const newState = useStudySessionStore.getState();
    expect(newState.universityId).toBeNull();
    expect(newState.lmsSesskey).toBeNull();
    expect(newState.lmsUserId).toBeNull();
    expect(newState.isSessionValid).toBeFalsy();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('uni_id');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lms_sesskey');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lms_userid');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('lms_cookie');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('portal_session');
  });
});
