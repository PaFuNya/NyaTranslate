# 🐱 NyaTranslate-喵译

<p align="center">
  <strong>AI-powered selection translation & terminology dictionary browser extension · Multi-model · Screenshot vision translation · Word book</strong>
</p>

<p align="center">
  <a href="./README.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-green" alt="Manifest V3">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

## ✨ Introduction

**NyaTranslate-喵译** is a modern Chrome browser extension: select text on any webpage and get instant translation, terminology explanation or word dictionary results from any OpenAI-compatible or Anthropic-protocol model you configure. It also supports area-screenshot and image vision translation, with translation history and a word book built in.

## 🎯 Core Features

- **Selection translation**: select text on any webpage for instant results
- **Multi-model**: connect multiple providers (OpenAI / Anthropic / DeepSeek / Qwen / any compatible endpoint) and compare results in parallel cards
- **Preferred model + on-demand**: only the preferred model runs automatically; other cards query on click, saving API quota
- **Word dictionary**: selecting a single English word shows phonetics, parts of speech, definitions, examples, collocations and synonyms, cached locally
- **Word book**: bookmark dictionary entries and review them in the popup
- **Vision translation**: area screenshot (Alt+Shift+S or context menu) and right-click image text extraction
- **History**: automatic saving with search, copy and per-item delete

## 🚀 Features

- **Multiple trigger methods**: icon click, double-click, modifier keys, direct search, hover select — configurable per scenario
- **Language matching**: filter by source language (zh/en/ja/ko/fr/es/de), optional strict mode
- **Panel modes**: floating / pinned to screen / pinned to page (sticky note), with drag & resize
- **Material You theme**: three Monet palettes × light/dark/system, synced across all surfaces
- **Pronunciation**: one-click word reading (speechSynthesis)
- **Privacy first**: API keys stored locally only, never uploaded; history saving optional

## 📦 Installation

### Load unpacked (developer mode)

1. Download the source or `git clone https://github.com/PaFuNya/NyaTranslate.git`
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select the repository root
5. Click the extension icon → open Settings → add a model with your API key and Base URL

### Requirements

- Chrome 88+ (Manifest V3)

## 🎮 Usage Guide

### Basics

1. Select text on any webpage (1–500 characters)
2. Trigger methods (configurable under "Trigger rules"):
   - Click the floating bubble icon after selecting
   - Panel opens directly on selection
   - Double-click the selection
   - Select while holding Ctrl/Alt/Shift
   - Hover auto-select
3. View per-model result cards; click "Copy" to save
4. Close with Esc, clicking outside; scrolling hides the icon but keeps the panel

### Model configuration

1. Click the extension icon → "Open settings"
2. Under "API configuration" click "Add model", pick a preset or custom
3. Fill display name, Model ID, Base URL and API Key
4. Toggle models on/off; mark a "Preferred" model for automatic queries; enable "Vision" for visual-capable models

### Screenshot translation

- Press `Alt+Shift+S` (Mac: `Ctrl+Shift+S`) and drag an area
- Or right-click → "Area screenshot translate"
- Right-click an image → "Extract & translate image text"
- Screenshot/image translation uses the first enabled **vision** model

### Word book & history

- Click "Save" on a dictionary card to add it to the word book; review in the popup
- History tab supports search, click-to-copy, per-item delete and clear-all
- History saving can be disabled in settings

## ⚙️ Settings

| Section | Description |
|---|---|
| API configuration | Per-model Base URL / API Key / protocol / vision flag / preferred flag |
| Basic | Input-field suppression, touch mode |
| Language match | Source-language trigger filtering and strict mode |
| Trigger rules | Per-scenario triggers (normal / pinned / inside panel) |
| Preferences | Default action, word dictionary toggle, example complexity, history toggle |
| Appearance | Light/dark/system, three Monet palettes, corner radius and background |

## 🛠️ Project structure

```
NyaTranslate/
├── manifest.json              # Extension manifest (Manifest V3)
├── background.js              # Service worker: adapters, dispatch, history, word book, screenshots
├── content_utils.js           # Config, language detection, trigger engine
├── content_drag.js            # Panel drag & resize (Pointer Events)
├── content_panel.js           # Panel and card UI
├── content_screenshot.js      # Screenshot overlay and vision result panel
├── content_main.js            # Content script entry and event orchestration
├── appearance.js              # Appearance distribution across surfaces
├── material-select.js         # Custom dropdown component
├── popup.html/js/css          # Extension popup (status/history/word book)
├── options.html/js/css        # Settings page
├── theme.css                  # MD3 semantic colors and design tokens
├── style.css                  # Selection panel styles
├── icons/                     # Extension icons
├── generate-icons.js          # Zero-dependency icon generator
├── PRIVACY.md                 # Privacy policy
└── .github/workflows/         # Release workflow
```

## 🔒 Privacy

All API keys are stored locally via `chrome.storage.local` and are never uploaded to any third-party server; query text is sent only to the model endpoints you configure. See [PRIVACY.md](./PRIVACY.md) for details.

## 🤝 Contributing

Issues and pull requests are welcome. Before submitting, please:

- Follow the existing code style and file responsibilities
- Use clear commit messages
- Ensure `node --check` passes
- Update related documentation

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Made with ❤️ and 🐱 by NyaTranslate Team
</p>
