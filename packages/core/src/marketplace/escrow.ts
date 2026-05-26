import { TokenLedger } from "./token.js";

export class EscrowContract {
  private deposits: Map<string, { from: string; to: string; amount: number; released: boolean }> = new Map();

  create(contractId: string, from: string, to: string, amount: number) {
    this.deposits.set(contractId, { from, to, amount, released: false });
  }

  release(contractId: string, ledger: TokenLedger): boolean {
    const contract = this.deposits.get(contractId);
    if (!contract || contract.released) return false;
    const success = ledger.transfer(contract.from, contract.to, contract.amount);
    if (success) {
      contract.released = true;
      return true;
    }
    return false;
  }
}
