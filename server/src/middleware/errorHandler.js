export function notFoundHandler(request, response, next) {
  const error = new Error(`Route not found: ${request.method} ${request.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

export function errorHandler(error, _request, response, _next) {
  const statusCode = Number(error.statusCode) || 500;
  response.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? (error.publicMessage || 'The requested service is temporarily unavailable') : error.message,
  });
}
