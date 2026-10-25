export function getApiKey() {
  const key = process.env.NOTES_API_KEY;
  if (!key) throw new Error("NOTES_API_KEY is not set");
  return key;
}
