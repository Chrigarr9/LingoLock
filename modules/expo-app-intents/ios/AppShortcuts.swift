import AppIntents

/// Auto-registers the "Start Practice" shortcut in the Shortcuts app.
/// Users see it when searching for "LingoLock" in the action picker.
@available(iOS 16.4, *)
struct LingoLockShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        [
            AppShortcut(
                intent: StartPracticeIntent(),
                phrases: [
                    "Start practice in \(.applicationName)",
                    "Practice vocabulary with \(.applicationName)",
                ],
                shortTitle: "Start Practice",
                systemImageName: "book.fill"
            )
        ]
    }
}
