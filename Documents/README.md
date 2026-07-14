# RedMark - Construction Photo Intelligence

> Professional construction site documentation tool for architecture firms in Quebec

**RedMark** helps architects document construction sites with photos, site visit logs, and generate structured reports. Built for mobile and tablet use on construction sites with offline support.

## 🚀 Live Demo

[View Live App](https://your-app-url.vercel.app) _(Update after deployment)_

## ✨ Features

### Core Functionality

- 🔐 **Login/Authentication** - Secure user authentication
- 📁 **Project Management** - Organize multiple construction projects
- 📸 **Photo Gallery** - Capture and organize site photos
- 🏷️ **Tag System** - Categorize photos by problem type (Non-conformité, Déficience, Observation)
- 📝 **Site Visit Logs** - Document visits with phase categorization
- 📄 **PDF Report Generation** - Create professional reports
- 👥 **Team Collaboration** - Share projects with colleagues

### PWA Features

- 📱 **Installable** - Add to home screen like a native app
- 🔌 **Offline Support** - Works without internet connection
- 🔄 **Auto-Updates** - Automatic updates when online
- ⚡ **Fast Performance** - Cached resources for instant loading
- 🎯 **App Shortcuts** - Quick access to key features

### Mobile Optimized

- 📱 Responsive design for mobile and tablet
- 👆 Touch-friendly 44px minimum tap targets
- 🎨 Professional design system (Red #E10600, Black #1A1A1A)
- 🇫🇷 Fully localized in French for Quebec compliance

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript
- **Routing**: React Router v7
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI + shadcn/ui
- **Icons**: Lucide React
- **PWA**: Vite PWA Plugin + Workbox
- **Build**: Vite 6
- **Deployment**: Vercel

## 📦 Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 🌐 Deployment

This app is configured for deployment on Vercel:

1. Push to GitHub
2. Import repository in Vercel
3. Deploy automatically
4. PWA features will work on the live URL

## 🔧 Environment Setup

No environment variables required for the demo version. The app uses mock data for demonstration purposes.

For production with real backend:

- Configure API endpoints
- Add authentication provider
- Set up database connection

## 📱 PWA Installation

Once deployed on HTTPS:

**Desktop (Chrome/Edge)**:

- Look for install icon in address bar
- Or wait for install prompt

**Mobile (iOS Safari)**:

- Tap Share button
- Select "Add to Home Screen"

**Mobile (Android Chrome)**:

- Tap menu (⋮)
- Select "Install app" or "Add to Home Screen"

## 🏗️ Project Structure

```
/src
  /app
    /components     # React components
    /routes.tsx     # React Router configuration
    /App.tsx        # Main app component
  /styles
    /theme.css      # Design tokens
    /fonts.css      # Font imports
/public
  /icon.svg         # PWA icon
  /favicon.svg      # Favicon
/vite.config.ts     # Vite + PWA configuration
/vercel.json        # Vercel deployment config
```

## 🎨 Design System

- **Primary Color**: #E10600 (Red)
- **Secondary Color**: #1A1A1A (Black)
- **Typography**: System fonts optimized for Quebec French
- **Spacing**: 4px base unit
- **Breakpoints**: Mobile-first responsive design

## 👨‍💼 Pilot Client

**Jodoin Lamarre Pratte architectes** - Montreal, Quebec

Leading architecture firm testing RedMark for construction site documentation.

## 📄 License

Proprietary - All rights reserved

## 🤝 Support

For questions or support, contact the development team.

---

Built with ❤️ for architects in Quebec
