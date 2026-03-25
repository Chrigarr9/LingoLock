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

        /// Write the grace period timestamp so the Swift intent can skip
        /// opening the app when the user recently completed practice.
        Function("setGraceTimestamp") { (timestamp: Double) in
            let defaults = UserDefaults(suiteName: "group.com.lingolock.app")
            defaults?.set(timestamp, forKey: "automationGraceTs")
            defaults?.synchronize() // Force flush so the intent reads it immediately
        }
    }
}
