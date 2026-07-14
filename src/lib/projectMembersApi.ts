export interface ProjectMember {
  id: string;
  projectId: string;
  name: string;
  email: string;
  role: "owner" | "collaborator" | "viewer";
  addedBy: string; // User ID who added this member
  addedDate: string;
  status: "pending" | "active"; // pending = invitation sent, active = accepted
}

const STORAGE_KEY = "redmark_project_members";

// Get all project members from localStorage
function getAllProjectMembers(): ProjectMember[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Error loading project members:", error);
    return [];
  }
}

// Save all project members to localStorage
function saveAllProjectMembers(members: ProjectMember[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
  } catch (error) {
    console.error("Error saving project members:", error);
  }
}

// Get members for a specific project
export function getMembersByProject(projectId: string): ProjectMember[] {
  const allMembers = getAllProjectMembers();
  return allMembers.filter((member) => member.projectId === projectId);
}

// Add a member to a project
export function addProjectMember(
  projectId: string,
  name: string,
  email: string,
  role: ProjectMember["role"],
  addedBy: string,
): ProjectMember {
  const newMember: ProjectMember = {
    id: Date.now().toString(),
    projectId,
    name,
    email,
    role,
    addedBy,
    addedDate: new Date().toISOString(),
    status: "pending", // They need to accept the invitation
  };

  const allMembers = getAllProjectMembers();
  allMembers.push(newMember);
  saveAllProjectMembers(allMembers);

  return newMember;
}

// Update a member's role or status
export function updateProjectMember(
  memberId: string,
  updates: Partial<Pick<ProjectMember, "role" | "status">>,
): ProjectMember | null {
  const allMembers = getAllProjectMembers();
  const index = allMembers.findIndex((m) => m.id === memberId);

  if (index === -1) return null;

  allMembers[index] = {
    ...allMembers[index],
    ...updates,
  };

  saveAllProjectMembers(allMembers);
  return allMembers[index];
}

// Remove a member from a project
export function removeProjectMember(memberId: string): boolean {
  const allMembers = getAllProjectMembers();
  const filtered = allMembers.filter((m) => m.id !== memberId);

  if (filtered.length === allMembers.length) return false;

  saveAllProjectMembers(filtered);
  return true;
}

// Initialize project with owner as first member
export function initializeProjectOwner(
  projectId: string,
  ownerId: string,
  ownerName: string,
  ownerEmail: string,
): ProjectMember {
  // Check if owner already exists for this project
  const existingMembers = getMembersByProject(projectId);
  const ownerExists = existingMembers.find((m) => m.email === ownerEmail && m.role === "owner");

  if (ownerExists) return ownerExists;

  const owner: ProjectMember = {
    id: Date.now().toString(),
    projectId,
    name: ownerName,
    email: ownerEmail,
    role: "owner",
    addedBy: ownerId,
    addedDate: new Date().toISOString(),
    status: "active",
  };

  const allMembers = getAllProjectMembers();
  allMembers.push(owner);
  saveAllProjectMembers(allMembers);

  return owner;
}

// Check if a user has access to a project
export function hasProjectAccess(projectId: string, userEmail: string): boolean {
  const members = getMembersByProject(projectId);
  return members.some((m) => m.email === userEmail && m.status === "active");
}
