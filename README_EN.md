# 🐱 NyaTranslate-喵译

<p align="center">
  <strong>AI-Powered Translation & Terminology Explanation Chrome Extension | Cat-Girl Theme · Beautiful Animations · Elegant Experience</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage-guide">Usage Guide</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#development">Development</a> •
  <a href="#contributing">Contributing</a> •
  <a href="./README.md">中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-v2.0.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/Manifest-V3-green" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Language-English-blue" alt="Language">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

## ✨ Introduction

**NyaTranslate-喵译** is a modern Chrome browser extension designed for users who frequently need translation and professional terminology explanations. It not only provides accurate AI-powered translation and terminology explanations but also features a delightful cat-girl themed interface with smooth animations, making translation work fun and enjoyable Nya~

### 🎯 Core Features

- **Smart Text Selection Translation**: Select text on any webpage and get instant translation results
- **Professional Terminology Explanation**: Get detailed explanations and contextual meanings of selected documents
- **Dual AI Engine Support**: DeepSeek and Tongyi Qianwen dual support with intelligent switching
- **Cat-Girl Themed Interface**: Blue-white gradient theme with cute "Nya~" suffix added to all text
- **Beautiful Animation Effects**: 8 CSS animations for smooth visual experience
- **Fully Configurable**: Multiple trigger methods, language matching, personalized settings

## 🚀 Features

### 🎨 **Visual Experience**
- **Blue-White Gradient Theme**: Fresh and elegant color scheme, eye-friendly and comfortable
- **Frosted Glass Effect Cards**: Modern UI design with glassmorphism
- **Centered Responsive Layout**: Perfectly adapts to various screen sizes
- **Cat-Girl Text Styling**: All prompts and descriptions include the cute "Nya~" suffix

### 🎭 **Animation Effects**
| Animation Name | Effect Description | Applied Location |
|----------------|-------------------|------------------|
| `slideInLeft` | Sidebar slide-in | Left navigation bar |
| `pulse` | Pulsing glow | Logo icon |
| `cardFadeIn` | Card fade-in | Settings cards |
| `titleGlow` | Title glowing | Section titles |
| `bounce` | Bounce effect | Toast notification icons |
| `float` | Floating animation | About page logo |
| `checkPop` | Checkbox pop | Checkboxes |
| `shimmer` | Shimmer sweep | Tip cards |

### ⚡ **Core Functionality**
- **Multiple Trigger Methods**: Icon click, double-click text, keyboard combinations
- **Smart Language Detection**: Auto-detect source language, intelligently match target language
- **Real-time Translation**: Millisecond response, instant translation display
- **Professional Terminology Database**: Specialized explanations for technical documents, academic papers
- **History Recording**: Automatically save recent translation records (coming soon)

### 🔧 **Technical Features**
- **Manifest V3**: Uses the latest Chrome extension standard
- **CSS Isolation**: All styles prefixed with `my-ext-` to avoid page pollution
- **Modular Design**: Clean file structure and separation of responsibilities
- **Error Handling**: Comprehensive error prompts and recovery mechanisms

## 📸 Screenshots

### Settings Page
![Settings Page](https://via.placeholder.com/800x450/4a9eff/ffffff?text=NyaTranslate+Settings+Page+Nya~)
*Blue-white theme, sidebar slide-in animation, card fade-in effects Nya~*

### Text Selection Translation
![Text Selection Translation](https://via.placeholder.com/800x450/3a8eef/ffffff?text=Text+Selection+Translation+Nya~)
*Select text on webpage, popup translation panel Nya~*

### Popup Window
![Popup Window](https://via.placeholder.com/400x600/5b6af0/ffffff?text=Popup+Window+Nya~)
*Quick action panel after clicking extension icon Nya~*

> **Tip**: The above are placeholder images. Please replace with actual screenshots when using Nya~

## 📦 Installation Guide

### Method 1: Load Unpacked Extension (Recommended)
1. **Download Latest Version**: Download `NyaTranslate-v2.0.0.zip` from [Releases](https://github.com/your-username/NyaTranslate/releases)
2. **Extract Files**: Extract the archive to a local folder
3. **Open Extension Management**: Enter `chrome://extensions/` in Chrome address bar
4. **Enable Developer Mode**: Toggle the "Developer mode" switch in top-right corner
5. **Load Extension**: Click "Load unpacked extension" button
6. **Select Folder**: Choose the extracted folder
7. **Complete**: Extension successfully loaded, ready to use on any webpage Nya~

### Method 2: Developer Mode (For Contributors)
```bash
# Clone repository
git clone https://github.com/your-username/NyaTranslate.git

# Enter project directory
cd NyaTranslate

# Install dependencies (if any)
# npm install

# Load in Chrome
# Open chrome://extensions/ → Enable Developer Mode → Load Unpacked Extension → Select current directory
```

### System Requirements
- **Chrome Browser**: Version 88 or higher (supports Manifest V3)
- **Operating System**: Windows 10/11, macOS 10.15+, Linux
- **Network Connection**: Requires access to DeepSeek or Tongyi Qianwen API

## 🎮 Usage Guide

### Basic Usage
1. **Text Selection Translation**: On any webpage, select text you want to translate with mouse
2. **Trigger Panel**: Release mouse to automatically popup translation panel
3. **Select Function**: Click "Translate" or "Explain" button to get results
4. **Close Panel**: Click blank area, press Esc key, or scroll page

### Trigger Methods
Configure different trigger methods in settings page:
- **Icon Trigger**: Click bubble icon after text selection
- **Double-click Trigger**: Double-click selected text
- **Keyboard Combination Trigger**: Hold Ctrl/Alt/Shift key while selecting text
- **Auto Trigger**: Automatically show panel after text selection

### Configure API Keys
1. Click extension icon, select "Open Settings"
2. Go to "API Configuration" page
3. Enter your DeepSeek or Tongyi Qianwen API key
4. Click "Save" button

### Advanced Settings
- **Language Matching**: Set source and target languages
- **Trigger Rules**: Configure different trigger methods based on website type
- **Interface Theme**: Switch between light/dark mode (coming soon)
- **Keyboard Shortcuts**: Customize translation shortcuts

## ⚙️ Configuration

### API Configuration
Extension supports the following AI services:
- **DeepSeek**: Ample free quota, fast response
- **Tongyi Qianwen**: Alibaba Cloud product, optimized for Chinese

### Configuration Files
Main configuration files are located in `manifest.json` and `background.js`:

```json
// manifest.json key configuration
{
  "name": "NyaTranslate-喵译",
  "version": "2.0.0",
  "host_permissions": [
    "https://api.deepseek.com/*",
    "https://dashscope.aliyuncs.com/*"
  ]
}
```

```javascript
// background.js API configuration
const API_CONFIG = {
  deepseek: {
    apiKey: 'your-deepseek-api-key',
    endpoint: 'https://api.deepseek.com/chat/completions'
  },
  qwen: {
    apiKey: 'your-qwen-api-key', 
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  }
};
```

## 🛠️ Development Guide

### Project Structure
```
NyaTranslate/
├── .github/                    # GitHub Actions workflows
│   └── workflows/
│       └── release.yml         # Auto-release configuration
├── icons/                      # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── CHANGELOG.md               # Version history log
├── RELEASE_NOTES.md           # Release notes template
├── README.md                  # Project documentation (Chinese)
├── README_EN.md               # Project documentation (English)
├── background.js              # Service Worker, API request proxy
├── content.js                 # Content script, text selection listening and panel injection
├── generate-icons.js          # Icon generation script
├── manifest.json              # Extension manifest (Manifest V3)
├── options.css                # Settings page styles (cat-girl theme)
├── options.html               # Settings page HTML
├── options.js                 # Settings page JavaScript
├── popup.html                 # Popup window HTML
├── popup.js                   # Popup window JavaScript
└── style.css                  # Floating panel styles
```

### Development Environment Setup
1. **Clone Code**: `git clone https://github.com/your-username/NyaTranslate.git`
2. **Modify Code**: Use VS Code or other editor
3. **Real-time Testing**: Reload extension in Chrome to see changes
4. **Debugging Tools**: Use Chrome Developer Tools for debugging

### Build & Release
Project includes GitHub Actions auto-release workflow:
```yaml
# .github/workflows/release.yml
on:
  release:
    types: [published]
  push:
    tags:
      - 'v*'
```

Steps to release new version:
1. Update version number in `manifest.json`
2. Update `CHANGELOG.md` with changes
3. Create Git tag: `git tag -a v2.0.0 -m "Release v2.0.0"`
4. Push tag: `git push origin v2.0.0`
5. Create Release on GitHub

## 🤝 Contributing

We welcome all forms of contributions Nya~

### How to Contribute
1. **Report Issues**: Report bugs or suggest features in Issues page
2. **Submit Code**: Fork repository, create branch, submit Pull Request
3. **Improve Documentation**: Enhance README, comments, or translate documentation
4. **Share Ideas**: Propose new feature ideas or design suggestions

### Development Standards
- **Code Style**: Follow existing code formatting and naming conventions
- **Commit Messages**: Use clear commit messages explaining changes
- **Testing**: Ensure changes don't break existing functionality
- **Documentation**: Update relevant documentation to reflect changes

### Planned Features
- [ ] Dark mode support
- [ ] Translation history
- [ ] Multi-language interface
- [ ] Offline caching
- [ ] Browser sync
- [ ] More AI model support

## 📄 License

This project is licensed under the [MIT License](LICENSE).

```
MIT License

Copyright (c) 2026 NyaTranslate Team

Permission is hereby granted, free of charge, to any person obtaining a copy
...
```

## 🙏 Acknowledgments

Thanks to the following projects and services:
- **Chrome Extensions API**: Providing powerful browser extension capabilities
- **DeepSeek**: Providing high-quality free AI translation services
- **Tongyi Qianwen**: Excellent large language model from Alibaba Cloud
- **All Contributors**: Thanks to every friend who contributed to the project

## 📞 Contact & Support

- **Issue Reporting**: [GitHub Issues](https://github.com/your-username/NyaTranslate/issues)
- **Feature Suggestions**: Propose in Issues
- **Code Contributions**: Submit Pull Request
- **Usage Help**: Consult this documentation or common questions in Issues

---

<p align="center">
  Made with ❤️ and 🐱 by NyaTranslate Team
</p>

<p align="center">
  <sub>If you like this project, please give us a Star Nya~ ⭐</sub>
</p>