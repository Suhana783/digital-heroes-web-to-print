import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductionBlockReason } from './adminProductionService.js';

const order = { payment_status: 'paid' };
const proof = { id: 'proof-current', status: 'approved' };

test('production readiness requires the latest proof to be approved', () => {
  assert.equal(getProductionBlockReason(order, { ...proof, status: 'changes_requested' }, []), 'proof');
  assert.equal(getProductionBlockReason(order, null, []), 'proof');
});

test('production readiness requires verified payment and a validated file linked to that proof', () => {
  assert.equal(getProductionBlockReason({ payment_status: 'pending' }, proof, []), 'payment');
  assert.equal(getProductionBlockReason(order, proof, [{ generation_status: 'draft_unvalidated', approved_proof_id: proof.id }]), 'print_file');
  assert.equal(getProductionBlockReason(order, proof, [{ generation_status: 'production_ready', approved_proof_id: 'older-proof' }]), 'print_file');
  assert.equal(getProductionBlockReason(order, proof, [{ generation_status: 'production_ready', approved_proof_id: proof.id }]), null);
});
