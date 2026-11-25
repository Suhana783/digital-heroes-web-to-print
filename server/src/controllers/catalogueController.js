import { getActiveDivisions, getProductDetails, getProductsByDivisionSlug } from '../services/catalogueService.js';

export async function listDivisions(_request, response, next) {
  try {
    const divisions = await getActiveDivisions();
    response.status(200).json({ success: true, message: 'Divisions retrieved successfully', data: divisions });
  } catch (error) {
    next(error);
  }
}

export async function listDivisionProducts(request, response, next) {
  try {
    const result = await getProductsByDivisionSlug(request.params.divisionSlug);
    if (!result) {
      return response.status(404).json({ success: false, message: 'Product division not found' });
    }
    const message = result.products.length
      ? 'Products retrieved successfully'
      : 'No active products are available in this division yet';
    response.status(200).json({ success: true, message, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getDivisionProduct(request, response, next) {
  try {
    const product = await getProductDetails(request.params.divisionSlug, request.params.productSlug);
    if (!product) {
      return response.status(404).json({ success: false, message: 'Product not found in this division' });
    }
    response.status(200).json({ success: true, message: 'Product retrieved successfully', data: product });
  } catch (error) {
    next(error);
  }
}
