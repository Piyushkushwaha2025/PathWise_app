/**
 * Shim for react-dom — React Native mein react-dom nahi hota.
 * @clerk/clerk-react ke kuch parts isko import karte hain,
 * isliye ek khaali stub provide karte hain.
 */
module.exports = {
  createPortal: (children) => children,
  findDOMNode: () => null,
  flushSync: (fn) => fn(),
  render: () => null,
  unmountComponentAtNode: () => false,
};
