import test from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '../types/lab';
import {
  canDeleteUser,
  canFullAccessPage,
  canToggleUserActive,
  canViewPage,
  createEmptyPermissions,
  createFullPermissions,
  getFirstAllowedPath,
  getPermissionSummary,
  normalizePermissions,
  PERMISSION_PRESETS,
  resolveSchemaPageRows,
  validateOwnPasswordChangeForm,
  validatePasswordResetForm,
  validateUserForm,
} from './auth';

function makeAdmin(overrides: Partial<User> = {}): User {
  return {
    id: 'usr-admin',
    name: 'Administrator',
    username: 'admin',
    isAdmin: true,
    isActive: true,
    permissions: createFullPermissions(),
    ...overrides,
  };
}

test('resolveSchemaPageRows uses schema.pages dynamically and falls back safely', () => {
  const fallback = resolveSchemaPageRows(undefined);
  assert.equal(fallback.length, 8);
  assert.equal(fallback[0].key, 'dashboard');
  assert.equal(fallback[0].label, 'Dashboard');

  const fromStrings = resolveSchemaPageRows(['dashboard', 'lostOrders', 'customAudit', 'dashboard']);
  assert.deepEqual(fromStrings, [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'lostOrders', label: 'Lost Orders' },
    { key: 'customAudit', label: 'customAudit' },
  ]);

  const fromObjects = resolveSchemaPageRows([
    { key: 'reports', label: 'Reports' },
    { key: 'qaLab', label: 'QA Lab' },
  ]);
  assert.deepEqual(fromObjects, [
    { key: 'reports', label: 'Reports' },
    { key: 'qaLab', label: 'QA Lab' },
  ]);
});

test('effective permissions treat active admins as full access on all pages', () => {
  const admin = makeAdmin();
  assert.equal(canViewPage(admin, 'reports'), true);
  assert.equal(canFullAccessPage(admin, 'reports'), true);
  assert.equal(getPermissionSummary(admin), 'Admin');

  const viewUser: User = {
    id: 'usr-2',
    name: 'Viewer User',
    username: 'viewer',
    isAdmin: false,
    isActive: true,
    permissions: normalizePermissions({
      dashboard: 'view',
      samples: 'full',
    }),
  };
  assert.equal(canViewPage(viewUser, 'dashboard'), true);
  assert.equal(canFullAccessPage(viewUser, 'dashboard'), false);
  assert.equal(canFullAccessPage(viewUser, 'samples'), true);
  assert.equal(canViewPage(viewUser, 'reports'), false);
  assert.equal(getFirstAllowedPath(viewUser), '/');
  assert.equal(getPermissionSummary(viewUser), '1 full · 1 view');

  const emptyUser: User = { ...viewUser, permissions: createEmptyPermissions() };
  assert.equal(getFirstAllowedPath(emptyUser), null);
  assert.equal(getPermissionSummary(emptyUser), 'No pages assigned');

  const inactiveAdmin = makeAdmin({ isActive: false });
  assert.equal(canViewPage(inactiveAdmin, 'dashboard'), false);
  assert.equal(canFullAccessPage(inactiveAdmin, 'dashboard'), false);
});

test('permission presets populate expected access levels', () => {
  const salesPreset = PERMISSION_PRESETS.find((p) => p.id === 'sales');
  assert.ok(salesPreset);
  assert.equal(salesPreset.permissions.lostOrders, 'full');
  assert.equal(salesPreset.permissions.testEntry, 'none');

  const viewAllPreset = PERMISSION_PRESETS.find((p) => p.id === 'viewAll');
  assert.ok(viewAllPreset);
  assert.equal(Object.values(viewAllPreset.permissions).every((v) => v === 'view'), true);
});

test('user form validation enforces unique usernames, password rules, and admin safety', () => {
  const admin = makeAdmin();

  const createBad = validateUserForm(
    {
      name: '',
      username: 'ADMIN',
      password: '123',
      confirmPassword: '456',
      isAdmin: false,
      isActive: true,
    },
    [admin]
  );
  assert.equal(createBad.valid, false);
  assert.ok(createBad.errors.name);
  assert.ok(createBad.errors.username);
  assert.ok(createBad.errors.password);
  assert.ok(createBad.errors.confirmPassword);

  const editAdminBad = validateUserForm(
    {
      name: 'Administrator',
      username: 'admin',
      password: '',
      confirmPassword: '',
      isAdmin: false,
      isActive: false,
    },
    [admin],
    { editingUser: admin, currentUserId: admin.id }
  );
  assert.equal(editAdminBad.valid, false);
  assert.ok(editAdminBad.errors.isActive);
  assert.ok(editAdminBad.errors.isAdmin);

  const editAdminOk = validateUserForm(
    {
      name: 'Lab Admin',
      username: 'admin',
      password: '',
      confirmPassword: '',
      isAdmin: true,
      isActive: true,
    },
    [admin],
    { editingUser: admin, currentUserId: admin.id }
  );
  assert.equal(editAdminOk.valid, true);
});

test('cannot delete or deactivate self or last active admin, and password validators work', () => {
  const admin = makeAdmin();
  assert.equal(canToggleUserActive(admin, admin.id, [admin]).allowed, false);
  assert.equal(canDeleteUser(admin, admin.id, [admin]).allowed, false);

  const otherViewer: User = {
    id: 'usr-2',
    name: 'Viewer',
    username: 'viewer',
    isAdmin: false,
    isActive: true,
    permissions: createEmptyPermissions(),
  };
  assert.equal(canToggleUserActive(otherViewer, admin.id, [admin, otherViewer]).allowed, true);
  assert.equal(canDeleteUser(otherViewer, admin.id, [admin, otherViewer]).allowed, true);
  assert.equal(canToggleUserActive(admin, 'usr-other-admin', [admin]).allowed, false);

  const resetBad = validatePasswordResetForm('12345', '12345');
  assert.equal(resetBad.valid, false);
  assert.ok(resetBad.errors.password);

  const ownBad = validateOwnPasswordChangeForm('', '123', '456');
  assert.equal(ownBad.valid, false);
  assert.ok(ownBad.errors.oldPassword);
  assert.ok(ownBad.errors.newPassword);
  assert.ok(ownBad.errors.confirmPassword);

  const ownOk = validateOwnPasswordChangeForm('admin123', 'StrongPass9', 'StrongPass9');
  assert.equal(ownOk.valid, true);
});
