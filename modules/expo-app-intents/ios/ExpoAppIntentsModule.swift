import ExpoModulesCore

public class ExpoAppIntentsModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ExpoAppIntents")

        /// Read and clear the pending automation source app name.
        /// Returns the app name string (e.g. "Instagram") or nil if no
        /// automation is pending.
        Function("consumeAutomationSource") { () -> String? in
            let defaults = UserDefaults(suiteName: "group.com.lingolock.app")
            guard let source = defaults?.string(forKey: "automationSource") else {
                return nil
            }
            defaults?.removeObject(forKey: "automationSource")
            return source
        }
    }
}
