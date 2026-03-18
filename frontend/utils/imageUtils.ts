
/**
 * Prefixes relative image URLs with the backend base URL.
 * Handles both absolute and relative paths.
 */
export const getImageUrl = (url: string | undefined): string => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  
  // Get API base URL and remove the /api suffix to get the root
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5005/api";
  const baseUrl = API_BASE_URL.replace("/api", "");
  
  // Ensure no double slashes
  const cleanUrl = url.startsWith("/") ? url.slice(1) : url;
  return `${baseUrl}/${cleanUrl}`;
};
