// Simple localStorage-based storage for projects, visits, and photos
// This simulates a backend KV store but keeps everything client-side

export interface Project {
  id: string;
  name: string;
  address: string;
  client?: string;
  contractor?: string;
  startDate: string;
  status: 'planning' | 'in-progress' | 'on-hold' | 'completed';
  owner_id: string;
  visitCount: number;
  photoCount: number;
  created_at: string;
  updated_at: string;
}

export interface SiteVisit {
  id: string;
  project_id: string;
  visit_date: string;
  phase: string;
  weather: string;
  temperature?: string;
  attendees: string[];
  notes: string;
  created_by: string;
  created_at: string;
}

export interface Photo {
  id: string;
  site_visit_id: string;
  project_id: string;
  file_url: string;
  thumbnail_url?: string;
  caption: string;
  tags: string[];
  location?: string;
  taken_at: string;
  uploaded_by: string;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  category: string;
  color: string;
  created_at: string;
}

export interface Comment {
  id: string;
  site_visit_id: string;
  author: string;
  author_id: string;
  text: string;
  created_at: string;
}

// Projects
export const getProjects = (userId: string): Project[] => {
  const key = `projects:${userId}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
};

export const saveProject = (userId: string, project: Project): void => {
  const projects = getProjects(userId);
  const index = projects.findIndex(p => p.id === project.id);
  
  if (index >= 0) {
    projects[index] = { ...project, updated_at: new Date().toISOString() };
  } else {
    projects.push(project);
  }
  
  localStorage.setItem(`projects:${userId}`, JSON.stringify(projects));
};

export const deleteProject = (userId: string, projectId: string): void => {
  const projects = getProjects(userId).filter(p => p.id !== projectId);
  localStorage.setItem(`projects:${userId}`, JSON.stringify(projects));
  
  // Also delete related visits and photos
  const visits = getSiteVisits(userId, projectId);
  visits.forEach(visit => deleteSiteVisit(userId, visit.id));
};

// Get a single project by ID
export const getProject = (userId: string, projectId: string): Project | null => {
  const projects = getProjects(userId);
  return projects.find(p => p.id === projectId) || null;
};

// Site Visits
export const getSiteVisits = (userId: string, projectId: string): SiteVisit[] => {
  const key = `visits:${userId}:${projectId}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
};

export const saveSiteVisit = (userId: string, visit: SiteVisit): void => {
  const visits = getSiteVisits(userId, visit.project_id);
  const index = visits.findIndex(v => v.id === visit.id);
  
  if (index >= 0) {
    visits[index] = visit;
  } else {
    visits.push(visit);
  }
  
  localStorage.setItem(`visits:${userId}:${visit.project_id}`, JSON.stringify(visits));
  
  // Update project visit count
  const projects = getProjects(userId);
  const projectIndex = projects.findIndex(p => p.id === visit.project_id);
  if (projectIndex >= 0) {
    projects[projectIndex].visitCount = visits.length;
    localStorage.setItem(`projects:${userId}`, JSON.stringify(projects));
  }
};

export const deleteSiteVisit = (userId: string, visitId: string): void => {
  // Find which project this visit belongs to
  const allProjects = getProjects(userId);
  
  for (const project of allProjects) {
    const visits = getSiteVisits(userId, project.id);
    const filtered = visits.filter(v => v.id !== visitId);
    
    if (filtered.length !== visits.length) {
      localStorage.setItem(`visits:${userId}:${project.id}`, JSON.stringify(filtered));
      
      // Update project visit count
      project.visitCount = filtered.length;
      saveProject(userId, project);
      
      // Delete related photos
      const photos = getPhotos(userId, visitId);
      photos.forEach(photo => deletePhoto(userId, photo.id));
      break;
    }
  }
};

// Photos
export const getPhotos = (userId: string, visitId: string): Photo[] => {
  const key = `photos:${userId}:${visitId}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
};

export const savePhoto = (userId: string, photo: Photo): void => {
  const photos = getPhotos(userId, photo.site_visit_id);
  const index = photos.findIndex(p => p.id === photo.id);
  
  if (index >= 0) {
    photos[index] = photo;
  } else {
    photos.push(photo);
  }
  
  localStorage.setItem(`photos:${userId}:${photo.site_visit_id}`, JSON.stringify(photos));
  
  // Update project photo count
  const projects = getProjects(userId);
  const projectIndex = projects.findIndex(p => p.id === photo.project_id);
  if (projectIndex >= 0) {
    // Count all photos for this project
    let totalPhotos = 0;
    const visits = getSiteVisits(userId, photo.project_id);
    visits.forEach(visit => {
      totalPhotos += getPhotos(userId, visit.id).length;
    });
    projects[projectIndex].photoCount = totalPhotos;
    localStorage.setItem(`projects:${userId}`, JSON.stringify(projects));
  }
};

export const deletePhoto = (userId: string, photoId: string): void => {
  // This is inefficient but works for prototype
  const allProjects = getProjects(userId);
  
  for (const project of allProjects) {
    const visits = getSiteVisits(userId, project.id);
    
    for (const visit of visits) {
      const photos = getPhotos(userId, visit.id);
      const filtered = photos.filter(p => p.id !== photoId);
      
      if (filtered.length !== photos.length) {
        localStorage.setItem(`photos:${userId}:${visit.id}`, JSON.stringify(filtered));
        
        // Update project photo count
        let totalPhotos = 0;
        visits.forEach(v => {
          totalPhotos += getPhotos(userId, v.id).length;
        });
        project.photoCount = totalPhotos;
        saveProject(userId, project);
        return;
      }
    }
  }
};

// Tags (global, not user-specific)
export const getTags = (): Tag[] => {
  const data = localStorage.getItem('tags');
  if (!data) {
    // Initialize default tags
    const defaultTags: Tag[] = [
      { id: '1', name: 'Problème structurel', color: '#E10600', category: 'issue', created_at: new Date().toISOString() },
      { id: '2', name: 'Déficience électrique', color: '#FF6B00', category: 'issue', created_at: new Date().toISOString() },
      { id: '3', name: 'Plomberie', color: '#0066CC', category: 'issue', created_at: new Date().toISOString() },
      { id: '4', name: 'Fissure', color: '#DC2626', category: 'issue', created_at: new Date().toISOString() },
      { id: '5', name: 'Humidité', color: '#2563EB', category: 'issue', created_at: new Date().toISOString() },
      { id: '6', name: 'Finitions', color: '#00AA44', category: 'progress', created_at: new Date().toISOString() },
      { id: '7', name: 'Conforme', color: '#16A34A', category: 'progress', created_at: new Date().toISOString() },
      { id: '8', name: 'Qualité excellente', color: '#059669', category: 'progress', created_at: new Date().toISOString() },
      { id: '9', name: 'À vérifier', color: '#FFAA00', category: 'inspection', created_at: new Date().toISOString() },
      { id: '10', name: 'Urgent', color: '#DC2626', category: 'inspection', created_at: new Date().toISOString() },
      { id: '11', name: 'À corriger', color: '#EA580C', category: 'inspection', created_at: new Date().toISOString() },
      { id: '12', name: 'Sécurité', color: '#991B1B', category: 'safety', created_at: new Date().toISOString() },
    ];
    localStorage.setItem('tags', JSON.stringify(defaultTags));
    return defaultTags;
  }
  return JSON.parse(data);
};

export const saveTag = (tag: Tag): void => {
  const tags = getTags();
  const index = tags.findIndex(t => t.id === tag.id);
  
  if (index >= 0) {
    tags[index] = tag;
  } else {
    tags.push(tag);
  }
  
  localStorage.setItem('tags', JSON.stringify(tags));
};

// Comments
export const getComments = (userId: string, visitId: string): Comment[] => {
  const key = `comments:${userId}:${visitId}`;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
};

export const saveComment = (userId: string, comment: Comment): void => {
  const comments = getComments(userId, comment.site_visit_id);
  const index = comments.findIndex(c => c.id === comment.id);
  
  if (index >= 0) {
    comments[index] = comment;
  } else {
    comments.push(comment);
  }
  
  localStorage.setItem(`comments:${userId}:${comment.site_visit_id}`, JSON.stringify(comments));
};

export const deleteComment = (userId: string, commentId: string): void => {
  // This is inefficient but works for prototype
  const allProjects = getProjects(userId);
  
  for (const project of allProjects) {
    const visits = getSiteVisits(userId, project.id);
    
    for (const visit of visits) {
      const comments = getComments(userId, visit.id);
      const filtered = comments.filter(c => c.id !== commentId);
      
      if (filtered.length !== comments.length) {
        localStorage.setItem(`comments:${userId}:${visit.id}`, JSON.stringify(filtered));
        return;
      }
    }
  }
};