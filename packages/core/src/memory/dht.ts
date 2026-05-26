export class DistributedHashTable {
  async store(key: string, value: any): Promise<void> {
    console.log(`Storing ${key} in DHT (stub)`);
  }
  async get(key: string): Promise<any> {
    console.log(`Getting ${key} from DHT (stub)`);
    return null;
  }
}
