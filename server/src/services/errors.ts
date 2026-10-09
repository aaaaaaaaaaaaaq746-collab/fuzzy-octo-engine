export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'REQUEST_FAILED',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
