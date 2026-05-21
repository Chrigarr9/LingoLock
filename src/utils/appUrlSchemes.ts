/**
 * Maps a Family Controls localized app name → URL scheme used to launch the app.
 *
 * iOS Screen Time deliberately doesn't expose bundle IDs (privacy). The shield
 * extension only sees `Application.localizedDisplayName` — the name the user sees
 * on the home screen. We pattern-match that name to a known URL scheme.
 *
 * Names are matched case-insensitively. Falls back to `null` if unknown — the
 * caller should then just unlock and let the user re-open via App Switcher.
 *
 * Keys are normalized to lowercase. Aliases handle localized variants
 * ("Photos" / "Fotos" / "Photos & Camera").
 */
const URL_SCHEMES: Record<string, string> = {
  // Social
  instagram: 'instagram://',
  threads: 'barcelona://',
  facebook: 'fb://',
  'fb messenger': 'fb-messenger://',
  messenger: 'fb-messenger://',
  whatsapp: 'whatsapp://',
  telegram: 'tg://',
  signal: 'sgnl://',
  twitter: 'twitter://',
  x: 'twitter://',
  snapchat: 'snapchat://',
  tiktok: 'tiktok://',
  bereal: 'bereal://',
  bluesky: 'bluesky://',
  mastodon: 'mastodon://',
  linkedin: 'linkedin://',
  pinterest: 'pinterest://',
  tumblr: 'tumblr://',
  discord: 'discord://',
  // Video / streaming
  youtube: 'youtube://',
  'youtube music': 'ytmusic://',
  netflix: 'nflx://',
  'disney+': 'disneyplus://',
  'disney plus': 'disneyplus://',
  'prime video': 'aiv://',
  twitch: 'twitch://',
  spotify: 'spotify://',
  music: 'music://',
  soundcloud: 'soundcloud://',
  // Reddit & forums
  reddit: 'reddit://',
  apollo: 'apollo://',
  // Shopping
  amazon: 'com.amazon.mobile.shopping://',
  ebay: 'ebay://',
  // News
  'apple news': 'applenews://',
  // Browser / productivity
  chrome: 'googlechrome://',
  gmail: 'googlegmail://',
  'google maps': 'comgooglemaps://',
  maps: 'maps://',
  photos: 'photos-redirect://',
  messages: 'sms://',
  notes: 'mobilenotes://',
  calendar: 'calshow://',
  reminders: 'x-apple-reminder://',
  // Games
  roblox: 'robloxmobile://',
  'clash royale': 'clashroyale://',
  // Fitness / sports
  strava: 'strava://',
  // Garmin Connect intentionally not mapped — none of the commonly-cited
  // schemes (`garmin://`, `garminconnect://`, `gcm-ciq://`) reliably opens
  // the app, and a wrong mapping degrades UX more than no mapping (the pill
  // shows "Open Garmin", user taps, lands on home instead of Garmin). With
  // no entry the pill says "Unlock" generically and the user re-opens
  // Garmin themselves from the App Switcher — clearer behavior.
};

/**
 * Returns a launchable URL scheme for the given app display name, or null if unknown.
 * Matches case-insensitively against the canonical name and common aliases.
 */
export function getUrlSchemeForApp(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  const key = displayName.trim().toLowerCase();
  if (URL_SCHEMES[key]) return URL_SCHEMES[key];
  // Loose match: try the first word (handles "Instagram Threads", "YouTube Kids", etc.)
  const firstWord = key.split(/\s+/)[0];
  if (firstWord && URL_SCHEMES[firstWord]) return URL_SCHEMES[firstWord];
  return null;
}
