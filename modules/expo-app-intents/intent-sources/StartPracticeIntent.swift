import AppIntents
import UIKit

/// Apps available for the "Start Practice" automation.
/// The user picks one when setting up the Shortcuts automation.
/// This list MUST match APP_SCHEMES in src/utils/deepLinkOpener.ts.
@available(iOS 16.0, *)
enum SourceApp: String, AppEnum {
    // Social
    case instagram = "Instagram"
    case tiktok = "TikTok"
    case facebook = "Facebook"
    case twitter = "Twitter"
    case x = "X"
    case snapchat = "Snapchat"
    case threads = "Threads"
    case bereal = "BeReal"
    case pinterest = "Pinterest"
    case reddit = "Reddit"
    case linkedin = "LinkedIn"
    case tumblr = "Tumblr"
    // Messaging
    case whatsapp = "WhatsApp"
    case telegram = "Telegram"
    case discord = "Discord"
    case signal = "Signal"
    case messenger = "Messenger"
    // Video & Streaming
    case youtube = "YouTube"
    case netflix = "Netflix"
    case twitch = "Twitch"
    case disneyPlus = "Disney+"
    case primeVideo = "Prime Video"
    // Music
    case spotify = "Spotify"
    case appleMusic = "Apple Music"
    case soundcloud = "SoundCloud"
    // Browsers & Utilities
    case chrome = "Chrome"
    case safari = "Safari"
    case gmail = "Gmail"
    case maps = "Maps"
    case photos = "Photos"
    case messages = "Messages"
    case mail = "Mail"
    case notes = "Notes"
    case calendar = "Calendar"
    case reminders = "Reminders"
    case settings = "Settings"
    // Gaming
    case roblox = "Roblox"
    case clashRoyale = "Clash Royale"
    // Catch-all
    case other = "Other"

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "App"

    static var caseDisplayRepresentations: [SourceApp: DisplayRepresentation] {
        [
            .instagram: "Instagram",
            .tiktok: "TikTok",
            .facebook: "Facebook",
            .twitter: "Twitter",
            .x: "X",
            .snapchat: "Snapchat",
            .threads: "Threads",
            .bereal: "BeReal",
            .pinterest: "Pinterest",
            .reddit: "Reddit",
            .linkedin: "LinkedIn",
            .tumblr: "Tumblr",
            .whatsapp: "WhatsApp",
            .telegram: "Telegram",
            .discord: "Discord",
            .signal: "Signal",
            .messenger: "Messenger",
            .youtube: "YouTube",
            .netflix: "Netflix",
            .twitch: "Twitch",
            .disneyPlus: "Disney+",
            .primeVideo: "Prime Video",
            .spotify: "Spotify",
            .appleMusic: "Apple Music",
            .soundcloud: "SoundCloud",
            .chrome: "Chrome",
            .safari: "Safari",
            .gmail: "Gmail",
            .maps: "Maps",
            .photos: "Photos",
            .messages: "Messages",
            .mail: "Mail",
            .notes: "Notes",
            .calendar: "Calendar",
            .reminders: "Reminders",
            .settings: "Settings",
            .roblox: "Roblox",
            .clashRoyale: "Clash Royale",
            .other: "Other (any app)",
        ]
    }
}

/// App Intent: "Start Practice in LingoLock"
/// Opens LingoLock and navigates to the challenge screen via deep link.
/// Has a built-in 60-second grace period to prevent re-triggering when
/// the user taps "Continue to [App]" after completing practice.
/// For longer cooldowns, use PracticeNeededIntent as a gate.
@available(iOS 16.0, *)
struct StartPracticeIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Practice"
    static var description = IntentDescription("Practice vocabulary before using an app")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "App")
    var sourceApp: SourceApp

    @MainActor
    func perform() async throws -> some IntentResult {
        let defaults = UserDefaults(suiteName: "group.com.lingolock.app")
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+")
        let encoded = sourceApp.rawValue.addingPercentEncoding(withAllowedCharacters: allowed) ?? "Other"

        // Built-in 60s grace: prevents re-triggering after "Continue to [App]".
        // Opens a grace screen that auto-redirects (known apps) or shows a message (Other).
        defaults?.synchronize() // Ensure we read the latest value written by JS
        let graceTs = defaults?.double(forKey: "automationGraceTs") ?? 0
        let elapsed = Date().timeIntervalSince1970 * 1000 - graceTs
        if elapsed < 60 * 1000 {
            if let url = URL(string: "lingolock://grace?source=\(encoded)") {
                await UIApplication.shared.open(url)
            }
            return .result()
        }

        // Open deep link so Expo Router navigates directly to practice.
        if let url = URL(string: "lingolock://challenge?source=\(encoded)") {
            await UIApplication.shared.open(url)
        }

        // Fallback: write to UserDefaults for edge cases (cold start timing)
        defaults?.set(sourceApp.rawValue, forKey: "automationSource")

        return .result()
    }
}

/// App Intent: "Practice Needed"
/// Runs silently in the background (openAppWhenRun = false).
/// Returns true if the user should practice (cooldown expired or never practiced),
/// false if practice was recently completed (within cooldown window).
///
/// Example automation:
///   When I open [Instagram]:
///     If "Practice Needed" is Yes:
///       "Start Practice" for [Instagram]
///     End If
@available(iOS 16.0, *)
struct PracticeNeededIntent: AppIntent {
    static var title: LocalizedStringResource = "Practice Needed"
    static var description = IntentDescription("Check if vocabulary practice is due")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Cooldown Minutes", default: 5)
    var cooldownMinutes: Int

    func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
        let defaults = UserDefaults(suiteName: "group.com.lingolock.app")
        let graceTs = defaults?.double(forKey: "automationGraceTs") ?? 0
        let elapsed = Date().timeIntervalSince1970 * 1000 - graceTs
        let cooldownMs = Double(cooldownMinutes) * 60.0 * 1000.0
        let needsPractice = elapsed >= cooldownMs
        return .result(value: needsPractice)
    }
}
