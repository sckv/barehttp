export class CustomMap<K, V> extends Map<K, V> {
  set(key: K, value: V) {
    if (this.get(key)) {
      console.log(`Rewriting a defined route ${key}`);
    }
    return super.set(key, value);
  }
}
