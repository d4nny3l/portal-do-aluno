import { createScopeKeyEnvelopes, fingerprintPublicKey, serializeIdentityPublicKey, unwrapScopeKey } from "./key-wrapping.js";
import { validateEnvelopeContext } from "./crypto-format.js";

export async function provisionScopeForRecipients({ tenantId, scopeId, keyVersion, recipients }) {
  if (!Array.isArray(recipients) || recipients.length === 0) throw new TypeError("Authorized recipients are required.");
  const seen = new Set();
  for (const recipient of recipients) {
    if (!recipient || typeof recipient.recipientId !== "string" || !(recipient.publicKey instanceof CryptoKey)) {
      throw new TypeError("Each recipient needs a verified identity and public key.");
    }
    if (seen.has(recipient.recipientId)) throw new TypeError("Duplicate scope recipient.");
    seen.add(recipient.recipientId);
    if (typeof recipient.confirmedFingerprint !== "string") {
      throw new Error("Public-key fingerprint confirmation is required before sharing.");
    }
    const rawPublicKey = await serializeIdentityPublicKey(recipient.publicKey);
    const actualFingerprint = await fingerprintPublicKey(rawPublicKey);
    if (actualFingerprint !== recipient.confirmedFingerprint.toLowerCase()) {
      throw new Error("The recipient identity fingerprint does not match the confirmed value.");
    }
  }
  const result = await createScopeKeyEnvelopes({
    recipientPublicKeys: recipients.map(({ recipientId, publicKey }) => ({ recipientId, publicKey })),
    tenantId,
    scopeId,
    keyVersion
  });
  result.envelopes.forEach(envelope => validateEnvelopeContext({
    tenantId: envelope.tenant_id,
    scopeId: envelope.scope_id,
    recipientId: envelope.recipient_id,
    keyVersion: envelope.key_version
  }));
  return result;
}

export { unwrapScopeKey };
