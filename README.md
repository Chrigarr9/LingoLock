# LingoLock 🔒📚

**Vocabulary learning that comes to you — not the other way around.**

LingoLock integrates vocabulary learning seamlessly into your daily phone usage through multiple touchpoints: device unlock, app openings, timed notifications, and Lock Screen widgets. Import your Anki decks and learn vocabulary automatically without planning study sessions.

---

## ✨ Features

- 🔓 **Device Unlock Automation** — Vocabulary challenges when you unlock your phone
- 📲 **App-Open Challenges** — Learn before accessing Instagram, TikTok, etc.
- 🔔 **Timed Notifications** — Regular vocabulary prompts every 3-5 minutes
- 🔒 **Lock Screen Widget** — Answer vocabulary directly on your Lock Screen (Live Activities)
- 📱 **Interactive Notifications** — Answer A/B/C/D without opening the app
- 🧠 **FSRS Spaced Repetition** — Scientifically-proven scheduling algorithm
- 📥 **Anki Import** — Import your existing .apkg decks
- 📊 **Progress Tracking** — Streak counting, success rate, per-app statistics
- 🌐 **Offline-First** — No cloud, no account, all data stored locally

---

## 🗺️ Roadmap

**Phase 1: Shortcuts Integration & Basic UI** (Current)
- URL Scheme integration
- Device unlock automation
- App-open automation
- Basic vocabulary challenge screen

**Phase 2: Spaced Repetition & Progress**
- FSRS algorithm implementation
- Progress tracking & statistics
- Offline persistence

**Phase 3: Deck Import**
- Anki .apkg file parsing
- Import text, images, audio

**Phase 4: Notifications & Live Activities**
- Timed local notifications
- Interactive notifications
- Lock Screen Live Activities

**Phase 5: Configuration & Settings**
- Per-app customization
- Notification preferences
- Whitelist management

---

## 🛠️ Tech Stack

- **React Native** + **Expo** — Cross-platform development
- **iOS Shortcuts** — Device unlock & app-open automation
- **Local Notifications** — Timed vocabulary reminders
- **Live Activities** — Lock Screen widget (iOS 16+)
- **Interactive Notifications** — Answer from notifications
- **FSRS** — Spaced repetition algorithm
- **MMKV** — High-performance local storage

**No Screen Time API required!** — Fully accessible without Apple entitlements.

---

## 📦 Getting Started

```bash
# Install dependencies
npm install

# Start Expo development server
npm start

# Run on iOS (requires Expo Go app)
npm run ios
```

---

## 🎯 Core Value

**Vocabulary comes to you, not the other way around.**

LingoLock brings learning moments into your daily flow through multiple touchpoints — you don't need to actively plan study sessions. The app integrates vocabulary practice into your existing phone habits.

---

## 📄 Documentation

- [Project Plan](/.planning/PROJECT.md) — Core concept & key decisions
- [Requirements](/.planning/REQUIREMENTS.md) — Detailed feature specifications
- [Roadmap](/.planning/ROADMAP.md) — Phase breakdown & success criteria
- [Research](/.planning/research/) — Domain research & technical findings

---

## 🤝 Contributing

This is a personal learning project. Contributions welcome once MVP is released!

---

## 📝 License

MIT License — See [LICENSE](LICENSE) for details.

---

**Built with ❤️ and Claude** | [GSD Methodology](https://github.com/anthropics/claude-code)
