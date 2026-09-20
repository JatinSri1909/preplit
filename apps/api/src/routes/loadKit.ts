import type { Request, Response } from 'express';
import { validateKit } from '@prep-kit/core';
import { KitDocument, KitDocumentData } from '../db/models/KitDocument.js';
import { assertOwnsKit, ForbiddenError } from './ownership.js';

/**
 * Every mutating route needs the same four checks before it can touch a
 * kit: it exists, the caller owns it, it has finished generating, and the
 * change they are about to make leaves it structurally valid. Centralised
 * here so a new route cannot quietly skip one — the ownership check in
 * particular is the whole of "users can read and modify only their own
 * kits" (brief Section 1).
 *
 * Returns null after having already sent a response, so callers do
 * `const doc = await requireOwnedKit(req, res); if (!doc) return;`
 */
export async function requireOwnedKit(
  req: Request,
  res: Response,
): Promise<KitDocumentData | null> {
  const doc = await KitDocument.findById(req.params.id).catch(() => null);
  if (!doc) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found.' } });
    return null;
  }
  try {
    assertOwnsKit(doc.userId.toString(), req.userId!);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      // Deliberately 404, not 403: a 403 confirms to a signed-in stranger
      // that this kit id exists and belongs to someone. Nothing the caller
      // can legitimately do differs between the two cases.
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found.' } });
      return null;
    }
    throw err;
  }
  if (doc.status !== 'ready' || !doc.kit || !doc.meta) {
    res.status(409).json({
      error: { code: 'KIT_NOT_READY', message: `This kit is ${doc.status}, so it cannot be edited yet.` },
    });
    return null;
  }
  return doc;
}

/**
 * Persist a kit edit, refusing the save if the edit would break Appendix A.
 *
 * The brief asks for a kit validated "against the expected structure
 * before saving it" — and that has to cover user edits too, not just
 * pipeline output. Deleting a scheduled question or clearing a required
 * field are both one keystroke away in the Builder, and a kit that fails
 * structural grading is worth less than a rejected edit.
 */
export async function saveValidatedKit(
  doc: KitDocumentData,
  res: Response,
): Promise<boolean> {
  const { valid, errors } = validateKit(doc.kit);
  if (!valid) {
    res.status(422).json({
      error: {
        code: 'KIT_WOULD_BE_INVALID',
        message: 'That change would leave the kit structurally invalid, so it was not saved.',
        details: errors,
      },
    });
    return false;
  }
  doc.markModified('kit');
  doc.markModified('meta');
  doc.markModified('practice');
  await doc.save();
  return true;
}
