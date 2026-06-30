/**
 * Input validation utilities
 */

export const MAX_TEXT_INPUT = 5000;
export const MAX_TOPIC_LENGTH = 500;
export const MAX_NAME_LENGTH = 100;
export const MAX_FEEDBACK_LENGTH = 2000;

export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters" };
  }
  return { valid: true };
}

export function validateTopicInput(topic: string): { valid: boolean; message?: string } {
  const trimmed = topic.trim();
  if (!trimmed) {
    return { valid: false, message: "Topic cannot be empty" };
  }
  if (trimmed.length > MAX_TOPIC_LENGTH) {
    return { valid: false, message: `Topic must be less than ${MAX_TOPIC_LENGTH} characters` };
  }
  return { valid: true };
}

export function validateNameInput(name: string): { valid: boolean; message?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, message: "Name cannot be empty" };
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return { valid: false, message: `Name must be less than ${MAX_NAME_LENGTH} characters` };
  }
  return { valid: true };
}

export function validateFeedback(feedback: string): { valid: boolean; message?: string } {
  const trimmed = feedback.trim();
  if (!trimmed) {
    return { valid: false, message: "Feedback cannot be empty" };
  }
  if (trimmed.length > MAX_FEEDBACK_LENGTH) {
    return { valid: false, message: `Feedback must be less than ${MAX_FEEDBACK_LENGTH} characters` };
  }
  return { valid: true };
}
