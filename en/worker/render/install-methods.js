// Adds the methods of each mixin object to a class prototype, exactly as if they had been written in the class
// body: not enumerable, writable, configurable. A method name defined twice is an error.
export function installMethods(target, ...mixins) {
  for (const mixin of mixins) {
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(mixin))) {
      if (Object.prototype.hasOwnProperty.call(target.prototype, name)) throw new Error(`Renderer method defined twice: ${name}`);
      Object.defineProperty(target.prototype, name, { ...descriptor, enumerable: false });
    }
  }
}
