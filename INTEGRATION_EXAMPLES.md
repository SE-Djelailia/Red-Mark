# RedMark P1 - Integration Examples

## Quick Start Guide - How to Use New P1 Components

---

## 1. **Photo Lightbox** - Full Screen Photo Viewer

### Use Case
When user taps on a photo thumbnail, show full-screen viewer with zoom, navigation, and actions.

### Implementation
```tsx
import { useState } from 'react';
import PhotoLightbox from './components/PhotoLightbox';

function PhotoGallery() {
  const [showLightbox, setShowLightbox] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const photos = [
    {
      id: '1',
      url: 'https://example.com/photo1.jpg',
      caption: 'Fondation - Vue nord',
      date: '2024-02-15',
      tags: ['Fondation', 'Problème ÉMÉ']
    },
    // ... more photos
  ];

  const handlePhotoClick = (index: number) => {
    setSelectedIndex(index);
    setShowLightbox(true);
  };

  const handleDelete = (photoId: string) => {
    // Delete photo from database
    console.log('Deleting photo:', photoId);
  };

  return (
    <div>
      {/* Photo Grid */}
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <img
            key={photo.id}
            src={photo.url}
            onClick={() => handlePhotoClick(index)}
            className="cursor-pointer hover:opacity-80"
          />
        ))}
      </div>

      {/* Lightbox */}
      {showLightbox && (
        <PhotoLightbox
          photos={photos}
          initialIndex={selectedIndex}
          onClose={() => setShowLightbox(false)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
```

**Features Enabled:**
- ✅ Zoom (1x to 3x)
- ✅ Navigate with arrows or swipe
- ✅ Keyboard shortcuts (←/→, +/-, Esc)
- ✅ Download photos
- ✅ Delete photos
- ✅ View tags
- ✅ Thumbnail navigation strip

---

## 2. **Bulk Photo Selector** - Multi-Select & Batch Operations

### Use Case
Allow users to select multiple photos and perform batch operations (delete, tag, download).

### Implementation
```tsx
import { useState } from 'react';
import BulkPhotoSelector from './components/BulkPhotoSelector';

function PhotoManagement() {
  const photos = [
    { id: '1', url: '...', caption: '...', tags: ['Fondation'] },
    { id: '2', url: '...', caption: '...', tags: ['ÉMÉ'] },
  ];

  const handleDelete = (photoIds: string[]) => {
    console.log('Deleting photos:', photoIds);
    // Call your API to delete photos
  };

  const handleTag = (photoIds: string[], tags: string[]) => {
    console.log('Adding tags to photos:', { photoIds, tags });
    // Call your API to add tags
  };

  const handleDownload = (photoIds: string[]) => {
    console.log('Downloading photos:', photoIds);
    // Batch download photos as ZIP
  };

  return (
    <BulkPhotoSelector
      photos={photos}
      onDelete={handleDelete}
      onTag={handleTag}
      onDownload={handleDownload}
    />
  );
}
```

**User Flow:**
1. Tap "Tout sélectionner" or tap individual photos
2. Selection counter appears in header
3. Action bar shows delete/tag/download buttons
4. Confirm bulk action
5. Success feedback

---

## 3. **Photo Comparison** - Before/After View

### Use Case
Compare two photos side-by-side (e.g., before/after correction, different angles).

### Implementation
```tsx
import { useState } from 'react';
import PhotoComparison from './components/PhotoComparison';

function ComparePhotos() {
  const [showComparison, setShowComparison] = useState(false);

  const photos = [
    { id: '1', url: '...', caption: 'Avant correction', date: '2024-02-01' },
    { id: '2', url: '...', caption: 'Après correction', date: '2024-02-15' },
  ];

  return (
    <div>
      <button onClick={() => setShowComparison(true)}>
        Comparer les photos
      </button>

      {showComparison && (
        <PhotoComparison
          photos={photos}
          onClose={() => setShowComparison(false)}
        />
      )}
    </div>
  );
}
```

**Features:**
- ✅ Side-by-side mode
- ✅ Split-screen slider mode (drag divider)
- ✅ Swap photos
- ✅ Synchronized zoom
- ✅ Select any 2 photos from list

---

## 4. **Quick Tag Filter** - Filter Photos by Tags

### Use Case
Let users quickly filter photos or issues by tag categories.

### Implementation
```tsx
import { useState } from 'react';
import QuickTagFilter from './components/QuickTagFilter';

function FilterablePhotoList() {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const availableTags = [
    'Problème ÉMÉ',
    'Déficience',
    'À corriger',
    'Non-conformité',
    'Équipement',
    'Sécurité'
  ];

  const tagCounts = {
    'Problème ÉMÉ': 12,
    'Déficience': 8,
    'À corriger': 5,
    'Non-conformité': 3,
    'Équipement': 2,
    'Sécurité': 1
  };

  // Filter photos based on selected tags
  const filteredPhotos = photos.filter(photo =>
    selectedTags.length === 0 ||
    photo.tags.some(tag => selectedTags.includes(tag))
  );

  return (
    <div>
      <QuickTagFilter
        availableTags={availableTags}
        selectedTags={selectedTags}
        onTagsChange={setSelectedTags}
        showCount={true}
        counts={tagCounts}
      />

      {/* Photo list */}
      <div className="grid grid-cols-2 gap-3">
        {filteredPhotos.map(photo => (
          <div key={photo.id}>...</div>
        ))}
      </div>
    </div>
  );
}
```

---

## 5. **Tag Manager** - Create/Edit/Delete Tags

### Use Case
Manage custom tag categories with colors.

### Implementation
```tsx
import { useState } from 'react';
import TagManager from './components/TagManager';

function Settings() {
  const [showTagManager, setShowTagManager] = useState(false);
  const [tags, setTags] = useState([
    { id: '1', name: 'Problème ÉMÉ', color: '#E10600', count: 12 },
    { id: '2', name: 'Déficience', color: '#F59E0B', count: 8 },
  ]);

  const handleAddTag = (name: string, color: string) => {
    const newTag = {
      id: Date.now().toString(),
      name,
      color,
      count: 0
    };
    setTags([...tags, newTag]);
  };

  const handleEditTag = (id: string, name: string, color: string) => {
    setTags(tags.map(tag =>
      tag.id === id ? { ...tag, name, color } : tag
    ));
  };

  const handleDeleteTag = (id: string) => {
    setTags(tags.filter(tag => tag.id !== id));
  };

  return (
    <div>
      <button onClick={() => setShowTagManager(true)}>
        Gérer les catégories
      </button>

      {showTagManager && (
        <TagManager
          tags={tags}
          onAddTag={handleAddTag}
          onEditTag={handleEditTag}
          onDeleteTag={handleDeleteTag}
          onClose={() => setShowTagManager(false)}
        />
      )}
    </div>
  );
}
```

---

## 6. **Report Preview** - Preview Before Generating PDF

### Use Case
Show users what the report will look like before generating PDF.

### Implementation
```tsx
import { useState } from 'react';
import ReportPreview from './components/ReportPreview';

function ReportGeneration() {
  const [showPreview, setShowPreview] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const reportData = {
    title: 'Rapport de visite - CHUM',
    projectName: 'CHUM - Extension Pavillon A',
    date: '2024-02-19',
    sections: [
      {
        title: 'Résumé exécutif',
        content: 'Visite du 19 février 2024. Phase: Fondation. 12 déficiences identifiées.'
      },
      {
        title: 'Observations',
        content: 'Les travaux de fondation progressent selon l\'échéancier...'
      }
    ],
    photos: [
      { url: '...', caption: 'Vue nord' },
      { url: '...', caption: 'Vue est' },
    ]
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    // Call API to generate PDF
    await generatePDF(reportData);
    setIsGenerating(false);
    setShowPreview(false);
  };

  return (
    <div>
      <button onClick={() => setShowPreview(true)}>
        Aperçu du rapport
      </button>

      {showPreview && (
        <ReportPreview
          reportData={reportData}
          onClose={() => setShowPreview(false)}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
        />
      )}
    </div>
  );
}
```

---

## 7. **Export Data** - CSV/JSON Export

### Use Case
Export project data, photos metadata, or issues to CSV/JSON.

### Implementation
```tsx
import { useState } from 'react';
import ExportData from './components/ExportData';

function DataExport() {
  const [showExport, setShowExport] = useState(false);

  const issuesData = [
    {
      id: '1',
      title: 'Fissure dans béton',
      status: 'open',
      priority: 'high',
      assignedTo: 'Jean Tremblay',
      createdDate: '2024-02-15'
    },
    // ... more issues
  ];

  return (
    <div>
      <button onClick={() => setShowExport(true)}>
        Exporter les données
      </button>

      {showExport && (
        <ExportData
          data={issuesData}
          filename="redmark-issues-export"
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
```

**Export Formats:**
- **CSV**: Compatible with Excel, Google Sheets
- **JSON**: Structured data for APIs or custom processing

---

## 8. **Notification Center** - Real-time Updates

### Use Case
Show users important updates, mentions, and activity.

### Implementation
```tsx
import { useState } from 'react';
import NotificationCenter from './components/NotificationCenter';

function Header() {
  const [notifications, setNotifications] = useState([
    {
      id: '1',
      type: 'info' as const,
      title: 'Nouveau commentaire',
      message: 'Marie a commenté sur "Fissure béton"',
      timestamp: '2024-02-19T10:30:00',
      read: false,
      actionUrl: '/app/issues/123',
      actionLabel: 'Voir'
    },
    {
      id: '2',
      type: 'success' as const,
      title: 'Rapport généré',
      message: 'Le rapport CHUM est prêt à télécharger',
      timestamp: '2024-02-19T09:15:00',
      read: true
    }
  ]);

  const handleMarkAsRead = (id: string) => {
    setNotifications(notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const handleDelete = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  const handleClearAll = () => {
    setNotifications([]);
  };

  return (
    <header>
      <NotificationCenter
        notifications={notifications}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        onDelete={handleDelete}
        onClearAll={handleClearAll}
      />
    </header>
  );
}
```

---

## 9. **Activity Feed** - Team Activity Timeline

### Use Case
Show recent team activity on projects.

### Implementation
```tsx
import ActivityFeed from './components/ActivityFeed';

function ProjectDashboard() {
  const activities = [
    {
      id: '1',
      type: 'photo' as const,
      user: 'Jean Tremblay',
      action: 'a ajouté',
      target: '5 photos',
      timestamp: '2024-02-19T14:30:00',
      projectName: 'CHUM - Extension'
    },
    {
      id: '2',
      type: 'comment' as const,
      user: 'Marie Gagnon',
      action: 'a commenté sur',
      target: 'Fissure béton',
      timestamp: '2024-02-19T10:15:00',
      projectName: 'CHUM - Extension'
    },
    {
      id: '3',
      type: 'issue_created' as const,
      user: 'Pierre Dubois',
      action: 'a créé une déficience',
      target: 'Armature exposée',
      timestamp: '2024-02-18T16:45:00',
      projectName: 'Bibliothèque Maisonneuve'
    }
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <ActivityFeed
        activities={activities}
        maxItems={10}
        showProject={true}
      />
    </div>
  );
}
```

---

## 10. **@Mentions in Comments** - Notify Team Members

### Use Case
Let users mention teammates in comments to notify them.

### Implementation
```tsx
import { useState } from 'react';
import MentionInput from './components/MentionInput';

function CommentBox() {
  const [comment, setComment] = useState('');
  const [mentionedUsers, setMentionedUsers] = useState<string[]>([]);

  const teamMembers = [
    { id: '1', name: 'Jean Tremblay', email: 'jean@jlp.ca' },
    { id: '2', name: 'Marie Gagnon', email: 'marie@jlp.ca' },
    { id: '3', name: 'Pierre Dubois', email: 'pierre@jlp.ca' },
  ];

  const handleSubmit = async () => {
    // Save comment with mentions
    await saveComment({
      text: comment,
      mentionedUserIds: mentionedUsers
    });

    // Send notifications to mentioned users
    mentionedUsers.forEach(userId => {
      sendNotification(userId, 'You were mentioned in a comment');
    });

    setComment('');
    setMentionedUsers([]);
  };

  return (
    <div>
      <MentionInput
        teamMembers={teamMembers}
        value={comment}
        onChange={(value, mentions) => {
          setComment(value);
          setMentionedUsers(mentions);
        }}
        placeholder="Ajouter un commentaire... (@mention pour notifier)"
      />

      <button onClick={handleSubmit}>
        Publier le commentaire
      </button>
    </div>
  );
}
```

**Features:**
- ✅ Type @ to trigger autocomplete
- ✅ Search by name or email
- ✅ Keyboard navigation (↑/↓/Enter)
- ✅ Mention extraction for notifications
- ✅ Character counter

---

## 11. **Haptic Feedback** - Mobile Touch Feedback

### Use Case
Provide tactile feedback on button presses and actions (mobile only).

### Implementation
```tsx
import haptics from './utils/haptics';

function InteractiveButton() {
  const handleClick = () => {
    haptics.light(); // Light vibration
    // Your action
  };

  const handleDelete = () => {
    haptics.heavy(); // Strong vibration for destructive action
    // Delete logic
  };

  const handleSuccess = () => {
    haptics.success(); // Success pattern vibration
    // Success feedback
  };

  return (
    <div>
      <button onClick={handleClick}>Select</button>
      <button onClick={handleDelete}>Delete</button>
      <button onClick={handleSuccess}>Save</button>
    </div>
  );
}
```

**Haptic Types:**
- `haptics.light()` - Selections, toggles (10ms)
- `haptics.medium()` - Navigation, confirmations (20ms)
- `haptics.heavy()` - Important actions, errors (30ms)
- `haptics.success()` - Success pattern (10-50-10ms)
- `haptics.error()` - Error pattern (30-50-30-50-30ms)
- `haptics.selectionChanged()` - Checkbox/radio (5ms)

---

## 12. **Swipe Gestures** - Mobile Navigation

### Use Case
Add swipe-to-navigate on mobile (e.g., swipe right to go back).

### Implementation
```tsx
import { useNavigate } from 'react-router';
import useSwipeGesture from './hooks/useSwipeGesture';

function PhotoDetailScreen() {
  const navigate = useNavigate();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useSwipeGesture({
    onSwipeRight: () => navigate(-1), // Go back
    onSwipeLeft: () => {
      // Go to next photo
      if (currentPhotoIndex < photos.length - 1) {
        setCurrentPhotoIndex(currentPhotoIndex + 1);
      }
    },
    minSwipeDistance: 50,
    maxSwipeTime: 300
  });

  return <div>{/* Photo content */}</div>;
}
```

**Gesture Options:**
- `onSwipeLeft` - Swipe left action
- `onSwipeRight` - Swipe right action (common for "back")
- `onSwipeUp` - Swipe up action
- `onSwipeDown` - Swipe down action (common for "refresh")
- `minSwipeDistance` - Minimum pixels (default: 50)
- `maxSwipeTime` - Maximum milliseconds (default: 300)

---

## 13. **Keyboard Shortcuts** - Power User Features

### Use Case
Let power users navigate with keyboard shortcuts.

### Implementation
```tsx
import KeyboardShortcuts from './components/KeyboardShortcuts';

function App() {
  return (
    <div>
      {/* Your app content */}
      <KeyboardShortcuts />
    </div>
  );
}

// In your components, handle keyboard events:
function ProjectList() {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // G + P = Go to Projects
      if (e.key === 'p' && lastKey === 'g') {
        navigate('/app/projects');
      }
      
      // N = New Project
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        setShowNewProjectModal(true);
      }
      
      // / = Focus search
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);
}
```

**Built-in Shortcuts:**
- `?` - Show shortcuts modal
- `Esc` - Close modal
- `←/→` - Navigate photos
- `+/-` - Zoom
- See `/src/app/components/KeyboardShortcuts.tsx` for full list

---

## 14. **Dark Mode** - Theme Toggle

### Use Case
Let users switch between light and dark themes.

### Implementation

**Step 1: Wrap app with ThemeProvider**
```tsx
// src/app/App.tsx
import { ThemeProvider } from './context/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
```

**Step 2: Add toggle to Settings/Profile**
```tsx
import { useTheme } from './context/ThemeContext';
import { Moon, Sun } from 'lucide-react';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-3 w-full p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
      <div className="flex-1 text-left">
        <p className="font-medium">Thème</p>
        <p className="text-sm text-gray-500">
          {theme === 'light' ? 'Clair' : 'Sombre'}
        </p>
      </div>
    </button>
  );
}
```

**Step 3: Add dark mode classes to Tailwind**
```css
/* Your components will automatically support dark: classes */
.bg-white dark:bg-gray-900
.text-black dark:text-white
.border-gray-200 dark:border-gray-700
```

---

## 15. **Breadcrumb Navigation** - Path Display

### Use Case
Show users where they are in the app hierarchy.

### Implementation
```tsx
import Breadcrumb from './components/Breadcrumb';

function ProjectDetail() {
  const project = { id: '1', name: 'CHUM - Extension Pavillon A' };

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Projets', path: '/app/projects' },
        { label: project.name },
      ]} />

      {/* Project content */}
    </div>
  );
}

function VisitDetail() {
  const project = { name: 'CHUM' };
  const visit = { id: '5', date: '2024-02-15' };

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Projets', path: '/app/projects' },
        { label: project.name, path: '/app/projects/1' },
        { label: `Visite du ${visit.date}` },
      ]} />

      {/* Visit content */}
    </div>
  );
}
```

---

## 🎯 **Best Practices**

### 1. **Always provide haptic feedback on mobile**
```tsx
<button onClick={() => {
  haptics.light();
  handleAction();
}}>
  Action
</button>
```

### 2. **Use swipe gestures for navigation**
```tsx
useSwipeGesture({
  onSwipeRight: () => navigate(-1),
});
```

### 3. **Show loading states**
```tsx
<button disabled={isLoading}>
  {isLoading && <ButtonLoader />}
  {isLoading ? 'Chargement...' : 'Enregistrer'}
</button>
```

### 4. **Provide keyboard shortcuts**
```tsx
// Always add Escape key to close modals
useEffect(() => {
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  window.addEventListener('keydown', handleEsc);
  return () => window.removeEventListener('keydown', handleEsc);
}, []);
```

### 5. **Use breadcrumbs for deep navigation**
```tsx
// Always show breadcrumbs 3+ levels deep
<Breadcrumb items={[
  { label: 'Home', path: '/' },
  { label: 'Level 1', path: '/level1' },
  { label: 'Current' }
]} />
```

---

## 📱 **Mobile-First Checklist**

- ✅ Use `useSwipeGesture` for navigation
- ✅ Add `haptics` to all interactive elements
- ✅ Ensure 44px minimum touch targets
- ✅ Test on mobile Safari (iOS)
- ✅ Test on Chrome (Android)
- ✅ Use `safe-area-inset-bottom` for navigation
- ✅ Enable pull-to-refresh where appropriate
- ✅ Optimize images with PhotoUploader compression

---

## 🚀 **Performance Tips**

1. **Lazy load modals**
```tsx
const PhotoLightbox = lazy(() => import('./components/PhotoLightbox'));
```

2. **Debounce search inputs**
```tsx
const debouncedSearch = useMemo(
  () => debounce((query) => search(query), 300),
  []
);
```

3. **Use virtual scrolling for long lists**
```tsx
// For 100+ items, consider react-window or react-virtuoso
```

4. **Optimize images**
```tsx
// PhotoUploader already compresses images
// Serve responsive sizes from backend
```

---

## ✅ **Integration Complete!**

All P1 components are ready to use. Simply import and integrate them into your screens following the examples above.

For questions or custom implementations, refer to:
- `/P1_IMPLEMENTATION_SUMMARY.md` - Complete feature list
- Component source code in `/src/app/components/`
- TypeScript interfaces for type safety

**Happy coding! 🎉**
