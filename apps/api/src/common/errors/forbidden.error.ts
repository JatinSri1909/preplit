export class ForbiddenError extends Error {
  constructor(message = 'You do not have access to this kit.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}
