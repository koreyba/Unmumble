import { getD1 } from "@/db";

export const DEFAULT_NATIVE_LANGUAGE = "ru";

export async function getNativeLanguage(userId: string) {
  const row = await getD1().prepare("SELECT native_language FROM users WHERE id = ?")
    .bind(userId)
    .first<{ native_language: string }>();
  return row?.native_language || DEFAULT_NATIVE_LANGUAGE;
}

export async function setNativeLanguage(userId: string, language: string) {
  await getD1().prepare("UPDATE users SET native_language = ?, updated_at = ? WHERE id = ?")
    .bind(language, new Date().toISOString(), userId)
    .run();
}
