import {
  createCustomerDesign,
  deleteCustomerDesign,
  downloadCustomerDesignAsset,
  getCustomerDesign,
  listAdminTemplateProducts,
  listAdminTemplates,
  listAvailableTemplates,
  listCustomerDesigns,
  listDesignerProducts,
  saveProductTemplate,
  updateCustomerDesign,
  uploadCustomerDesignAsset,
} from '../services/designerService.js';

export async function getDesignerProducts(_request, response, next) {
  try { response.status(200).json({ success: true, message: 'Available products retrieved', data: await listDesignerProducts() }); }
  catch (error) { next(error); }
}

export async function getAvailableProductTemplates(request, response, next) {
  try {
    const data = await listAvailableTemplates(request.query.productId);
    response.status(200).json({ success: true, message: 'Available templates retrieved', data });
  } catch (error) { next(error); }
}

export async function getAdminTemplates(_request, response, next) {
  try { response.status(200).json({ success: true, message: 'Templates retrieved', data: await listAdminTemplates() }); }
  catch (error) { next(error); }
}

export async function getAdminTemplateProducts(_request, response, next) {
  try { response.status(200).json({ success: true, message: 'Products retrieved', data: await listAdminTemplateProducts() }); }
  catch (error) { next(error); }
}

export async function postAdminTemplate(request, response, next) {
  try {
    const data = await saveProductTemplate(request.body);
    response.status(201).json({ success: true, message: 'Template created', data });
  } catch (error) { next(error); }
}

export async function putAdminTemplate(request, response, next) {
  try {
    const data = await saveProductTemplate(request.body, request.params.templateId);
    response.status(200).json({ success: true, message: 'Template saved', data });
  } catch (error) { next(error); }
}

export async function getMyDesigns(request, response, next) {
  try { response.status(200).json({ success: true, message: 'Saved designs retrieved', data: await listCustomerDesigns(request.user.id) }); }
  catch (error) { next(error); }
}

export async function postDesign(request, response, next) {
  try {
    const data = await createCustomerDesign(request.user.id, request.body || {});
    response.status(201).json({ success: true, message: 'Design created', data });
  } catch (error) { next(error); }
}

export async function getDesign(request, response, next) {
  try {
    const data = await getCustomerDesign(request.user.id, request.params.designId);
    response.status(200).json({ success: true, message: 'Design retrieved', data });
  } catch (error) { next(error); }
}

export async function putDesign(request, response, next) {
  try {
    const data = await updateCustomerDesign(request.user.id, request.params.designId, request.body || {});
    response.status(200).json({ success: true, message: 'Design saved', data });
  } catch (error) { next(error); }
}

export async function removeDesign(request, response, next) {
  try {
    await deleteCustomerDesign(request.user.id, request.params.designId);
    response.status(200).json({ success: true, message: 'Design deleted', data: { id: request.params.designId } });
  } catch (error) { next(error); }
}

export async function postDesignAsset(request, response, next) {
  try {
    const data = await uploadCustomerDesignAsset(request.user.id, request.params.designId, request.designAssetInput);
    response.status(201).json({ success: true, message: data.is_previewable ? 'Image uploaded and ready to place' : 'Original file saved; this format is not editable on the canvas', data });
  } catch (error) { next(error); }
}

export async function getDesignAssetDownload(request, response, next) {
  try {
    const data = await downloadCustomerDesignAsset(request.user.id, request.params.designId, request.params.assetId);
    response.status(200).json({ success: true, message: 'Secure design-file link created', data });
  } catch (error) { next(error); }
}
