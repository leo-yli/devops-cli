export class DopsError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public readonly context?: unknown
  ) {
    super(message);
    this.name = 'DopsError';
  }
}

export class AuthError extends DopsError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTH_REQUIRED', 401);
    this.name = 'AuthError';
  }
}

export class PermissionError extends DopsError {
  constructor(message = 'Permission denied') {
    super(message, 'PERMISSION_DENIED', 403);
    this.name = 'PermissionError';
  }
}

export class ApiError extends DopsError {
  constructor(message: string, statusCode?: number, context?: unknown) {
    super(message, 'API_ERROR', statusCode, context);
    this.name = 'ApiError';
  }
}
