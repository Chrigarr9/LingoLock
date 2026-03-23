import AppIntents
import Foundation

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
        ]
    }
}

/// App Intent: "Start Practice in LingoLock"
/// Triggered by Shortcuts automations. Writes the source app name to
/// App Group UserDefaults so the RN app can read it on foreground.
@available(iOS 16.0, *)
struct StartPracticeIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Practice"
    static var description = IntentDescription("Practice vocabulary before using an app")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "App")
    var sourceApp: SourceApp

    func perform() async throws -> some IntentResult {
        let defaults = UserDefaults(suiteName: "group.com.lingolock.app")
        defaults?.set(sourceApp.rawValue, forKey: "automationSource")
        return .result()
    }
}
