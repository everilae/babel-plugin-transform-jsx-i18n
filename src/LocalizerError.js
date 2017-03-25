// For instanceof compatibility
export default function LocalizerError(message) {
  this.message = message;
  this.stack = (new Error()).stack;
}

LocalizerError.prototype = new Error();

