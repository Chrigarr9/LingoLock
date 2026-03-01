# Vokabeltrainer

## What This Is

Eine iOS-App (später auch Android), die Vokabellernen nahtlos in den Alltag integriert durch Screen-Time-Management. Nutzer importieren Anki-Decks (.apkg) und müssen Vokabeln beantworten, um blockierte Apps zu entsperren oder weiterzunutzen. Die App unterbricht regelmäßig die Handy-Nutzung mit Vokabel-Challenges (beim Öffnen von Apps und während der Nutzung), sodass Lernen automatisch passiert ohne aktive Planung.

## Core Value

Vokabeln müssen zum User kommen, nicht umgekehrt — Lernen wird automatisch in den Alltag integriert durch intelligentes App-Blocking, ohne dass der User aktiv eine Lern-Session starten muss.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User kann Anki .apkg Decks importieren (nur Karten, kein bestehender Fortschritt)
- [ ] User muss Vokabeln beantworten, um blockierte Apps zu öffnen
- [ ] User wird während App-Nutzung regelmäßig (3-5 Min Timer) mit Vokabeln unterbrochen
- [ ] User kann pro App konfigurieren: Anzahl Vokabeln, Timer-Intervall, komplette Ausnahmen
- [ ] Vokabel-Challenges nutzen Anki's Spaced Repetition Algorithm
- [ ] User kann Vokabeln per Freitext-Eingabe (Standard), Multiple Choice oder Yes/No beantworten
- [ ] User sieht Statistiken: Streak-Tracking, Erfolgsrate, Fortschritt pro App
- [ ] Falsche Antworten werden nach Anki-Algorithmus wiederholt (60s Intervall)
- [ ] App funktioniert komplett offline (lokale Speicherung)

### Out of Scope

- **Android** — V1 Fokus auf iOS (kein Android-Testgerät vorhanden)
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
| iOS Shortcuts statt FamilyControls/Screen Time API | Viel einfacher (kein Apple Entitlement, kein 2-3 Wochen Approval), OneSec zeigt dass es funktioniert, User will nur "Commitment Device" nicht "hard block" | ✓ Good |
| URL Scheme Integration | Shortcuts können App via vokabeltrainer:// öffnen, dann Deep-Link zurück zur Original-App | — Pending |
| Anki .apkg Import (kein eigener Content) | Fokus auf Mechanik, nicht Content-Creation; Lizenzfragen bei vorinstallierten Decks ungeklärt | — Pending |
| FSRS Spaced Repetition Algorithm | Moderner als SM-2, wissenschaftlich validiert, Anki 23.10+ Standard | — Pending |
| Freitext-Eingabe als Standard | Forschung zeigt Active Recall ist effektivster Lern-Modus (80% vs 34% Retention) | — Pending |
| Offline-First (keine Cloud) | Keep it simple, reduziert Komplexität und Kosten für V1 | — Pending |
| Keine Cross-Device-Sync | Simplicity over features, Single-Device-Use-Case ausreichend für V1 | — Pending |
| Minimalistisches & Modernes Design | Fokus auf Funktion statt Ablenkung, passt zu Produktivitäts-Tool | — Pending |
| Timer Interruptions aus Scope | Shortcuts können Apps nicht während Nutzung unterbrechen (bräuchte Background Execution = Screen Time API) | — Pending |

---
*Last updated: 2026-03-01 after initialization*
