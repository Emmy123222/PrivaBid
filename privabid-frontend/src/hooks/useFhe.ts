/**
 * Thin aliases over @cofhe/react exports (SDK uses useCofhe* names).
 * - useEncrypt → useCofheEncrypt (encrypt inputs for FHE txs)
 * - useDecrypt → useCofheReadContractAndDecrypt (read + unseal view/pure)
 */
export { useCofheEncrypt as useEncrypt } from "@cofhe/react";
export { useCofheReadContractAndDecrypt as useDecrypt } from "@cofhe/react";
