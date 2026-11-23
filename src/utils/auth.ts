import type { PageKey, PagePermission, SchemaPageEntry, User, UserPermissions } from '../types/lab';

export interface PageDefinition {
  key: PageKey;
  path: string;
  label: string;
  title: string;
}

export const PAGE_DEFINITIONS: PageDefinition[] = [
  { key: 'dashboard', path: '/', label: 'Dashboard', title: 'Executive Overview' },
  { key: 'lostOrders', path: '/lost-orders', label: 'Lost Orders', title: 'Lost Orders Registry' },
  { key: 'samples', path: '/samples', label: 'Samples', title: 'Sample Tracking Pipeline' },
  { key: 'testEntry', path: '/test-entry', label: 'Test 1', title: 'Laboratory Test 1' },
  { key: 'management', path: '/management-action', label: 'Management Action', title: 'Management Action' },
];

const KNOWN_PAGE_LABEL_MAP: Record<string, string> = {
  dashboard: 'Dashboard',
  lostOrders: 'Lost Orders',
  samples: 'Samples',
  testEntry: 'Test 1',
  management: 'Management Action',
};

export function resolveSchemaPageRows(
  schemaPages?: Array<string | SchemaPageEntry>
): Array<{ key: string; label: string }> {
  if (!schemaPages || schemaPages.length === 0) {
    return PAGE_DEFINITIONS.map((def) => ({ key: def.key, label: def.label }));
  }
  const seen = new Set<string>();
  const rows: Array<{ key: string; label: string }> = [];
  for (const entry of schemaPages) {
    const key = typeof entry === 'string' ? entry : entry.key;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const label =
      KNOWN_PAGE_LABEL_MAP[key] ||
      (typeof entry === 'object' && entry.label ? entry.label : undefined) ||
      key;
    rows.push({ key, label });
  }
  return rows.length > 0
    ? rows
    : PAGE_DEFINITIONS.map((def) => ({ key: def.key, label: def.label }));
}

export function createEmptyPermissions(keys?: string[]): UserPermissions {
  const list = keys && keys.length > 0 ? keys : PAGE_DEFINITIONS.map((d) => d.key);
  const perms: UserPermissions = {};
  for (const k of list) {
    perms[k] = 'none';
  }
  return perms;
}

export function createFullPermissions(keys?: string[]): UserPermissions {
  const list = keys && keys.length > 0 ? keys : PAGE_DEFINITIONS.map((d) => d.key);
  const perms: UserPermissions = {};
  for (const k of list) {
    perms[k] = 'full';
  }
  return perms;
}

export interface PermissionPreset {
  id: 'sales' | 'technician' | 'manager' | 'viewAll';
  label: string;
  permissions: UserPermissions;
}

export const PERMISSION_PRESETS: PermissionPreset[] = [
  {
    id: 'sales',
    label: 'Sales',
    permissions: {
      dashboard: 'view',
      lostOrders: 'full',
      samples: 'view',
      testEntry: 'none',
      management: 'none',
    },
  },
  {
    id: 'technician',
    label: 'Lab Technician',
    permissions: {
      dashboard: 'view',
      lostOrders: 'none',
      samples: 'full',
      testEntry: 'full',
      management: 'none',
    },
  },
  {
    id: 'manager',
    label: 'Manager',
    permissions: {
      dashboard: 'full',
      lostOrders: 'view',
      samples: 'view',
      testEntry: 'view',
      management: 'full',
    },
  },
  {
    id: 'viewAll',
    label: 'View everything',
    permissions: {
      dashboard: 'view',
      lostOrders: 'view',
      samples: 'view',
      testEntry: 'view',
      management: 'view',
    },
  },
];

export function normalizePermissions(
  raw?: Partial<UserPermissions>,
  keys?: string[]
): UserPermissions {
  const base = createEmptyPermissions(keys);
  if (!raw) return base;
  for (const [key, val] of Object.entries(raw)) {
    if (val === 'none' || val === 'view' || val === 'full') {
      base[key] = val;
    }
  }
  return base;
}

export function getEffectivePagePermission(
  user: Pick<User, 'isAdmin' | 'isActive' | 'permissions'> | null | undefined,
  page: PageKey | string
): PagePermission {
  if (!user || !user.isActive) return 'none';
  if (user.isAdmin) return 'full';
  return user.permissions?.[page] ?? 'none';
}

export function canViewPage(
  user: Pick<User, 'isAdmin' | 'isActive' | 'permissions'> | null | undefined,
  page: PageKey | string
): boolean {
  const perm = getEffectivePagePermission(user, page);
  return perm === 'view' || perm === 'full';
}

export function canFullAccessPage(
  user: Pick<User, 'isAdmin' | 'isActive' | 'permissions'> | null | undefined,
  page: PageKey | string
): boolean {
  return getEffectivePagePermission(user, page) === 'full';
}

export function getAccessiblePages(
  user: Pick<User, 'isAdmin' | 'isActive' | 'permissions'> | null | undefined
): PageDefinition[] {
  if (!user || !user.isActive) return [];
  return PAGE_DEFINITIONS.filter((def) => canViewPage(user, def.key));
}

export function getFirstAllowedPath(
  user: Pick<User, 'isAdmin' | 'isActive' | 'permissions'> | null | undefined
): string | null {
  const pages = getAccessiblePages(user);
  if (pages.length > 0) return pages[0].path;
  if (user?.isAdmin && user.isActive) return '/users';
  return null;
}

export function getPermissionSummary(
  user: Pick<User, 'isAdmin' | 'isActive' | 'permissions'> | null | undefined
): string {
  if (!user) return 'Signed out';
  if (user.isAdmin) return 'Admin';
  let fullCount = 0;
  let viewCount = 0;
  for (const def of PAGE_DEFINITIONS) {
    const p = user.permissions?.[def.key];
    if (p === 'full') fullCount += 1;
    else if (p === 'view') viewCount += 1;
  }
  if (fullCount === 0 && viewCount === 0) return 'No pages assigned';
  const parts: string[] = [];
  if (fullCount > 0) parts.push(`${fullCount} full`);
  if (viewCount > 0) parts.push(`${viewCount} view`);
  return parts.join(' · ');
}

export function countActiveAdmins(users: User[]): number {
  return users.filter((u) => u.isAdmin && u.isActive).length;
}

export function canToggleUserActive(
  targetUser: User,
  currentUserId: string,
  allUsers: User[]
): { allowed: boolean; reason?: string } {
  if (targetUser.id === currentUserId && targetUser.isActive) {
    return { allowed: false, reason: 'You cannot deactivate your own account.' };
  }
  if (targetUser.isAdmin && targetUser.isActive && countActiveAdmins(allUsers) <= 1) {
    return { allowed: false, reason: 'At least one active administrator is required.' };
  }
  return { allowed: true };
}

export function canDeleteUser(
  targetUser: User,
  currentUserId: string,
  allUsers: User[]
): { allowed: boolean; reason?: string } {
  if (targetUser.id === currentUserId) {
    return { allowed: false, reason: 'You cannot delete your own account.' };
  }
  if (targetUser.isAdmin && targetUser.isActive && countActiveAdmins(allUsers) <= 1) {
    return { allowed: false, reason: 'At least one active administrator is required.' };
  }
  return { allowed: true };
}

export function validateUserForm(
  input: {
    name: string;
    username: string;
    password: string;
    confirmPassword: string;
    isAdmin: boolean;
    isActive: boolean;
  },
  existingUsers: User[],
  options: {
    editingUser?: User | null;
    currentUserId?: string;
  } = {}
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const { editingUser, currentUserId } = options;

  if (!input.name.trim()) {
    errors.name = 'Full name is required.';
  }

  const normalizedUsername = input.username.trim().toLowerCase();
  if (!normalizedUsername) {
    errors.username = 'Username is required.';
  } else if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
    errors.username = 'Username can only contain letters, numbers, dots, underscores, or hyphens.';
  } else if (
    existingUsers.some(
      (u) =>
        u.username.toLowerCase() === normalizedUsername && u.id !== editingUser?.id
    )
  ) {
    errors.username = 'This username is already taken.';
  }

  const isEditing = Boolean(editingUser);
  const hasPasswordInput = input.password.length > 0 || input.confirmPassword.length > 0;
  if (!isEditing || hasPasswordInput) {
    if (input.password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }
    if (input.confirmPassword !== input.password) {
      errors.confirmPassword = 'Passwords do not match.';
    }
  }

  if (editingUser) {
    if (editingUser.id === currentUserId && !input.isActive) {
      errors.isActive = 'You cannot deactivate your own account.';
    }
    const wasActiveAdmin = editingUser.isAdmin && editingUser.isActive;
    const willBeActiveAdmin = input.isAdmin && input.isActive;
    if (wasActiveAdmin && !willBeActiveAdmin && countActiveAdmins(existingUsers) <= 1) {
      errors.isAdmin = 'At least one active administrator is required.';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validatePasswordResetForm(
  password: string,
  confirmPassword: string
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }
  if (confirmPassword !== password) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateOwnPasswordChangeForm(
  oldPassword: string,
  newPassword: string,
  confirmPassword: string
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!oldPassword) {
    errors.oldPassword = 'Current password is required.';
  }
  if (newPassword.length < 6) {
    errors.newPassword = 'New password must be at least 6 characters.';
  }
  if (confirmPassword !== newPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
