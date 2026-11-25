export function checkAdminAccess(request, response) {
  response.status(200).json({
    success: true,
    message: 'Admin authorization verified',
    data: { userId: request.user.id, role: request.user.role },
  });
}
