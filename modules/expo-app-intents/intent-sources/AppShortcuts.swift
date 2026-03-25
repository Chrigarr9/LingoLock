import AppIntents

/// Auto-registers LingoLock shortcuts in the Shortcuts app.
/// Users see them when searching for "LingoLock" in the action picker.
@available(iOS 16.4, *)
struct LingoLockShortcuts: AppShortcutsProvider {
    @AppShortcutsBuilder
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartPracticeIntent(),
            phrases: [
                "Start practice in \(.applicationName)",
                "Practice vocabulary with \(.applicationName)",
            ],
            shortTitle: "Start Practice",
            systemImageName: "book.fill"
        )
        AppShortcut(
            intent: PracticeNeededIntent(),
            phrases: [
                "Is \(.applicationName) practice needed",
            ],
            shortTitle: "Practice Needed",
            systemImageName: "timer"
        )
    }
}
