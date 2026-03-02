# LingoLock

## What This Is

Eine iOS-App (später auch Android), die Vokabellernen nahtlos in den Alltag integriert durch multiple Touchpoints (Device Unlock, App-Öffnen, Notifications, Lock Screen Widget). Nutzer importieren Anki-Decks (.apkg) und bekommen Vokabel-Challenges beim Entsperren des Phones, beim Öffnen von Apps, durch timed Notifications, und direkt auf dem Lock Screen. Lernen passiert automatisch ohne aktive Planung.

## Core Value

Vokabeln müssen zum User kommen, nicht umgekehrt — Lernen wird automatisch in den Alltag integriert durch multiple Touchpoints (Device Unlock, App-Öffnen, Timed Notifications, Lock Screen Widget), ohne dass der User aktiv eine Lern-Session starten muss.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User kann Anki .apkg Decks importieren (nur Karten, kein bestehender Fortschritt)
- [ ] User bekommt Vokabel-Challenge beim Device Unlock (Shortcuts Automation)
- [ ] User bekommt Vokabel-Challenge beim Öffnen konfigurierter Apps (Shortcuts Automation)
- [ ] User bekommt regelmäßige Vokabel-Notifications (alle 3-5 Min, konfigurierbar)
- [ ] User kann Vokabeln direkt auf Notifications beantworten (Interactive Notifications)
- [ ] User sieht Live Activity auf Lock Screen mit Vokabel-Challenge
- [ ] User kann auf Lock Screen direkt Vokabeln beantworten (swipe down)
- [ ] User kann pro App konfigurieren: Anzahl Vokabeln, Notification-Intervall, komplette Ausnahmen
- [ ] Vokabel-Challenges nutzen FSRS Spaced Repetition Algorithm
- [ ] User kann Vokabeln per Freitext-Eingabe (Standard), Multiple Choice oder Yes/No beantworten
- [ ] User sieht Statistiken: Streak-Tracking, Erfolgsrate, Fortschritt pro App
- [ ] Falsche Antworten werden nach FSRS-Algorithmus wiederholt (60s Intervall)
- [ ] App funktioniert komplett offline (lokale Speicherung)

### Out of Scope

- **Android** — V1 Fokus auf iOS (kein Android-Testgerät vorhanden)
- **Screen Time API Timer Interruptions (DeviceActivityMonitor)** — Später (Phase 6), V1 nutzt Notifications + Live Activities
- **Cross-Device-Sync** — Keep it simple, lokale Daten nur
- **KI-generierte Vokabellisten** — Später, V1 fokussiert auf Anki-Import
- **Vorinstallierte Vokabel-Decks** — Lizenzfragen ungeklärt, User bringen eigene Decks
- **Cloud-Backend** — Offline-First, keine Server-Infrastruktur

## Context

**Technische Validierung:**
- Apps wie OneSec und Forest zeigen, dass iOS Screen Time API funktioniert für App-Blocking
- `react-native-device-activity` Package bietet direkten Zugriff auf Apple's Screen Time APIs (FamilyControls, ManagedSettings, DeviceActivity)
- Expo EAS Build ermöglicht iOS-Entwicklung auf Ubuntu ohne eigene Mac-Hardware

**Wissenschaftliche Grundlage:**
- Active Recall + Spaced Repetition: 80% Retention nach 1 Woche vs. 34% ohne (validiert durch Forschung)
- Kombinierte Test-Formate (Multiple Choice + Freitext) sind am effektivsten
- Anki's Spaced Repetition Algorithm ist wissenschaftlich fundiert

**Bekannte iOS Screen Time API Limitierungen:**
- Limit von 50 Apps pro Block (ausreichend für V1)
- Bugs im App-Picker (crashes beim Suchen)
- Forwarding-Probleme zwischen Shield und App
- DeviceActivityMonitor kann Events zu früh feuern (iOS 26.2 Bug)

## Constraints

- **Entwicklungsumgebung**: Kein Mac verfügbar, nur Ubuntu — React Native + Expo EAS Build erforderlich
- **iOS Screen Time API**: Native Modules notwendig (FamilyControls Permissions), reine PWA nicht möglich
- **Apple Developer Program**: $99/Jahr erforderlich für Screen Time API Entitlements und TestFlight
- **Offline-First**: Keine Cloud-Infrastruktur, alle Daten lokal gespeichert
- **Single-Device**: Kein Cross-Device-Sync, Fortschritt bleibt auf einem Gerät
- **API Limits**: Maximal 50 Apps pro Block (iOS Screen Time API)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React Native + Expo statt Native Swift | Kein Mac verfügbar, Expo EAS Build ermöglicht iOS-Entwicklung auf Ubuntu | — Pending |
| Multi-layered Approach: Shortcuts + Notifications + Live Activities | Viel eleganter als Screen Time API: Device Unlock Automation, Timed Notifications, Lock Screen Interaction — kein Apple Entitlement, sofort entwickelbar | ✓ Good |
| URL Scheme Integration | Shortcuts können App via lingolock:// öffnen, dann Deep-Link zurück zur Original-App | — Pending |
| Interactive Notifications & Live Activities | User kann Vokabeln direkt auf Lock Screen/Notification beantworten (iOS 16+ Feature), sehr user-friendly | ✓ Good |
| Timed Local Notifications statt Screen Time Timer | Alle 3-5 Min Notifications mit Vokabeln, weniger invasiv als App-Blocking, gleicher Effekt | ✓ Good |
| Screen Time API optional/später (Phase 6) | Falls Notifications nicht ausreichen, können wir später DeviceActivityMonitor hinzufügen (braucht Apple Approval) | — Pending |
| Anki .apkg Import (kein eigener Content) | Fokus auf Mechanik, nicht Content-Creation; Lizenzfragen bei vorinstallierten Decks ungeklärt | — Pending |
| FSRS Spaced Repetition Algorithm | Moderner als SM-2, wissenschaftlich validiert, Anki 23.10+ Standard | — Pending |
| Freitext-Eingabe als Standard | Forschung zeigt Active Recall ist effektivster Lern-Modus (80% vs 34% Retention) | — Pending |
| Offline-First (keine Cloud) | Keep it simple, reduziert Komplexität und Kosten für V1 | — Pending |
| Keine Cross-Device-Sync | Simplicity over features, Single-Device-Use-Case ausreichend für V1 | — Pending |
| Minimalistisches & Modernes Design | Fokus auf Funktion statt Ablenkung, passt zu Produktivitäts-Tool | — Pending |

---
*Last updated: 2026-03-01 after initialization*
