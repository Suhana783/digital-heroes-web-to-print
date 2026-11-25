import {
  adminArtworkDownload,
  adminPrintDownload,
  adminProofDownload,
  createProofVersion,
  customerProofDownload,
  generatePrintFile,
  getAdminProofItem,
  listAdminProofQueue,
  listCustomerOrderProofs,
  respondToProof,
  validatePrintFile,
} from '../services/proofService.js';

async function sendLink(response, work) {
  const data = await work();
  response.status(200).json({ success: true, message: 'Secure download link created', data });
}

export async function getAdminProofQueue(_request, response, next) {
  try {
    const data = await listAdminProofQueue();
    response.status(200).json({ success: true, message: 'Proof queue retrieved', data });
  } catch (error) { next(error); }
}

export async function getAdminProofItemDetails(request, response, next) {
  try {
    const data = await getAdminProofItem(request.params.orderItemId);
    response.status(200).json({ success: true, message: 'Order item proof details retrieved', data });
  } catch (error) { next(error); }
}

export async function postAdminProof(request, response, next) {
  try {
    const data = await createProofVersion({ orderItemId: request.params.orderItemId, adminId: request.user.id, input: request.proofInput });
    response.status(201).json({ success: true, message: `Proof version ${data.version_number} sent to the customer`, data });
  } catch (error) { next(error); }
}

export async function postGeneratedPrintFile(request, response, next) {
  try {
    const data = await generatePrintFile({ orderItemId: request.params.orderItemId, adminId: request.user.id });
    response.status(201).json({ success: true, message: 'Unvalidated production draft generated from the latest approved proof', data });
  } catch (error) { next(error); }
}

export async function postValidatePrintFile(request, response, next) {
  try {
    const data = await validatePrintFile(request.params.printFileId);
    response.status(200).json({ success: true, message: 'Production PDF passed structural validation', data });
  } catch (error) { next(error); }
}

export async function getCustomerProofs(request, response, next) {
  try {
    const data = await listCustomerOrderProofs(request.userSupabase, request.user.id, request.params.orderId);
    response.status(200).json({ success: true, message: 'Order proofs retrieved', data });
  } catch (error) { next(error); }
}

export async function postCustomerProofResponse(request, response, next) {
  try {
    const data = await respondToProof(request.userSupabase, request.params.proofId, request.body.decision, request.body.feedback);
    response.status(200).json({ success: true, message: request.body.decision === 'approved' ? 'Proof approved' : 'Change request sent', data });
  } catch (error) { next(error); }
}

export async function getCustomerProofDownload(request, response, next) {
  try { await sendLink(response, () => customerProofDownload(request.userSupabase, request.params.proofId)); }
  catch (error) { next(error); }
}

export async function getAdminProofDownload(request, response, next) {
  try { await sendLink(response, () => adminProofDownload(request.params.proofId)); }
  catch (error) { next(error); }
}

export async function getAdminArtworkDownload(request, response, next) {
  try { await sendLink(response, () => adminArtworkDownload(request.params.artworkId)); }
  catch (error) { next(error); }
}

export async function getAdminPrintDownload(request, response, next) {
  try { await sendLink(response, () => adminPrintDownload(request.params.printFileId)); }
  catch (error) { next(error); }
}
