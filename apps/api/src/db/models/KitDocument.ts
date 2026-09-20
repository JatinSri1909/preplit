import { Schema, model, Document, Types } from 'mongoose';
import type { Kit, KitMeta, PracticeState } from '@prep-kit/core';

export type KitStatus = 'generating' | 'ready' | 'failed';

export interface KitDocumentData extends Document {
  userId: Types.ObjectId;
  status: KitStatus;
  error?: string;
  // Appendix A shape, validated with validateKit() before every save —
  // NOT re-validated at the Mongoose schema level, since the schema
  // itself must not silently coerce/strip fields that structural grading
  // depends on. Stored as Mixed; validateKit() is the source of truth.
  kit: Kit | null;
  // Builder provenance state (brief Section 6) — never sent to the
  // grader, only used by this app's own edit/regenerate UI.
  meta: KitMeta | null;
  // Flashcard confidence history (brief Section 7). Kept beside the kit
  // rather than inside it for the same reason as `meta`: Appendix A has no
  // field for it, and the kit body is structurally graded.
  practice: PracticeState;
  // The request this kit was generated from. Stored so a section can be
  // regenerated later without asking the user to paste the description
  // again.
  input: { jd: string; company_url: string; days: number };
  // sha256 of (userId, company_url, jd) — see routes for how resubmitting
  // the same posting is handled.
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

const kitDocumentSchema = new Schema<KitDocumentData>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['generating', 'ready', 'failed'], default: 'generating' },
    error: { type: String },
    kit: { type: Schema.Types.Mixed, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
    practice: { type: Schema.Types.Mixed, default: () => ({}) },
    input: { type: Schema.Types.Mixed, required: true },
    fingerprint: { type: String, required: true, index: true },
  },
  { timestamps: true },
);

export const KitDocument = model<KitDocumentData>('KitDocument', kitDocumentSchema);
