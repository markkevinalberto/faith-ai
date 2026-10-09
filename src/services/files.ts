/**
 * Private file storage for attachments and temporary exports.
 * Attachments live in the app's private documents directory; the DB stores only relative paths.
 * Exports are written to the cache, handed to the system share sheet at the user's request, then deleted.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { newId } from '../lib/id';

const DOCS_ROOT = 'documents';
const SAFE_PATH = /^documents\/[A-Za-z0-9-]{8,64}\/[A-Za-z0-9-]{8,64}\.[a-z0-9]{1,8}$/;

export function assertSafeRelativePath(relativePath: string): void {
  if (!SAFE_PATH.test(relativePath)) throw new Error('Invalid document path');
}

export function documentFile(relativePath: string): File {
  assertSafeRelativePath(relativePath);
  return new File(Paths.document, relativePath);
}

export interface StoredDocument {
  title: string;
  relativePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

/** Lets the user pick a PDF or image and copies it into private storage for `profileId`. */
export async function pickAndStoreDocument(profileId: string): Promise<StoredDocument | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.[0]) return null;
  const asset = picked.assets[0];
  const dir = new Directory(Paths.document, DOCS_ROOT, profileId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const ext = (/\.([A-Za-z0-9]{1,8})$/.exec(asset.name)?.[1] ?? (asset.mimeType === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
  const fileName = `${newId()}.${ext}`;
  const dest = new File(dir, fileName);
  const src = new File(asset.uri);
  await src.copy(dest);
  try {
    src.delete();
  } catch {
    // The picker's cache copy is cleared by the OS eventually.
  }
  return { title: asset.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Document', relativePath: `${DOCS_ROOT}/${profileId}/${fileName}`, mimeType: asset.mimeType ?? null, sizeBytes: dest.size };
}

export function deleteDocumentFile(relativePath: string): void {
  const f = documentFile(relativePath);
  if (f.exists) f.delete();
}

export function deleteProfileDocuments(profileId: string): void {
  const dir = new Directory(Paths.document, DOCS_ROOT, profileId);
  if (dir.exists) dir.delete();
}

export function deleteAllDocuments(): void {
  const dir = new Directory(Paths.document, DOCS_ROOT);
  if (dir.exists) dir.delete();
}

/** Opens an attachment in another app chosen by the user (explicit action). */
export async function openDocument(relativePath: string, mimeType: string | null): Promise<void> {
  const f = documentFile(relativePath);
  if (!f.exists) throw new Error('The attached file is missing.');
  await Sharing.shareAsync(f.uri, { mimeType: mimeType ?? undefined });
}

/** Writes a temporary export file, opens the share sheet, and deletes the file afterwards. */
export async function shareExport(fileName: string, content: string, mimeType: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const f = new File(dir, fileName);
  if (f.exists) f.delete();
  f.create();
  f.write(content);
  try {
    await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: 'Export FAITH data' });
  } finally {
    try {
      f.delete();
    } catch {
      // ignore
    }
  }
}

export function clearExportCache(): void {
  const dir = new Directory(Paths.cache, 'exports');
  if (dir.exists) dir.delete();
}
