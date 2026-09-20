import { Schema, model, Document, Types } from 'mongoose';
import type { Kit } from '@prep-kit/core';
import type { KitMeta } from '@prep-kit/core';

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
  },
  { timestamps: true },
);

export const KitDocument = model<KitDocumentData>('KitDocument', kitDocumentSchema);
