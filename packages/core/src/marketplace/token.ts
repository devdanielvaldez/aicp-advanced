export class TokenLedger {
  private balances: Map<string, number> = new Map();

  constructor(initialBalances: Map<string, number>) {
    this.balances = initialBalances;
  }

  getBalance(account: string): number {
    return this.balances.get(account) || 0;
  }

  transfer(from: string, to: string, amount: number): boolean {
    const fromBalance = this.getBalance(from);
    if (fromBalance < amount) return false;
    this.balances.set(from, fromBalance - amount);
    this.balances.set(to, (this.balances.get(to) || 0) + amount);
    return true;
  }

  mint(account: string, amount: number) {
    this.balances.set(account, (this.balances.get(account) || 0) + amount);
  }
}
