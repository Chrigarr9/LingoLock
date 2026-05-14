//
//  ShieldActionExtension.swift
//  ShieldAction
//
//  Created by Robert Herber on 2024-10-25.
//

import FamilyControls
import ManagedSettings
import UIKit

func handleShieldAction(
  configForSelectedAction: [String: Any],
  placeholders: [String: String?],
  applicationToken: ApplicationToken?,
  webdomainToken: WebDomainToken?,
  categoryToken: ActivityCategoryToken?
) -> ShieldActionResponse {
  logger.log("handleAction")
  if let actions = configForSelectedAction["actions"] as? [[String: Any]] {
    for action in actions {
      executeGenericAction(
        action: action,
        placeholders: placeholders,
        triggeredBy: "shieldAction",
        applicationToken: applicationToken,
        webdomainToken: webdomainToken,
        categoryToken: categoryToken
      )
    }
  }

  if let type = configForSelectedAction["type"] as? String {
    logger.log("type: \(type, privacy: .public)")
    if type == "disableBlockAllMode" {
      disableBlockAllMode(triggeredBy: "shieldAction")
    }

    let onlyFamilySelectionIdsContainingMonitoredActivityNames =
      configForSelectedAction["onlyFamilySelectionIdsContainingMonitoredActivityNames"] as? Bool
      ?? true

    let sortByGranularity = true

    if type == "unblockPossibleFamilyActivitySelection" {
      if let possibleFamilyActivitySelectionId = getPossibleFamilyActivitySelectionIds(
        applicationToken: applicationToken,
        webDomainToken: webdomainToken,
        categoryToken: categoryToken,
        onlyFamilySelectionIdsContainingMonitoredActivityNames:
          onlyFamilySelectionIdsContainingMonitoredActivityNames,
        sortByGranularity: sortByGranularity
      ).first?.id {
        if let selection = getFamilyActivitySelectionById(id: possibleFamilyActivitySelectionId) {
          unblockSelection(removeSelection: selection, triggeredBy: "shieldAction")
        }
      }
    }

    if type == "unblockAllPossibleFamilyActivitySelections" {
      let possibleFamilyActivitySelections = getPossibleFamilyActivitySelectionIds(
        applicationToken: applicationToken,
        webDomainToken: webdomainToken,
        categoryToken: categoryToken,
        onlyFamilySelectionIdsContainingMonitoredActivityNames:
          onlyFamilySelectionIdsContainingMonitoredActivityNames,
        sortByGranularity: sortByGranularity
      )

      for selection in possibleFamilyActivitySelections {
        unblockSelection(
          removeSelection: selection.selection,
          triggeredBy: "shieldAction"
        )
      }
    }

    if type == "whitelistPossibleFamilyActivitySelection" {
      if let possibleFamilyActivitySelectionId = getPossibleFamilyActivitySelectionIds(
        applicationToken: applicationToken,
        webDomainToken: webdomainToken,
        categoryToken: categoryToken,
        onlyFamilySelectionIdsContainingMonitoredActivityNames:
          onlyFamilySelectionIdsContainingMonitoredActivityNames,
        sortByGranularity: sortByGranularity
      ).first?.id {
        if let selection = getFamilyActivitySelectionById(id: possibleFamilyActivitySelectionId) {
          addSelectionToWhitelistAndUpdateBlock(
            whitelistSelection: selection,
            triggeredBy: "shieldAction"
          )
        }
      }
    }

    if type == "whitelistAllPossibleFamilyActivitySelections" {
      let possibleFamilyActivitySelections = getPossibleFamilyActivitySelectionIds(
        applicationToken: applicationToken,
        webDomainToken: webdomainToken,
        categoryToken: categoryToken,
        onlyFamilySelectionIdsContainingMonitoredActivityNames:
          onlyFamilySelectionIdsContainingMonitoredActivityNames,
        sortByGranularity: sortByGranularity
      )

      for selection in possibleFamilyActivitySelections {
        addSelectionToWhitelistAndUpdateBlock(
          whitelistSelection: selection.selection,
          triggeredBy: "shieldAction"
        )
      }
    }

    if type == "resetBlocks" {
      resetBlocks(triggeredBy: "shieldAction")
    }

    // LOCAL PATCH (LingoLock): substitute {applicationName} in URL so host app
    // receives e.g. lingolock://challenge?source=screentime&app=Instagram. The
    // JS side URL-encodes the curly braces (%7B/%7D) so iOS reliably routes
    // the URL even if this patch isn't applied; we decode them back before
    // running placeholder substitution.
    let url = (configForSelectedAction["url"] as? String).map { rawUrl -> String in
      let decoded = rawUrl
        .replacingOccurrences(of: "%7B", with: "{")
        .replacingOccurrences(of: "%7D", with: "}")
      return replacePlaceholders(decoded, with: placeholders)
    }

    // LOCAL PATCH (LingoLock): write a pending-shield-action marker to App
    // Group UserDefaults whenever a LingoLock-recognized shield action fires.
    // The marker is the cross-process carrier that tells the host app
    // "shield was tapped — route to /challenge with this app name". Two
    // detection paths:
    //   1. categoryIdentifier == "lingolock-shield-practice" — the current
    //      sendNotification flow (the user taps "Practice now" on a shield,
    //      we fire a notification, this branch writes the marker so when
    //      they tap the notification and AppState→active fires, the marker
    //      is read and they route to /challenge with the app name).
    //   2. url hasPrefix lingolock:// — legacy openUrl path; kept for
    //      redundancy if the shield config ever switches back.
    // Without this marker the notification tap opens LingoLock to home
    // instead of /challenge — exactly the bug we're fixing.
    let payload = configForSelectedAction["payload"] as? [String: Any]
    let categoryId = payload?["categoryIdentifier"] as? String
    let isLingoLockShield = (categoryId == "lingolock-shield-practice")
      || (url?.hasPrefix("lingolock://") ?? false)

    if isLingoLockShield {
      // Use the unified display name (added above) so category-shielded apps
      // get a meaningful label instead of "" (the bare applicationName field
      // is nil when the shield fires for an ActivityCategoryToken).
      let appName: String = placeholders["applicationOrDomainDisplayName"].flatMap { $0 } ?? ""
      userDefaults?.set(
        [
          "url": url ?? "",
          "app": appName,
          "ts": Date().timeIntervalSince1970 * 1000
        ],
        forKey: "lingolock.pendingShieldAction"
      )
      // Defensive: force the App Group suite to flush before the extension
      // returns. iOS 16+ generally syncs cross-process automatically, but
      // app-intents-automation.md flagged prior burns on stale reads. Cheap.
      userDefaults?.synchronize()
    }

    if type == "openUrl" {
      openUrl(urlString: url ?? "device-activity://")
    }

    if type == "openUrlWithDispatch" {
      DispatchQueue.main.async(execute: {
        openUrl(urlString: url ?? "device-activity://")
      })
    }

    if type == "sendNotification" {
      if let payload = configForSelectedAction["payload"] as? [String: Any] {
        // LOCAL PATCH (LingoLock): pass the real placeholders dict so
        // {applicationOrDomainDisplayName} in title/body/subtitle gets
        // substituted with the actual app name. Library stock passes [:]
        // which leaves the literal "{applicationOrDomainDisplayName}"
        // visible in the notification body.
        sendNotification(contents: payload, placeholders: placeholders)
      }
    }

    if type == "addCurrentToWhitelist" {
      var selection = getCurrentWhitelist()

      if let applicationToken = applicationToken {
        selection.applicationTokens.insert(applicationToken)
      }

      if let webdomainToken = webdomainToken {
        selection.webDomainTokens.insert(webdomainToken)
      }

      if let categoryToken = categoryToken {
        selection.categoryTokens.insert(categoryToken)
      }

      saveCurrentWhitelist(whitelist: selection)
      updateBlock(triggeredBy: "shieldAction")
    }
  }

  CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)

  if let behavior = configForSelectedAction["behavior"] as? String {
    if behavior == "defer" {
      return .defer
    }
  }

  return .close
}

func handleAction(
  action: ShieldAction,
  completionHandler: @escaping (ShieldActionResponse) -> Void,
  applicationToken: ApplicationToken?,
  webdomainToken: WebDomainToken?,
  categoryToken: ActivityCategoryToken?
) {
  CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)

  if let shieldActionConfig = getActivitySelectionPrefixedConfigFromUserDefaults(
    keyPrefix: SHIELD_ACTIONS_FOR_SELECTION_PREFIX,
    fallbackKey: SHIELD_ACTIONS_KEY,
    applicationToken: applicationToken,
    webDomainToken: webdomainToken,
    categoryToken: categoryToken
  ) {
    let actionButton = action == .primaryButtonPressed ? "primary" : "secondary"
    let familyActivitySelectionId = getPossibleFamilyActivitySelectionIds(
      applicationToken: applicationToken,
      webDomainToken: webdomainToken,
      categoryToken: categoryToken,
      onlyFamilySelectionIdsContainingMonitoredActivityNames: true,
      sortByGranularity: true
    ).first
    if let configForSelectedAction = shieldActionConfig[actionButton] as? [String: Any] {
      // LOCAL PATCH (LingoLock): add applicationOrDomainDisplayName with a
      // fallback chain app → web domain. The library's stock dict only
      // populates applicationName when the shield fires for a specific app;
      // if the user picked a whole category in the picker, the shield fires
      // with categoryToken and applicationName is nil — which makes
      // replacePlaceholders substitute the literal key string into the URL.
      // ShieldConfigurationExtension already uses this same key for its
      // subtitle placeholder; mirroring it here keeps URL substitution
      // working for app and web shields. Category shields fall through to
      // nil — the JS deep-link handler's isUnfilled check drops the literal
      // placeholder string. The picker is now configured with
      // includeEntireCategory=true so category selections expand into
      // individual app tokens, making the category branch effectively dead.
      let displayName: String? = applicationToken != nil
        ? Application(token: applicationToken!).localizedDisplayName
        : (webdomainToken != nil
          ? WebDomain(token: webdomainToken!).domain
          : nil)
      let placeholders: [String: String?] = [
        "action": actionButton,
        "applicationName": applicationToken != nil
          ? Application(token: applicationToken!).localizedDisplayName : nil,
        "webDomain": webdomainToken != nil
          ? WebDomain(
            token: webdomainToken!
          ).domain : nil,
        "applicationOrDomainDisplayName": displayName,
        "familyActivitySelectionId": familyActivitySelectionId?.id
      ]

      let response = handleShieldAction(
        configForSelectedAction: configForSelectedAction,
        placeholders: placeholders,
        applicationToken: applicationToken,
        webdomainToken: webdomainToken,
        categoryToken: categoryToken
      )
      if let delay = configForSelectedAction["delay"] as? Double {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
          completionHandler(response)
        }
      } else {
        completionHandler(response)
      }
    } else {
      completionHandler(.close)
    }
  } else {
    completionHandler(.close)
  }
}

// Override the functions below to customize the shield actions used in various situations.
// The system provides a default response for any functions that your subclass doesn't override.
// Make sure that your class name matches the NSExtensionPrincipalClass in your Info.plist.
class ShieldActionExtension: ShieldActionDelegate {
  override func handle(
    action: ShieldAction, for application: ApplicationToken,
    completionHandler: @escaping (ShieldActionResponse) -> Void
  ) {
    logger.log("handle application")

    handleAction(
      action: action,
      completionHandler: completionHandler,
      applicationToken: application,
      webdomainToken: nil,
      categoryToken: nil
    )
  }

  override func handle(
    action: ShieldAction, for webDomain: WebDomainToken,
    completionHandler: @escaping (ShieldActionResponse) -> Void
  ) {
    logger.log("handle domain")

    handleAction(
      action: action,
      completionHandler: completionHandler,
      applicationToken: nil,
      webdomainToken: webDomain,
      categoryToken: nil
    )
  }

  override func handle(
    action: ShieldAction, for category: ActivityCategoryToken,
    completionHandler: @escaping (ShieldActionResponse) -> Void
  ) {
    logger.log("handle category")

    handleAction(
      action: action,
      completionHandler: completionHandler,
      applicationToken: nil,
      webdomainToken: nil,
      categoryToken: category
    )
  }
}
