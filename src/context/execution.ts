import hyperid from 'hyperid';

const generateId = hyperid();

export class Execution {
  id: string;
  type: string;
  store: Map<string, string | number>;
  headers: Map<string, string | number>;

  constructor(type: string) {
    this.id = generateId();
    this.type = type;
    this.store = new Map<string, string>();
    this.headers = new Map<string, string>();
  }
}
