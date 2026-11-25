import {
  createArtworkDownloadUrl,
  listOrderArtwork,
  uploadOrderArtwork,
} from '../services/artworkService.js';

export async function uploadArtwork(request, response, next) {
  try {
    const artwork = await uploadOrderArtwork({
      userClient: request.userSupabase,
      customerId: request.user.id,
      orderId: request.params.orderId,
      input: request.artworkInput,
    });
    response.status(201).json({ success: true, message: 'Artwork uploaded successfully', data: artwork });
  } catch (error) {
    next(error);
  }
}

export async function getOrderArtwork(request, response, next) {
  try {
    const artwork = await listOrderArtwork(request.userSupabase, request.user.id, request.params.orderId);
    response.status(200).json({ success: true, message: artwork.length ? 'Artwork retrieved successfully' : 'No artwork uploaded', data: artwork });
  } catch (error) {
    next(error);
  }
}

export async function getArtworkDownloadUrl(request, response, next) {
  try {
    const result = await createArtworkDownloadUrl(request.userSupabase, request.user.id, request.params.artworkId);
    response.status(200).json({ success: true, message: 'Secure download link created', data: result });
  } catch (error) {
    next(error);
  }
}
