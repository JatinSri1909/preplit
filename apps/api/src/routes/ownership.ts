export class ForbiddenError extends Error {
  constructor(message = 'You do not have access to this kit.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * "Users can read and modify only their own kits" (brief Section 1).
 * Pulled out as a pure function so the ownership rule itself is unit
 * tested independently of Mongo.
 */
export function assertOwnsKit(kitOwnerId: string, requestingUserId: string): void {
  if (kitOwnerId !== requestingUserId) {
    throw new ForbiddenError();
  }
}
