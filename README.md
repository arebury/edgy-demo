# ⚡ Edgy

**Edgy** is a Figma plugin that helps designers identify missing edge cases and non-happy paths in their design flows.

![Status](https://img.shields.io/badge/status-hackathon_demo-purple)
![Figma](https://img.shields.io/badge/figma-plugin-blue)

## ✨ Features

- 🔍 **Automatic Edge Case Detection** - Analyze flows for missing error states, loading states, empty states
- 📚 **shadcn/ui Knowledge Base** - Suggests components based on shadcn/ui design system
- 📌 **Canvas Annotations** - Paste findings directly next to each screen
- ⚡ **GitHub Actions Backend** - Cloud analysis with version-controlled results
- 🎯 **9 Pattern Categories** - Forms, lists, search, auth, navigation, and more

## 🚀 Quick Start

### Install the Plugin

1. Open **Figma Desktop**
2. Go to `Plugins > Development > Import plugin from manifest...`
3. Navigate to `plugin/manifest.json`
4. Click Import

### Use the Plugin

1. Select multiple screens in your flow
2. Run the plugin from `Plugins > Development > Edgy`
3. Click **"Analyze Flow"**
4. Review issues by severity or by screen
5. Click **"Add Annotations to Canvas"** to paste findings

## 📁 Project Structure

```
edgy/
├── plugin/                    # Figma plugin source
│   ├── manifest.json
│   ├── package.json
│   ├── src/
│   │   ├── code.ts           # Main plugin logic
│   │   ├── ui.tsx            # React UI
│   │   ├── styles.css        # Plugin styles
│   │   └── types/            # TypeScript types
│   └── scripts/
│       └── build-html.js     # Build script
│
├── backend/                   # Analysis backend
│   ├── knowledge/
│   │   ├── shadcn-components.json
│   │   └── edge-case-patterns.json
│   └── analyzer/
│       └── analyze.js
│
├── .github/workflows/
│   └── analyze.yml           # GitHub Action
│
├── screens/                   # Figma screen exports
└── results/                   # Analysis results
```

## 🎨 Edge Case Categories

| Category | What It Detects |
|----------|-----------------|
| Form Submission | Missing validation errors, loading, success states |
| Data Lists | Missing empty states, loading skeletons, error handling |
| Search/Filter | No results state, search loading |
| Destructive Actions | Missing confirmation dialogs |
| Authentication | Invalid credentials, loading, locked account states |
| Navigation | Dead ends, orphan screens, unsaved changes warning |
| Permissions | Access denied screens, session expiry |
| File Upload | Progress indicators, error handling, file validation |
| Connectivity | Offline state, slow connection handling |

## 🛠️ Development

```bash
# Install dependencies
cd plugin && npm install

# Build plugin
npm run build

# Watch mode (hot reload)
npm run watch
```

## 🤖 GitHub Actions (Cloud Mode)

The backend analyzer runs as a GitHub Action:

1. Plugin exports screens to `/screens/*.json`
2. Action triggers and runs analysis
3. Results written to `/results/*.json`
4. Plugin polls for and displays results

## 📖 shadcn/ui Integration

The knowledge base includes mappings for:
- **15+ shadcn components** with required states
- **9 pattern categories** with edge case rules
- **Severity levels** (critical, warning, info)

---

Built for Hackathon 2026 💜
