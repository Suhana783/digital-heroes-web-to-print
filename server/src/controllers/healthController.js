export function getHealth(_request, response) {
  response.status(200).json({
    success: true,
    message: 'Digital Heroes API is running',
  });
}
