
/**
 * Resolves an image URL to a fully-qualified URL.
 *
 * Handles the following cases:
 *  - Already absolute (http/https) — returned as-is.
 *  - data: / blob: URLs — returned as-is.
 *  - Windows backslash paths saved by the server — normalised to forward slashes.
 *  - Relative paths (e.g. "uploads/img.jpg") — prefixed with the server origin.
 *    The /api suffix is stripped from VITE_API_BASE_URL using a regex so it only
 *    matches the path segment at the end, not inside longer paths.
 */
export const getImageUrl = (url: string | undefined | null): string => {
  if (!url) return "";

  // Pass through already-resolved URLs
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;

  // Normalise Windows backslashes that may have been stored by the backend
  const normalized = url.replace(/\\/g, "/");

  // Derive the server origin by stripping the trailing /api (and nothing else)
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:5005/api";
  const serverOrigin = API_BASE_URL.replace(/\/api\/?$/, "");

  // Build the final URL — strip any leading slash from the path to avoid double //
  const cleanPath = normalized.startsWith("/") ? normalized.slice(1) : normalized;
  return `${serverOrigin}/${cleanPath}`;
};
