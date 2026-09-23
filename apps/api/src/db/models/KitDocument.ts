import { Schema, model, Document, Types } from 'mongoose';
import {
  PIPELINE_STEPS,
  type Kit,
  type KitMeta,
  type PipelineStep,
  type PracticeState,
  type ResumeMatch,
} from '@prep-kit/core';

export type KitStatus = 'generating' | 'ready' | 'failed';

export interface KitDocumentData extends Document {
  userId: Types.ObjectId;
  status: KitStatus;
  error?: string;
  // Which of PIPELINE_STEPS the background job is currently on — null
  // before the first step starts and once generation finishes. This is
  // what makes the "Building your kit" list in the UI a genuine progress
  // report instead of a canned animation; see kitGeneration.ts's onStep.
  step: PipelineStep | null;
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
  // Optional creativity feature: how well an uploaded resume addresses this
  // kit's requirements. Also outside Appendix A, never sent to the grader —
  // same reasoning as `meta`/`practice`. One resume per kit; re-uploading
  // replaces it. Only the match verdicts are kept, never the resume text
  // itself (see matchResumeToRequirements's caller in builderRoutes.ts).
  resumeMatch: ResumeMatch | null;
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
    step: { type: String, enum: PIPELINE_STEPS, default: null },
    kit: { type: Schema.Types.Mixed, default: null },
    meta: { type: Schema.Types.Mixed, default: null },
    practice: { type: Schema.Types.Mixed, default: () => ({}) },
    resumeMatch: { type: Schema.Types.Mixed, default: null },
    input: { type: Schema.Types.Mixed, required: true },
    fingerprint: { type: String, required: true, index: true },
  },
  // Builder edits are read-then-mutate-then-save on this whole document, and
  // `kit`/`meta`/`practice` are plain Mixed blobs rather than arrays, so
  // Mongoose's default versioning wouldn't otherwise catch two concurrent
  // saves clobbering each other — this makes save() reject with a
  // VersionError instead (see loadKit.ts's saveValidatedKit).
  { timestamps: true, optimisticConcurrency: true },
);

export const KitDocument = model<KitDocumentData>('KitDocument', kitDocumentSchema);
